import { useWorkspace } from "@/lib/workspaces";
import { WorkspaceStatus } from "@/components/workspaces/WorkspaceStatus";
export default function StateVotingSummary({
  resolutionId,
  state,
}: {
  resolutionId: string;
  state: string;
}) {
  const { data, error, loading, refresh } = useWorkspace<{
    state: string;
    posts: { id: string; name: string; support: number; oppose: number }[];
  }>("cvoa_state_voting", { p_resolution: resolutionId, p_state: state });
  return (
    <section className="panel p-4 mb-4">
      <h3 className="font-display text-xl">Your state · {state}</h3>
      <p className="text-xs text-muted mt-2">
        Anonymous member preferences across your designated state. Your formal
        voting authority remains with your designated post.
      </p>
      <WorkspaceStatus loading={loading} error={error} retry={refresh} />
      {data && (
        <ul className="space-y-2 mt-3">
          {data.posts.map((p) => (
            <li key={p.id} className="text-sm flex justify-between gap-3">
              <span>{p.name}</span>
              <span>
                {p.support} support · {p.oppose} oppose
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
