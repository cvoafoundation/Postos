// Permanent deletion is retired from the operational access screen.
// Administrators can suspend an account while preserving membership and history.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const reply = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, "Use POST.");
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return reply(401, "Sign in again.");
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) return reply(401, "Sign in again.");
    const { data: allowed, error: permissionError } = await supabase.rpc(
      "cvoa_service_authorized",
      { p_actor: user.id, p_post: null, p_capability: "national" },
    );
    if (permissionError || !allowed)
      return reply(403, "National access administration required.");
    return reply(
      409,
      "Use reversible suspension in Accounts & Access. Permanent account deletion requires a separate reviewed cleanup.",
    );
  } catch {
    return reply(500, "Could not verify account access.");
  }
});
