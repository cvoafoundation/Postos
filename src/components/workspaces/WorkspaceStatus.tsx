export function WorkspaceStatus({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string | null;
  retry: () => void;
}) {
  if (loading)
    return (
      <p role="status" className="text-sm text-muted py-4">
        Loading workspace…
      </p>
    );
  if (error)
    return (
      <div role="alert" className="panel p-4 my-4">
        <p className="text-status-attention text-sm">{error}</p>
        <button className="btn-ghost mt-3" onClick={retry}>
          Retry
        </button>
      </div>
    );
  return null;
}
