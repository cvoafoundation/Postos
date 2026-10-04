import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/AppShell";
import { useWorkspace } from "@/lib/workspaces";
import { WorkspaceStatus } from "@/components/workspaces/WorkspaceStatus";
import ApplicationTimeline, {
  type ApplicationUpdate,
} from "@/components/workspaces/ApplicationTimeline";
import { POST_STATUS_LABELS, type PostStatus } from "@/lib/types";

export default function MyApplications() {
  const { data, loading, error, refresh } = useWorkspace<
    {
      id: string;
      city: string;
      state: string;
      status: PostStatus;
      created_at: string;
      updates: ApplicationUpdate[];
    }[]
  >("cvoa_my_applications");
  return (
    <div>
      <PageHeader eyebrow="Member Workspace" title="My Post Applications" />
      <p className="text-sm text-muted mb-6">
        Follow your application, read National’s feedback, and send requested
        documents here. Applying starts a review; staff access follows an
        approved appointment.
      </p>
      <WorkspaceStatus loading={loading} error={error} retry={refresh} />
      {data?.length === 0 && (
        <div className="panel p-5">
          <p>No post applications on file for your account.</p>
          <Link to="/member-home" className="text-gold inline-block mt-3">
            Start a Post →
          </Link>
        </div>
      )}
      <div className="space-y-6">
        {data?.map((a) => (
          <article key={a.id} className="panel p-5">
            <h2 className="font-display text-2xl">
              {a.city}, {a.state}
            </h2>
            <p className="text-sm text-gold mt-2">
              {POST_STATUS_LABELS[a.status]}
            </p>
            <p className="text-xs text-muted">
              Submitted {a.created_at.slice(0, 10)}
            </p>
            <ApplicationTimeline
              applicationId={a.id}
              initialUpdates={a.updates}
            />
          </article>
        ))}
      </div>
    </div>
  );
}
