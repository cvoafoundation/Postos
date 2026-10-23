import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layout/AppShell";
export default function BroadcastRSVP() {
  const { id } = useParams(),
    { session } = useAuth();
  return <Invitation key={`${session?.user.id}:${id}`} id={id || ""} />;
}
function Invitation({ id }: { id: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  async function load(response?: string) {
    setBusy(true);
    setError("");
    try {
      const result = await supabase.functions.invoke("member-broadcasts", {
        body: { action: "rsvp", id, ...(response ? { response } : {}) },
      });
      if (result.error) {
        let msg =
          "Could not load this invitation. Sign in with the email address that received it.";
        try {
          msg = (await result.error.context?.json())?.error || msg;
        } catch {}
        throw new Error(msg);
      }
      setData(result.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [id]);
  return (
    <>
      <PageHeader
        title="Event Invitation"
        eyebrow="CVOA"
        description="Let the organizing officers know whether you can attend."
      />
      {error && (
        <div role="alert" className="panel p-4 mb-4 text-red-400">
          {error}
          <button
            className="btn-ghost ml-3"
            disabled={busy}
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Loading invitation…</p>
      ) : (
        data && (
          <article className="panel max-w-2xl p-6 space-y-5">
            <h2 className="font-display text-2xl">{data.event.title}</h2>
            <p>
              <strong>When:</strong>{" "}
              {new Date(data.event.starts_at).toLocaleString()}
              {data.event.ends_at
                ? ` – ${new Date(data.event.ends_at).toLocaleString()}`
                : ""}
            </p>
            <p>
              <strong>Where:</strong>{" "}
              {data.event.location || "See your invitation email"}
            </p>
            <p className="text-sm text-muted">
              Times are shown in your device’s time zone. Your response is
              visible to the organizing officers.
            </p>
            {data.response && (
              <p role="status">
                Your response:{" "}
                <strong>
                  {
                    (
                      {
                        yes: "Attending",
                        maybe: "Maybe",
                        no: "Unable to attend",
                      } as Record<string, string>
                    )[data.response]
                  }
                </strong>
                .{!data.closed && " You can change it below."}
              </p>
            )}
            {data.closed ? (
              <p>RSVP has closed for this invitation.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {[
                  ["yes", "I’m attending"],
                  ["maybe", "Maybe"],
                  ["no", "Unable to attend"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={
                      data.response === value ? "btn-gold" : "btn-ghost"
                    }
                    disabled={busy}
                    onClick={() => void load(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </article>
        )
      )}
    </>
  );
}
