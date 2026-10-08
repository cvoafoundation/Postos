// Invitations create a basic account. Staff authority is appointed separately.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.9.16";
import { welcomeAttachments } from '../_shared/welcome/packet.ts';
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL")!;
const WORKSPACE_EMAIL = Deno.env.get("WORKSPACE_EMAIL");
const WORKSPACE_APP_PASSWORD = Deno.env.get("WORKSPACE_APP_PASSWORD");
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return reply(405, { error: "Use POST to invite an account." });
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token)
      return reply(401, { error: "Sign in again before inviting an account." });
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const {
      data: { user: caller },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !caller)
      return reply(401, { error: "Sign in again before inviting an account." });
    const { data: permitted, error: permissionError } = await supabase.rpc(
      "cvoa_service_authorized",
      { p_actor: caller.id, p_post: null, p_capability: "national" },
    );
    if (permissionError || !permitted)
      return reply(403, { error: "National access administration required." });
    const body = (await req.json()) as {
      email?: string;
      full_name?: string;
      role?: string;
      post_id?: string | null;
      profile_id?: string;
    };
    if (body.profile_id) {
      const { data: profile, error: lookupError } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .eq("id", body.profile_id)
        .single();
      if (lookupError || !profile)
        return reply(404, {
          error: "Account profile not found. Review identity before sending.",
        });
      const { data: authAccount, error: accountError } =
        await supabase.auth.admin.getUserById(profile.id);
      if (
        accountError ||
        !authAccount?.user?.email ||
        authAccount.user.email.trim().toLowerCase() !==
          profile.email.trim().toLowerCase()
      )
        return reply(409, {
          error:
            "Account and login email differ. Review identity before sending a setup link.",
        });
      if (!WORKSPACE_EMAIL || !WORKSPACE_APP_PASSWORD)
        return reply(503, {
          error: "Configure Google Workspace email delivery before sending.",
        });
      const site = new URL(SITE_URL);
      if (!["https:", "http:"].includes(site.protocol))
        return reply(503, { error: "Configure SITE_URL for password setup." });
      const { data: setup, error: setupError } =
        await supabase.auth.admin.generateLink({
          type: authAccount.user.email_confirmed_at ? "recovery" : "invite",
          email: authAccount.user.email,
          options: { redirectTo: new URL("/set-password", site).href },
        });
      if (
        setupError ||
        !setup?.properties?.action_link ||
        setup.user?.id !== profile.id
      )
        return reply(409, {
          error:
            "Could not create a setup link for this account. No account permissions were changed.",
        });
      const link = setup.properties.action_link;
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: WORKSPACE_EMAIL,
          pass: WORKSPACE_APP_PASSWORD.replace(/\s/g, ""),
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });
      await transporter.sendMail({
        from: `CVOA.ONE <${WORKSPACE_EMAIL}>`,
        to: authAccount.user.email,
        subject: "Your CVOA.ONE password setup link",
        attachments: authAccount.user.email_confirmed_at ? [] : await welcomeAttachments(profile, 'invitation'),
        text: `Hi ${profile.full_name},\n\nSet up your password:\n\n${link}`,
        html: `<p>Hi ${escapeHtml(profile.full_name)},</p><p><a href="${escapeHtml(link)}">Set up your password</a></p>`,
      });
      return reply(200, { success: true });
    }
    if (
      typeof body.email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(body.email.trim()) ||
      typeof body.full_name !== "string" ||
      !body.full_name.trim() ||
      body.full_name.length > 200
    )
      return reply(400, { error: "Provide a name and valid email address." });
    if (!["guest_applicant", "member"].includes(body.role ?? "guest_applicant"))
      return reply(400, {
        error:
          "Invite a basic account, then review and assign staff authority in Accounts & Access.",
      });
    if (!WORKSPACE_EMAIL || !WORKSPACE_APP_PASSWORD)
      return reply(503, {
        error:
          "Configure Google Workspace email delivery before creating this invitation.",
      });
    const site = new URL(SITE_URL);
    if (!["https:", "http:"].includes(site.protocol))
      return reply(503, { error: "Configure SITE_URL for password setup." });
    const email = body.email.trim().toLowerCase();
    const { data: linkData, error: linkError } =
      await supabase.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo: new URL("/set-password", site).href },
      });
    if (linkError || !linkData?.user)
      return reply(400, {
        error:
          linkError?.message ??
          "Could not create invitation. If an account already exists, open its person record.",
      });
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: linkData.user.id,
        full_name: body.full_name.trim(),
        email,
        role: body.role ?? "guest_applicant",
        post_id: body.post_id ?? null,
      });
    if (profileError)
      return reply(500, {
        error: `The auth account exists, but its profile needs review: ${profileError.message}`,
      });
    const link = linkData.properties.action_link;
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: WORKSPACE_EMAIL,
        pass: WORKSPACE_APP_PASSWORD.replace(/\s/g, ""),
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    try {
      await transporter.sendMail({
        from: `CVOA.ONE <${WORKSPACE_EMAIL}>`,
        to: email,
        subject: "Your CVOA.ONE account invitation",
        attachments: await welcomeAttachments({ full_name: body.full_name.trim() }, 'invitation'),
        text: `Hi ${body.full_name.trim()},\n\nSet your password to access CVOA.ONE:\n\n${link}`,
        html: `<p>Hi ${escapeHtml(body.full_name.trim())},</p><p><a href="${escapeHtml(link)}">Set your password and access CVOA.ONE</a></p>`,
      });
    } catch {
      return reply(502, {
        error:
          "Account created, but email delivery failed. Open the person record to review activation; no staff authority was granted.",
      });
    }
    return reply(200, { success: true });
  } catch {
    return reply(500, {
      error:
        "Could not finish this invitation. Review the account directory before retrying.",
    });
  }
});
