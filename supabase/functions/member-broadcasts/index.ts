import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.9.16";
import { Buffer } from "node:buffer";
import {
  MAX_TOTAL,
  MEDIA,
  prepareBroadcast,
  signatureMatches,
  validDraft,
} from "./mail.ts";
const url = Deno.env.get("SUPABASE_URL")!;
const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const origins = new Set([
  "https://cvoa.one",
  "https://www.cvoa.one",
  "http://localhost:5173",
]);
const fields =
  "id,owner_id,subject,body,attachments,status,revision,created_at,updated_at,sent_at,next_attempt_at,scope_kind,scope_state,scope_post_id,audience_type,audience_status,target_state,target_post_id,event";
function transport() {
  const email = Deno.env.get("WORKSPACE_EMAIL"),
    password = Deno.env.get("WORKSPACE_APP_PASSWORD");
  if (!email || !password) throw new Error("Email sender unavailable");
  return {
    email,
    smtp: nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: email, pass: password.replace(/\s/g, "") },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    }),
  };
}
async function attachments(b: any) {
  if (!Array.isArray(b.attachments) || b.attachments.length > 8)
    throw new Error("Up to 8 attachments allowed");
  let total = 0;
  const files = [];
  for (const [i, f] of b.attachments.entries()) {
    if (
      !f ||
      typeof f.path !== "string" ||
      !new RegExp(`^${b.id}/[a-f0-9-]+\\.[a-z0-9]+$`).test(f.path) ||
      typeof f.name !== "string" ||
      f.name.length > 140 ||
      !MEDIA[f.type]
    )
      throw new Error("Invalid attachment");
    const got = await db.storage.from("member-broadcasts").download(f.path);
    if (got.error || !got.data) throw new Error("Attachment unavailable");
    total += got.data.size;
    if (got.data.size > 8 * 1024 * 1024 || total > MAX_TOTAL)
      throw new Error(
        "Attachments must total 10 MB or less; each file must be 8 MB or less",
      );
    const content = new Uint8Array(await got.data.arrayBuffer());
    if (!signatureMatches(content, f.type))
      throw new Error("Attachment content does not match its file type");
    files.push({
      filename: f.name.replace(/[\r\n\x00-\x1f]/g, "").replace(/[/\\]/g, "_"),
      content: Buffer.from(content),
      contentType: f.type,
      ...(f.type.startsWith("image/")
        ? { cid: `media-${i}@cvoa.one`, contentDisposition: "inline" }
        : { contentDisposition: "attachment" }),
    });
  }
  return files;
}
async function worker() {
  const { email, smtp } = transport();
  let sent = 0;
  // Bounded work survives a closed browser; Cron picks up remaining recipients.
  for (let i = 0; i < 10; i++) {
    const claim = await db.rpc("cvoa_broadcast_claim");
    if (claim.error) throw new Error("Queue unavailable");
    if (!claim.data) break;
    if (claim.data.skipped) continue;
    const { delivery: d, broadcast: b } = claim.data;
    let accepted = false;
    try {
      const files = await attachments(b);
      const result = await smtp.sendMail(
        prepareBroadcast(
          b,
          { email: d.email, member_name: d.member_name },
          email,
          files,
        ),
      );
      accepted = !!result.accepted?.length;
      if (!accepted)
        throw Object.assign(new Error("Rejected"), { responseCode: 550 });
      const record = await db
        .from("member_broadcast_deliveries")
        .update({
          state: "sent",
          sent_at: new Date().toISOString(),
          failure: null,
        })
        .eq("id", d.id)
        .eq("state", "sending");
      if (record.error) throw record.error;
      sent++;
    } catch (err) {
      const e = err as { responseCode?: number; code?: string };
      // Explicit SMTP rejection is safe to retry manually. Timeouts are ambiguous.
      const definite =
        !accepted && (Number(e.responseCode) >= 400 || e.code === "EAUTH");
      await db
        .from("member_broadcast_deliveries")
        .update({
          state: definite ? "failed" : "uncertain",
          failure: definite
            ? "Email provider rejected this delivery. Check sender or sending limits before retrying."
            : "Delivery could not be confirmed. Verify receipt before resending.",
        })
        .eq("id", d.id)
        .eq("state", "sending");
      await db
        .from("member_broadcasts")
        .update({
          next_attempt_at: new Date(Date.now() + 3600000).toISOString(),
        })
        .eq("id", b.id);
      // Avoid consuming the remaining queue during a provider outage/quota error.
      break;
    }
  }
  smtp.close();
  return sent;
}
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    ...(origins.has(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Headers":
            "authorization,apikey,content-type,x-client-info",
          "Access-Control-Allow-Methods": "POST,OPTIONS",
        }
      : {}),
  };
  const reply = (status: number, data: unknown) =>
    new Response(JSON.stringify(data), { status, headers });
  if (origin && !origins.has(origin))
    return reply(403, { error: "Origin not allowed" });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { error: "POST required" });
  try {
    const secret = req.headers.get("x-broadcast-secret");
    if (secret) {
      const verified = await db.rpc("cvoa_broadcast_verify_worker", {
        p_secret: secret,
      });
      if (verified.error || verified.data !== true)
        return reply(401, { error: "Worker authentication required" });
      return reply(200, { sent: await worker() });
    }
    const token = req.headers
      .get("Authorization")
      ?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) return reply(401, { error: "Sign in required" });
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const identity = await caller.auth.getUser(token);
    if (identity.error || !identity.data.user)
      return reply(401, { error: "Sign in again" });
    const actor = identity.data.user;
    if (Number(req.headers.get("content-length")) > 150000)
      return reply(413, { error: "Message too large" });
    const raw = await req.text();
    if (raw.length > 150000) return reply(413, { error: "Message too large" });
    const body = JSON.parse(raw);
    // A member can only read/respond to their own invitation, using verified Auth identity.
    if (body.action === "rsvp") {
      if (
        typeof body.id !== "string" ||
        !/^[a-f0-9-]{36}$/.test(body.id) ||
        (body.response !== undefined &&
          !["yes", "maybe", "no"].includes(body.response))
      )
        return reply(400, { error: "Valid invitation and response required" });
      const result = await db.rpc("cvoa_broadcast_rsvp", {
        p_actor: actor.id,
        p_id: body.id,
        p_response: body.response ?? null,
      });
      if (result.error) return reply(403, { error: result.error.message });
      return reply(200, result.data);
    }
    const permission = await caller.rpc("cvoa_broadcast_context");
    const scopes = permission.data?.scopes || [];
    if (permission.error || !scopes.length)
      return reply(403, {
        error: "An assigned Battalion or Company officer workspace is required",
      });
    // Compatibility for cached Commander-only clients; local clients always supply a draft ID.
    if (body.action === "audience" && !body.id) {
      if (!scopes.some((s: any) => s.kind === "national"))
        return reply(400, { error: "Choose a broadcast audience first" });
      const legacy = await db.rpc("cvoa_broadcast_audience_count");
      if (legacy.error) throw legacy.error;
      return reply(200, { count: legacy.data });
    }
    if (body.action === "context") {
      const posts = await caller
        .from("posts")
        .select("id,name,state")
        .order("name")
        .limit(1000);
      if (posts.error) throw posts.error;
      const national = scopes.some((s: any) => s.kind === "national");
      return reply(200, {
        scopes,
        posts: (posts.data || []).filter(
          (p: any) =>
            national ||
            scopes.some(
              (s: any) =>
                (s.kind === "state" && s.state === p.state) ||
                (s.kind === "post" && s.post_id === p.id),
            ),
        ),
      });
    }
    if (body.action === "list") {
      const result = await caller
        .from("member_broadcasts")
        .select(fields)
        .order("created_at", { ascending: false })
        .limit(100);
      if (result.error) throw result.error;
      return reply(200, { broadcasts: result.data });
    }
    if (body.action === "create") {
      if (
        !body.scope &&
        scopes.some(
          (s: any) => s.kind === "national" && s.scope_id === "primary",
        )
      )
        body.scope = "primary";
      if (
        typeof body.scope !== "string" ||
        !scopes.some((s: any) => s.scope_id === body.scope)
      )
        return reply(403, { error: "Choose an assigned workspace" });
      const result = await db.rpc("cvoa_broadcast_create", {
        p_actor: actor.id,
        p_scope: body.scope,
      });
      if (result.error) throw result.error;
      return reply(200, { broadcast: result.data });
    }
    if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/.test(body.id))
      return reply(400, { error: "Broadcast required" });
    const found = await caller
      .from("member_broadcasts")
      .select(fields)
      .eq("id", body.id)
      .single();
    if (found.error) return reply(404, { error: "Broadcast unavailable" });
    const b = found.data;
    if (body.action === "audience") {
      const count = await db.rpc("cvoa_broadcast_recipient_count", {
        p_id: b.id,
      });
      if (count.error) throw count.error;
      return reply(200, { count: count.data });
    }
    if (body.action === "get") {
      const stats = await db.rpc("cvoa_broadcast_stats", { p_id: b.id });
      const issues = await db
        .from("member_broadcast_deliveries")
        .select("id,email,member_name,state,failure")
        .eq("broadcast_id", b.id)
        .in("state", ["failed", "uncertain", "skipped"])
        .limit(100);
      const responses = await db.rpc("cvoa_broadcast_responses", {
        p_id: b.id,
      });
      if (stats.error || issues.error || responses.error)
        throw new Error("Status unavailable");
      return reply(200, {
        broadcast: b,
        stats: stats.data,
        issues: issues.data,
        responses: responses.data,
      });
    }
    if (
      ["save", "test", "send"].includes(body.action) &&
      b.status !== "draft"
    ) {
      if (body.action === "send" && ["queued", "complete"].includes(b.status))
        return reply(200, { queued: true });
      return reply(409, {
        error: "This broadcast has already left draft status",
      });
    }
    if (
      body.revision !== b.revision &&
      ["save", "test", "send"].includes(body.action)
    )
      return reply(409, { error: "Draft changed. Refresh before continuing." });
    if (body.action === "save") {
      if (!validDraft(body.subject, body.body))
        return reply(400, {
          error:
            "Use a subject under 180 characters and a message under 30,000 characters",
        });
      const filters = {
        audience_type: body.audience_type || null,
        audience_status: body.audience_status || null,
        target_state: body.target_state || null,
        target_post_id: body.target_post_id || null,
        event: body.event || null,
      };
      if (
        (filters.target_state && !/^[A-Z]{2}$/.test(filters.target_state)) ||
        (filters.target_post_id &&
          !/^[a-f0-9-]{36}$/.test(filters.target_post_id)) ||
        (filters.audience_type &&
          !["annual", "lifetime"].includes(filters.audience_type)) ||
        (filters.audience_status &&
          !["active", "lapsed", "pending_payment"].includes(
            filters.audience_status,
          ))
      )
        return reply(400, { error: "Invalid audience filter" });
      if (
        filters.target_state &&
        b.scope_kind === "state" &&
        filters.target_state !== b.scope_state
      )
        return reply(403, {
          error: "Audience must stay inside your assigned Battalion",
        });
      if (filters.target_post_id) {
        const post = await db
          .from("posts")
          .select("id,state")
          .eq("id", filters.target_post_id)
          .single();
        if (
          post.error ||
          (b.scope_kind === "state" && post.data.state !== b.scope_state) ||
          (b.scope_kind === "post" && post.data.id !== b.scope_post_id)
        )
          return reply(403, {
            error: "Company outside this broadcast workspace",
          });
      }
      if (filters.event) {
        const e = filters.event;
        if (
          typeof e.title !== "string" ||
          !e.title.trim() ||
          e.title.length > 180 ||
          typeof e.starts_at !== "string" ||
          !Number.isFinite(Date.parse(e.starts_at)) ||
          (e.ends_at &&
            (!Number.isFinite(Date.parse(e.ends_at)) ||
              Date.parse(e.ends_at) <= Date.parse(e.starts_at))) ||
          typeof e.location !== "string" ||
          e.location.length > 1000
        )
          return reply(400, {
            error:
              "Enter a valid event title, start time, end time and location",
          });
        filters.event = {
          title: e.title.trim(),
          starts_at: new Date(e.starts_at).toISOString(),
          ends_at: e.ends_at ? new Date(e.ends_at).toISOString() : null,
          location: e.location,
        };
      }
      await attachments({ ...b, attachments: body.attachments });
      const saved = await db
        .from("member_broadcasts")
        .update({
          ...filters,
          subject: body.subject.trim(),
          body: body.body,
          attachments: body.attachments,
          revision: b.revision + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", b.id)
        .eq("revision", b.revision)
        .eq("status", "draft")
        .select(fields)
        .maybeSingle();
      if (saved.error) throw saved.error;
      if (!saved.data)
        return reply(409, {
          error: "Draft changed. Refresh before continuing.",
        });
      return reply(200, { broadcast: saved.data });
    }
    if (body.action === "test") {
      if (!b.subject.trim() || !b.body.trim())
        return reply(400, { error: "Add a subject and message first" });
      if (!actor.email || !actor.email_confirmed_at)
        return reply(400, { error: "Verify your sign-in email first" });
      const claim = await db
        .from("member_broadcasts")
        .update({ last_test_at: new Date().toISOString() })
        .eq("id", b.id)
        .eq("revision", b.revision)
        .eq("status", "draft")
        .or(
          `last_test_at.is.null,last_test_at.lt.${new Date(Date.now() - 60000).toISOString()}`,
        )
        .select("id");
      if (claim.error) throw claim.error;
      if (!claim.data?.length)
        return reply(429, { error: "Wait one minute before another test" });
      const files = await attachments(b),
        { email, smtp } = transport();
      try {
        await smtp.sendMail(
          prepareBroadcast(
            b,
            {
              email: actor.email,
              member_name: actor.user_metadata?.full_name || "Commander",
            },
            email,
            files,
            true,
          ),
        );
      } finally {
        smtp.close();
      }
      return reply(200, { sent_to: actor.email });
    }
    if (body.action === "send") {
      await attachments(b);
      const { smtp } = transport();
      await smtp.verify();
      smtp.close();
      const queued = await db.rpc("cvoa_broadcast_queue", {
        p_id: b.id,
        p_actor: actor.id,
        p_revision: b.revision,
      });
      if (queued.error) return reply(409, { error: queued.error.message });
      return reply(200, { queued: true, count: queued.data });
    }
    if (body.action === "cancel") {
      const changed = await db
        .from("member_broadcasts")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", b.id)
        .eq("status", "queued");
      if (changed.error) throw changed.error;
      const skipped = await db
        .from("member_broadcast_deliveries")
        .update({ state: "skipped", failure: "Cancelled before sending" })
        .eq("broadcast_id", b.id)
        .eq("state", "pending");
      if (skipped.error) throw skipped.error;
      return reply(200, { cancelled: true });
    }
    if (body.action === "retry") {
      const retry = await db.rpc("cvoa_broadcast_retry", {
        p_id: b.id,
        p_actor: actor.id,
      });
      if (retry.error) return reply(409, { error: retry.error.message });
      return reply(200, { retried: retry.data });
    }
    return reply(400, { error: "Unknown action" });
  } catch (e) {
    // Do not expose SMTP diagnostics, message contents, or addresses in logs.
    console.error("Broadcast operation failed", { type: (e as Error)?.name });
    return reply(503, {
      error:
        "Broadcast operation did not complete. Refresh delivery status before retrying.",
    });
  }
});
