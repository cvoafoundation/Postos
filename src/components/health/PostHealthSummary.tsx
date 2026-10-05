import { usePostHealth, healthColor } from "@/lib/usePostHealth";
export function PostHealthSummary({
  postId,
  status,
  version = 0,
}: {
  postId: string;
  status: string;
  version?: number;
}) {
  const { scores, loading, error } = usePostHealth(
    status === "active_post" ? [postId] : [],
    version,
  );
  const result = scores[postId];
  return (
    <section
      className={`panel p-5 mb-5 border-l-4 ${healthColor(result?.overall)}`}
    >
      <h2 className="font-display text-xl">
        Post health ·{" "}
        {status !== "active_post"
          ? "Preparing to launch"
          : result
            ? `${result.score}/100 · ${result.overall.toUpperCase()}`
            : loading
              ? "Loading…"
              : "Unavailable"}
      </h2>
      {error && (
        <p role="alert" className="text-sm mt-2">
          {error}
        </p>
      )}
      {status !== "active_post" && (
        <p className="text-sm text-muted mt-2">
          Launch readiness is tracked separately. The operating health score
          starts when the post becomes active.
        </p>
      )}
      {result && (
        <>
          <p className="text-xs text-muted mt-2 mb-3">
            Scored record coverage: {result.coverage}%. Neutral signals
            excluded. Critical issues:{" "}
            {result.critical.join(", ") || "None flagged"}.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {result.dimensions.map((d) => (
              <div
                key={d.key}
                className={`border-l-2 pl-3 ${healthColor(d.status)}`}
              >
                <p className="text-sm font-medium">
                  {d.label} · {d.status}
                </p>
                <p className="text-xs text-muted">{d.detail}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
