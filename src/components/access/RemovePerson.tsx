import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
export function notifyPeopleChanged() {
  window.dispatchEvent(new Event("cvoa:people-changed"));
}
export default function RemovePerson({
  memberId,
  profileId,
  name,
  onRemoved,
}: {
  memberId?: string;
  profileId?: string;
  name: string;
  onRemoved: () => void;
}) {
  const { isNational, profile } = useAuth();
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  if (!isNational || profileId === profile?.id) return null;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.rpc("cvoa_remove_person", {
        p_member: memberId ?? null,
        p_profile: profileId ?? null,
        p_reason: reason,
      });
      if (error) throw error;
      notifyPeopleChanged();
      onRemoved();
    } catch (e) {
      setError(
        (e as { message?: string }).message ?? "Could not remove this record.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="border border-status-attention/30 rounded-sm p-3">
      <button
        type="button"
        className="text-status-attention text-sm"
        onClick={() => setOpen(!open)}
      >
        {open
          ? "Cancel Removal"
          : profileId
            ? "Delete Account & Linked Memberships"
            : "Delete Membership Record"}
      </button>
      {open && (
        <form onSubmit={submit} className="space-y-3 mt-3">
          <p className="text-sm">
            Remove <strong>{name}</strong>{" "}
            {profileId
              ? "from Accounts & Access and remove all linked memberships from the roster. Workspace access will be suspended."
              : "from the roster and directory. Any login account and other memberships stay in place."}{" "}
            Payment, meeting, and audit history remain. Removal does not refund
            payments; active Stripe auto-renewal must be canceled in the roster
            first. National can restore it from Removed Records.
          </p>
          <p className="text-xs text-muted">
            If this is a duplicate, keep the correct record before removing this
            one. Memberships that are not linked to this account must be
            reviewed separately.
          </p>
          <label className="block text-sm">
            Removal Reason
            <textarea
              className="input-field mt-1"
              required
              minLength={5}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Duplicate entry; retaining the correct record…"
            />
          </label>
          {error && (
            <p role="alert" className="text-status-attention text-sm">
              {error}
            </p>
          )}
          <button
            className="btn-ghost text-status-attention disabled:opacity-50"
            disabled={busy}
          >
            {busy ? "Removing…" : "Confirm Removal"}
          </button>
        </form>
      )}
    </div>
  );
}
export function RemovedPeople({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<{
      accounts: { id: string; full_name: string }[];
      members: { id: string; full_name: string; reason: string }[];
    } | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function load() {
    setError(null);
    setBusy(true);
    const r = await supabase.rpc("cvoa_removed_people");
    if (r.error) setError(r.error.message);
    else setData(r.data);
    setBusy(false);
  }
  async function restore(id: string, account: boolean) {
    const reason = window.prompt(
      "Reason for restoring this record (at least five characters). Restored accounts stay suspended until access is reviewed.",
    );
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.rpc("cvoa_restore_person", {
        p_profile: account ? id : null,
        p_member: account ? null : id,
        p_reason: reason,
      });
      if (r.error) throw r.error;
      notifyPeopleChanged();
      onChanged();
      await load();
    } catch (e) {
      setError(
        (e as { message?: string }).message ?? "Could not restore the record.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel p-4 mb-4">
      <button
        className="text-gold text-sm"
        onClick={() => {
          setOpen(!open);
          if (!open) void load();
        }}
      >
        {open ? "Close Removed Records" : "Removed Records / Restore"}
      </button>
      {open && (
        <div className="mt-3">
          <p className="text-xs text-muted mb-3">
            Restore an account first, then its memberships. Access remains
            suspended until National reviews its appointments.
          </p>
          {error && (
            <p role="alert" className="text-status-attention">
              {error}
            </p>
          )}
          {busy && <p role="status">Loading…</p>}
          {data &&
            [
              ...data.accounts.map((p) => ({
                ...p,
                account: true,
                reason: "Account access suspended",
              })),
              ...data.members.map((p) => ({ ...p, account: false })),
            ].map((p) => (
              <div
                key={`${p.account}-${p.id}`}
                className="flex items-center justify-between gap-3 py-2 border-t border-hairline text-sm"
              >
                <div>
                  {p.full_name}
                  <p className="text-xs text-muted">
                    {p.account ? "Account" : "Membership"} · {p.reason}
                  </p>
                </div>
                <button
                  disabled={busy}
                  className="text-gold disabled:opacity-50"
                  onClick={() => restore(p.id, p.account)}
                >
                  Restore
                </button>
              </div>
            ))}
          {data && !data.accounts.length && !data.members.length && (
            <p className="text-muted text-sm">No removed records.</p>
          )}
        </div>
      )}
    </section>
  );
}
