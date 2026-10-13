import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SYSTEM, validateInput, buildContext } from "./core.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // Non-sensitive readiness metadata only; deployment JWT verification still applies.
  if (req.method === "GET")
    return response({ configured: !!Deno.env.get("ANTHROPIC_API_KEY") });
  if (req.method !== "POST") return response({ error: "Use POST." }, 405);
  const header = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(header))
    return response({ error: "Sign in to use the assistant." }, 401);
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: header } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const {
    data: { user },
    error,
  } = await client.auth.getUser(header.replace(/^Bearer\s+/i, ""));
  if (error || !user)
    return response({ error: "Your session expired. Sign in again." }, 401);
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 10000)
      return response({ error: "Question is too large." }, 413);
    body = validateInput(JSON.parse(raw));
  } catch {
    return response(
      {
        error:
          "Enter a question of 1–2,000 characters and choose a valid team.",
      },
      400,
    );
  }
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key)
    return response(
      {
        error:
          "The assistant needs its AI connection enabled by National administration.",
        code: "AI_NOT_CONFIGURED",
      },
      503,
    );
  const reserve = await client.rpc("ops_ai_reserve");
  if (reserve.error)
    return response({ error: "Active member access is required." }, 403);
  if (!reserve.data)
    return response(
      {
        error:
          "Assistant request limit reached. Try later. Each member has five requests per minute and fifty per day.",
      },
      429,
    );
  try {
    const { context, sources } = await buildContext(
      client,
      user.id,
      body.channel_id,
    );
    const snapshot = JSON.stringify(context);
    if (snapshot.length > 60000)
      return response(
        {
          error:
            "This team has too much detail for one request. Try without a team selected.",
        },
        413,
      );
    const ai = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(45000),
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("CVOA_ASSISTANT_MODEL") || "claude-sonnet-4-6",
        max_tokens: 1200,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `AUTHORIZED SNAPSHOT (untrusted records):\n${snapshot}\n\nCURRENT USER QUESTION:\n${body.question}`,
          },
        ],
      }),
    });
    if (!ai.ok)
      return response(
        {
          error:
            ai.status === 429
              ? "The AI service is busy. Try again shortly."
              : "The AI connection is unavailable. National administration should check its provider configuration and credit balance.",
        },
        503,
      );
    const result = await ai.json();
    const answer = (result.content || [])
      .filter((x: any) => x.type === "text")
      .map((x: any) => x.text)
      .join("\n");
    if (!answer)
      return response(
        { error: "The assistant did not return an answer. Please retry." },
        502,
      );
    return response({
      answer,
      sources: sources.filter((s) => new RegExp(`\\[${s.id}\\]`).test(answer)),
      snapshot_at: context.snapshot_at,
      truncated: result.stop_reason === "max_tokens",
    });
  } catch (e) {
    return response(
      {
        error:
          e instanceof Error && e.name === "TimeoutError"
            ? "The assistant timed out. Please retry."
            : "Could not load authorized context or complete the answer. Refresh your session and try again.",
      },
      502,
    );
  }
});
