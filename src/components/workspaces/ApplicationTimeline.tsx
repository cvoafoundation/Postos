import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { WorkspaceStatus } from "./WorkspaceStatus";

export interface ApplicationUpdate {
  id: string;
  kind: string;
  message: string;
  document_path: string | null;
  created_at: string;
}
export default function ApplicationTimeline({
  applicationId,
  initialUpdates,
  reviewer = false,
}: {
  applicationId: string;
  initialUpdates?: ApplicationUpdate[];
  reviewer?: boolean;
}) {
  const { profile } = useAuth();
  const [updates, setUpdates] = useState<ApplicationUpdate[]>(
    initialUpdates ?? [],
  );
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState("feedback");
  const [file, setFile] = useState<File | null>(null);
  const [fileVersion, setFileVersion] = useState(0);
  const [documentLinks, setDocumentLinks] = useState<Record<string,string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!initialUpdates);
  async function load() {
    setError(null);
    setLoading(true);
    try {
      const r = await supabase
        .from("post_application_updates")
        .select("*")
        .eq("application_id", applicationId)
        .order("created_at");
      if (r.error) throw r.error;
      setUpdates(r.data as ApplicationUpdate[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!initialUpdates) void load();
  }, [applicationId]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!profile || busy) return;
    setBusy(true);
    setError(null);
    try {
      let path: string | null = null;
      if (file) {
        if (
          file.size > 10 * 1024 * 1024 ||
          !["application/pdf", "image/png", "image/jpeg"].includes(file.type)
        )
          throw new Error("Choose a PDF, PNG, or JPEG under 10 MB.");
        path = `${profile.id}/${applicationId}/${crypto.randomUUID()}`;
        const upload = await supabase.storage
          .from("cvoa-application-documents")
          .upload(path, file, { contentType: file.type });
        if (upload.error) throw upload.error;
      }
      const r = await supabase
        .from("post_application_updates")
        .insert({
          application_id: applicationId,
          author_id: profile.id,
          kind: reviewer ? kind : "reply",
          message: message.trim(),
          document_path: path,
        });
      if (r.error) throw r.error;
      setMessage("");
      setFile(null);
      setFileVersion(v=>v+1);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openDocument(path: string) {
    setError(null);
    const r = await supabase.storage
      .from("cvoa-application-documents")
      .createSignedUrl(path, 300);
    if (r.error) {
      setError(r.error.message);
      return;
    }
    setDocumentLinks(links=>({...links,[path]:r.data.signedUrl}));
  }
  return (
    <section className="panel p-4 mt-5">
      <h3 className="font-display text-xl mb-2">
        Application Updates & Documents
      </h3>
      <WorkspaceStatus loading={loading} error={error} retry={load} />
      {!loading && updates.length === 0 && (
        <p className="text-sm text-muted mb-3">
          No updates yet. National will post feedback and next steps here.
        </p>
      )}
      <ol className="space-y-3 mb-4">
        {updates.map((u) => (
          <li key={u.id} className="border-l-2 border-hairline pl-3">
            <p className="eyebrow">
              {u.kind.replaceAll("_", " ")} · {u.created_at.slice(0, 10)}
            </p>
            <p className="text-sm whitespace-pre-wrap">{u.message}</p>
            {u.document_path && (
              <button
                className="text-sm text-gold mt-1"
                onClick={() => openDocument(u.document_path!)}
              >
                Open attached document
              </button>
            )}
            {u.document_path && documentLinks[u.document_path] && <a className="text-sm text-gold block mt-2" href={documentLinks[u.document_path]} target="_blank" rel="noopener noreferrer">View Document · link valid for 5 minutes</a>}
          </li>
        ))}
      </ol>
      <form onSubmit={submit} className="space-y-3">
        {reviewer && (
          <label className="block text-sm">
            Update type
            <select
              className="input-field mt-1"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="feedback">Feedback / next steps</option>
              <option value="document_request">Request documents</option>
            </select>
          </label>
        )}
        <label className="block text-sm">
          {reviewer ? "Message to applicant" : "Reply or document description"}
          <textarea
            className="input-field mt-1"
            required
            maxLength={5000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Attach document (PDF or image, up to 10 MB)
          <input
            key={fileVersion}
            className="block mt-2 text-sm w-full"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button className="btn-gold" disabled={busy}>
          {busy ? "Saving…" : reviewer ? "Send Update" : "Send Reply"}
        </button>
      </form>
    </section>
  );
}
