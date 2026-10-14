import { useEffect, useRef, useState } from "react";
import { Download, Settings, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import {
  membershipListCsv,
  membershipListFilename,
  missingListFields,
  type MembershipListRow,
} from "@/lib/membershipListExport";
const check = (r: any) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
export default function MembershipListExport() {
  const { session, selectedScope, profile, accessSuspended } = useAuth();
  return (
    <ExportControl
      key={`${session?.user.id}:${selectedScope}:${profile?.role}:${accessSuspended}`}
    />
  );
}
function ExportControl() {
  const [access, setAccess] = useState({ allowed: false, can_manage: false }),
    [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void supabase.rpc("cvoa_membership_export_access").then((r: any) => {
        if (!active) return;
        const next = r.error ? { allowed: false, can_manage: false } : r.data;
        setAccess(next);
        if (!next.allowed) setOpen(false);
      });
    refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  if (!access.allowed) return null;
  return (
    <>
      <button
        className="btn-ghost text-sm flex items-center gap-2"
        onClick={() => setOpen(true)}
      >
        <Download size={16} />
        Export membership list
      </button>
      {open && (
        <ExportDialog
          canManage={access.can_manage}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
function ExportDialog({
  canManage,
  onClose,
}: {
  canManage: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<MembershipListRow[]>([]),
    [activeOnly, setActiveOnly] = useState(true),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [purpose, setPurpose] = useState(""),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState(""),
    [manage, setManage] = useState(false),
    [staff, setStaff] = useState<any[]>([]),
    [editing, setEditing] = useState<MembershipListRow | null>(null),
    [reason, setReason] = useState(""),
    [revision, setRevision] = useState(0),
    [downloadFile, setDownloadFile] = useState<{
      url: string;
      name: string;
    } | null>(null);
  const fileUrl = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    fileUrl.current = null;
    setDownloadFile(null);
    setNotice("");
    setLoading(true);
    setError("");
    setRows([]);
    void supabase
      .rpc("cvoa_membership_list", { p_active_only: activeOnly })
      .then((r: any) => {
        if (!active) return;
        if (r.error) setError(r.error.message);
        else setRows(r.data.rows);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeOnly, revision]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    };
  }, []);
  const incomplete = rows.filter((r) => missingListFields(r).length),
    visible = rows.filter((r) =>
      `${r.name} ${r.membership_class || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  async function download() {
    setBusy(true);
    setError("");
    try {
      const exportPurpose = purpose.trim() || "NCC membership-list review";
      if (exportPurpose.length < 5)
        throw new Error(
          "Use at least five characters for a custom purpose, or leave it blank for NCC review.",
        );
      const data = check(
        await supabase.rpc("cvoa_membership_list", {
          p_active_only: activeOnly,
          p_reason: exportPurpose,
        }),
      );
      if (!mounted.current) return;
      const missing = data.rows.some(
        (r: MembershipListRow) => missingListFields(r).length,
      );
      const url = URL.createObjectURL(
        new Blob([membershipListCsv(data.rows)], {
          type: "text/csv;charset=utf-8;",
        }),
      );
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
      fileUrl.current = url;
      const name = membershipListFilename(
        data.generated_at,
        activeOnly,
        missing,
      );
      setDownloadFile({ url, name });
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.style.display = "none";
      document.body.appendChild(a);
      try {
        a.click();
      } finally {
        a.remove();
      }
      setRows(data.rows);
      setNotice(
        missing
          ? "Review CSV ready. Missing fields are blank and must be resolved before relying on the list as complete."
          : "Membership list CSV ready. The purpose and row count were recorded.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export the list.");
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      check(
        await supabase.rpc("cvoa_save_membership_list_details", {
          p_member: editing.id,
          p_address: editing.address,
          p_class: editing.membership_class,
          p_votes: editing.votes_entitled,
          p_entitlement: editing.voting_entitlement,
          p_reason: reason,
        }),
      );
      setEditing(null);
      setReason("");
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  async function manageAccess() {
    setError("");
    try {
      setStaff(check(await supabase.rpc("cvoa_ncc_export_directory")));
      setManage(!manage);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load NCC designations.",
      );
    }
  }
  return (
    <Modal title="Membership list export · NCC only" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-muted">
          Exports names, mailing addresses, recorded membership classes, vote
          counts, and voting scope. Phone numbers, email addresses, military
          documents, birthdates, and payment records are excluded. This prepares
          a list for NCC review and does not determine whether a particular
          inspection request must be granted.
        </p>
        {canManage && (
          <button
            className="btn-ghost text-xs flex gap-2"
            onClick={() => void manageAccess()}
          >
            <Settings size={14} />
            Manage NCC export access
          </button>
        )}
        {manage && (
          <section className="panel p-3 space-y-3">
            <p className="text-xs text-muted">
              Designate only confirmed NCC members. General National staff
              access does not grant this export. The National Commander has
              access through that office.
            </p>
            {staff.map((p) => (
              <label className="flex gap-2 text-xs" key={p.profile_id}>
                <input
                  type="checkbox"
                  checked={p.designated}
                  disabled={busy}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    setBusy(true);
                    setError("");
                    try {
                      check(
                        await supabase.rpc("cvoa_set_ncc_export_designation", {
                          p_profile: p.profile_id,
                          p_enabled: enabled,
                        }),
                      );
                      setStaff((s) =>
                        s.map((x) =>
                          x.profile_id === p.profile_id
                            ? { ...x, designated: enabled }
                            : x,
                        ),
                      );
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Could not change designation.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
                {p.name}
                {p.title ? ` · ${p.title}` : ""}
              </label>
            ))}
            {!staff.length && (
              <p className="text-xs text-muted">
                No active National staff accounts are available. Use Accounts &
                Access to set up their National appointment first.
              </p>
            )}
          </section>
        )}
        <label className="block text-sm">
          List scope
          <select
            className="input-field w-full mt-1"
            value={activeOnly ? "active" : "all"}
            disabled={busy}
            onChange={(e) => {
              setEditing(null);
              setActiveOnly(e.target.value === "active");
            }}
          >
            <option value="active">Active membership records</option>
            <option value="all">All non-removed membership records</option>
          </select>
        </label>
        <p className="text-xs text-muted">
          All non-removed records can include lapsed and pending-payment
          entries. Choose the appropriate population for the request.
          Annual/lifetime dues terms do not determine membership class or voting
          rights.
        </p>
        {loading ? (
          <p role="status" className="text-xs text-muted">
            Loading membership list…
          </p>
        ) : (
          <>
            <p className="text-sm">
              {rows.length} records · {incomplete.length} need completion
            </p>
            {incomplete.length > 0 && (
              <p className="panel p-3 text-xs text-status-attention">
                Missing names, addresses, classes, or vote counts will remain
                blank. The downloaded file will be marked REVIEW-REQUIRED. No
                class or voting entitlement is inferred.
              </p>
            )}
            <input
              aria-label="Find a membership list record"
              className="input-field w-full"
              placeholder="Find a member to review or correct"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="max-h-60 overflow-auto divide-y divide-hairline">
              {visible.slice(0, 100).map((r) => (
                <button
                  key={r.id}
                  className="block text-left w-full py-3 text-sm"
                  disabled={busy}
                  onClick={() => {
                    setEditing({ ...r });
                    setReason("");
                  }}
                >
                  <strong>{r.name}</strong>
                  <p className="text-xs text-muted">
                    {r.membership_class || "Class not recorded"} ·{" "}
                    {r.votes_entitled == null
                      ? "Votes not recorded"
                      : `${r.votes_entitled} vote(s)`}
                  </p>
                  <p className="text-xs text-muted">
                    {r.address || "Address not recorded"}
                  </p>
                  {missingListFields(r).length > 0 && (
                    <p className="text-xs text-status-attention">
                      Missing: {missingListFields(r).join(", ")}
                    </p>
                  )}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted">
              Showing the first 100 matching records for editing. Export
              includes every record in the selected scope and ignores this
              search.
            </p>
          </>
        )}
        {editing && (
          <form className="panel p-3 space-y-3" onSubmit={save}>
            <div className="flex justify-between">
              <strong className="text-sm">Review {editing.name}</strong>
              <button
                type="button"
                aria-label="Close record editor"
                onClick={() => setEditing(null)}
              >
                <X size={14} />
              </button>
            </div>
            <label className="block text-xs">
              Mailing address
              <textarea
                className="input-field w-full mt-1"
                rows={2}
                maxLength={2000}
                value={editing.address || ""}
                onChange={(e) =>
                  setEditing({ ...editing, address: e.target.value })
                }
              />
            </label>
            <label className="block text-xs">
              Recorded membership class
              <input
                className="input-field w-full mt-1"
                maxLength={120}
                placeholder="Class recorded under adopted governing documents"
                value={editing.membership_class || ""}
                onChange={(e) =>
                  setEditing({ ...editing, membership_class: e.target.value })
                }
              />
            </label>
            <label className="block text-xs">
              Number of votes entitled
              <input
                className="input-field w-full mt-1"
                type="number"
                min={0}
                max={100000}
                step={1}
                value={editing.votes_entitled ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    votes_entitled:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="block text-xs">
              Voting scope / entitlement explanation
              <input
                className="input-field w-full mt-1"
                maxLength={500}
                placeholder="Identify the matters or limitations these votes apply to"
                value={editing.voting_entitlement || ""}
                onChange={(e) =>
                  setEditing({ ...editing, voting_entitlement: e.target.value })
                }
              />
            </label>
            <label className="block text-xs">
              Source / reason for correction
              <input
                required
                minLength={5}
                maxLength={1000}
                className="input-field w-full mt-1"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button disabled={busy} className="btn-gold text-xs">
              Save reviewed details
            </button>
          </form>
        )}
        <label className="block text-sm">
          Export purpose / request reference (optional)
          <textarea
            className="input-field w-full mt-1"
            rows={2}
            maxLength={1000}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Membership-list review for a written referendum petition request"
          />
        </label>
        <p className="text-xs text-muted">
          Leave the purpose blank for an internal NCC review. Enter a specific
          purpose when preparing a response to a records request.
        </p>
        {downloadFile && (
          <div className="panel p-3 space-y-2">
            <p className="text-xs text-muted">
              If the download did not start automatically, use this direct link.
            </p>
            <a
              href={downloadFile.url}
              download={downloadFile.name}
              className="text-sm text-gold underline"
            >
              Download CSV file
            </a>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-status-attention">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-xs text-muted">
            {notice}
          </p>
        )}
        <button
          className="btn-gold text-sm flex gap-2 items-center"
          disabled={loading || busy || !rows.length}
          onClick={() => void download()}
        >
          <Download size={16} />
          {busy
            ? "Working…"
            : incomplete.length
              ? "Download review CSV"
              : "Download membership list CSV"}
        </button>
      </div>
    </Modal>
  );
}
