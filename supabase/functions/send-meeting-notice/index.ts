import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.9.16";
const allowed = new Set([
  "https://www.cvoa.one",
  "https://cvoa.one",
  "http://localhost:5173",
]);
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "",
    headers = {
      "Content-Type": "application/json",
      ...(allowed.has(origin)
        ? {
            "Access-Control-Allow-Origin": origin,
            Vary: "Origin",
            "Access-Control-Allow-Headers":
              "authorization,apikey,content-type,x-client-info",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
          }
        : {}),
    };
  const reply = (code: number, data: unknown) =>
    new Response(JSON.stringify(data), { status: code, headers });
  if (origin && !allowed.has(origin))
    return reply(403, { error: "Origin not allowed" });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { error: "POST required" });
  const sender = Deno.env.get("WORKSPACE_EMAIL"),
    password = Deno.env.get("WORKSPACE_APP_PASSWORD");
  if (!sender || !password)
    return reply(503, {
      error: "Google Workspace sending credentials are not configured",
    });
  const auth = req.headers.get("Authorization") || "";
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const {
    data: { user },
    error: authError,
  } = await caller.auth.getUser();
  if (authError || !user) return reply(401, { error: "Sign in required" });
  try {
    const body = await req.json();
    if (typeof body.session_id !== "string")
      return reply(400, { error: "Meeting required" });
    const prepared = await caller.rpc("uro_prepare_notice", {
      p_session: body.session_id,
    });
    if (prepared.error) return reply(403, { error: prepared.error.message });
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const job = await admin
      .from("uro_notice_jobs")
      .select("*")
      .eq("id", prepared.data)
      .single();
    if (job.error) throw job.error;
    const rows = await admin
      .from("uro_notice_deliveries")
      .select("*")
      .eq("job_id", job.data.id)
      .eq("state", "pending");
    if (rows.error) throw rows.error;
    const smtp = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: sender, pass: password },
    });
    const m = job.data.payload;
    for (const d of rows.data) {
      // Atomic claim prevents simultaneous requests from sending the same delivery.
      const claim = await admin
        .from("uro_notice_deliveries")
        .update({ state: "sending" })
        .eq("job_id", d.job_id)
        .eq("participant_id", d.participant_id)
        .eq("state", "pending")
        .select("participant_id");
      if (claim.error) throw claim.error;
      if (!claim.data.length) continue;
      try {
        await smtp.sendMail({
          from: `CVOA <${sender}>`,
          to: d.email,
          subject: `Meeting notice: ${m.title.replace(/[\r\n]/g, " ")}`,
          text: `${m.title}\nScheduled: ${m.scheduled_at}\nLocation: ${m.location || "See packet"}\nPurpose: ${m.purpose || "Regular business"}\n\nReview the packet and RSVP after signing in:\nhttps://www.cvoa.one/meetings/session/${m.id}\n\nSource documents retain their individual access permissions.`,
        });
        const recorded = await admin
          .from("uro_notice_deliveries")
          .update({
            state: "sent",
            sent_at: new Date().toISOString(),
            failure: null,
          })
          .eq("job_id", d.job_id)
          .eq("participant_id", d.participant_id);
        if (recorded.error) throw recorded.error;
      } catch {
        await admin
          .from("uro_notice_deliveries")
          .update({
            state: "uncertain",
            failure:
              "Sending or delivery recording did not complete. Verify with the sender before arranging manual delivery; automatic retry is disabled.",
          })
          .eq("job_id", d.job_id)
          .eq("participant_id", d.participant_id);
      }
    }
    const finished = await admin.rpc("uro_finish_notice", {
      p_job: job.data.id,
    });
    if (finished.error) throw finished.error;
    return reply(200, finished.data);
  } catch {
    return reply(500, {
      error:
        "Notice delivery did not complete. Review delivery status before retrying.",
    });
  }
});
