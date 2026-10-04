import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { MembershipCardVisual } from "@/components/membership/MembershipCardVisual";
import { PageHeader } from "@/components/layout/AppShell";
import { WorkspaceStatus } from "@/components/workspaces/WorkspaceStatus";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { readAllRows } from "@/lib/readAllRows";
import { membershipActions } from "@/lib/workspaces";
import { getFunctionError } from "@/lib/functionErrors";
import type { Member, Post } from "@/lib/types";

interface ChangeRequest {
  id: string;
  target_post_id: string | null;
  status: string;
  review_note: string | null;
  created_at: string;
}
export default function MyMembership() {
  const { profile, refreshProfile } = useAuth();
  const [member, setMember] = useState<Member | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [purchase, setPurchase] = useState<"renew" | "upgrade" | "join" | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    if (!profile?.id) {
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const [rows, postRows, changes] = await Promise.all([
          readAllRows<Member>(() =>
            supabase
              .from("members")
              .select("*")
              .eq("profile_id", profile.id)
              .order("id"),
          ),
          readAllRows<Post>(() =>
            supabase
              .from("posts")
              .select("id,name,state,status")
              .eq("status", "active_post")
              .order("id"),
          ),
          readAllRows<ChangeRequest>(() =>
            supabase
              .from("membership_change_requests")
              .select("*")
              .eq("requested_by", profile.id)
              .order("id"),
          ),
        ]);
        rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
        if (active) {
          setMember(
            rows.find((r) => r.membership_status === "active") ??
              rows[0] ??
              null,
          );
          setPosts(postRows);
          setRequests(
            changes.sort((a, b) => b.created_at.localeCompare(a.created_at)),
          );
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [profile?.id, version]);
  async function checkout() {
    if (!member || !purchase || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.functions.invoke("create-membership-checkout", {
        body: {
          member_id: member.id,
          post_id: member.post_id,
          membership_type:
            purchase === "join"
              ? member.membership_type
              : purchase === "upgrade"
                ? "lifetime"
                : "annual",
          action: purchase,
          auto_renew: false,
        },
      });
      if (r.error || r.data?.error)
        throw new Error(await getFunctionError(r.error, r.data));
      if (!r.data?.url)
        throw new Error("Checkout did not return a payment link.");
      window.location.assign(r.data.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancelRenewal() {
    if (!member || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.functions.invoke(
        "cancel-membership-subscription",
        { body: { member_id: member.id } },
      );
      if (r.error || r.data?.error)
        throw new Error(await getFunctionError(r.error, r.data));
      setMessage(
        "Future automatic billing is cancelled. Your paid membership remains valid through its expiration date.",
      );
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function discardCheckout() {
    if (!member || busy) return;
    setBusy(true);setError(null);
    try {
      const r=await supabase.functions.invoke('create-membership-checkout',{body:{member_id:member.id,post_id:member.post_id,membership_type:member.membership_type,action:'discard_checkout'}});
      if(r.error||r.data?.error)throw new Error(await getFunctionError(r.error,r.data));
      setMessage('Unfinished checkout cleared. You can choose renewal or lifetime membership.');setPurchase(null);
    } catch(e) {setError((e as Error).message)} finally {setBusy(false)}
  }
  async function changePost(e: FormEvent) {
    e.preventDefault();
    if (!member || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.rpc("cvoa_request_post_change", {
        p_member: member.id,
        p_post: target || null,
        p_reason: reason,
      });
      if (r.error) throw r.error;
      setReason("");
      setMessage(
        "Request submitted to National. Your current post remains in place until approval.",
      );
      setVersion((v) => v + 1);
      await refreshProfile();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const actions = member ? membershipActions(member) : null;
  const pending = requests.some((r) => r.status === "pending");
  return (
    <div>
      <PageHeader eyebrow="Personal Workspace" title="My Membership" />
      <WorkspaceStatus
        loading={loading}
        error={error}
        retry={() => setVersion((v) => v + 1)}
      />
      {message && (
        <p role="status" className="panel p-4 text-sm text-status-active mb-4">
          {message}
        </p>
      )}
      {!loading && !error && !member && (
        <div className="panel p-5">
          <p>No membership is linked to this account yet.</p>
          <Link className="text-gold mt-3 inline-block" to="/join">
            Join CVOA →
          </Link>
          <p className="text-sm text-muted mt-3">
            Already paid? Contact National to link your existing membership
            before signing up again.
          </p>
        </div>
      )}
      {member && (
        <>
          <MembershipCardVisual member={member} role={profile?.role} />
          <div className="grid md:grid-cols-2 gap-6 mt-8">
            <section className="panel p-5">
              <h2 className="font-display text-xl mb-3">
                Membership & Billing
              </h2>
              <button className="text-xs text-gold mb-3" disabled={busy} onClick={discardCheckout}>Clear Unfinished Checkout</button>
              <p className="capitalize text-sm">
                {member.membership_type} ·{" "}
                {member.membership_status.replaceAll("_", " ")}
              </p>
              <p className="text-sm text-muted mt-2">
                {member.expires_at
                  ? `Paid through ${member.expires_at}`
                  : member.membership_type === "lifetime"
                    ? "Lifetime membership has no annual expiration."
                    : "Activation pending."}
              </p>
              {actions?.cancelRenewal && (
                <>
                  <p className="text-sm text-muted mt-4">
                    Automatic billing must be cancelled before a manual renewal
                    or lifetime upgrade, so you avoid overlapping charges.
                  </p>
                  <button
                    disabled={busy}
                    className="btn-ghost mt-3"
                    onClick={cancelRenewal}
                  >
                    Cancel Future Auto-Renew
                  </button>
                </>
              )}
              <div className="flex flex-wrap gap-3 mt-4">
                {actions?.completePayment && (
                  <button
                    className="btn-gold"
                    disabled={busy}
                    onClick={() => setPurchase("join")}
                  >
                    Complete Membership Payment
                  </button>
                )}
                {actions?.renew && (
                  <button
                    className="btn-gold"
                    disabled={busy}
                    onClick={() => setPurchase("renew")}
                  >
                    Renew Annual · $49.99
                  </button>
                )}
                {actions?.upgrade && (
                  <button
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => setPurchase("upgrade")}
                  >
                    Lifetime · $499.99
                  </button>
                )}
              </div>
              {purchase && (
                <div className="border border-hairline p-4 mt-4">
                  <p className="text-sm">
                    {purchase === "join"
                      ? `Complete your ${member.membership_type} membership with one payment of ${member.membership_type === "lifetime" ? "$499.99" : "$49.99"}.`
                      : purchase === "upgrade"
                        ? "Lifetime membership costs $499.99 in one payment. This checkout charges the full lifetime price; no automatic credit or proration is applied."
                        : "Annual renewal costs $49.99 in one payment and adds one year after your current paid-through date, or from today if expired."}
                  </p>
                  <p className="text-xs text-muted mt-2">
                    Membership updates after Stripe confirms payment.
                  </p>
                  <div className="flex gap-3 mt-3">
                    <button
                      className="btn-gold"
                      disabled={busy}
                      onClick={checkout}
                    >
                      {busy ? "Opening…" : "Continue to Checkout"}
                    </button>
                    <button
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => setPurchase(null)}
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}
            </section>
            <section className="panel p-5">
              <h2 className="font-display text-xl mb-3">Post Affiliation</h2>
              <p className="text-sm">
                Current:{" "}
                {posts.find((p) => p.id === member.post_id)?.name ??
                  (member.post_id ? "Assigned post" : "National at large")}
              </p>
              <p className="text-xs text-muted mt-2 mb-4">
                Post affiliation and staff appointments are separate. A transfer
                changes where your membership belongs; staff appointments remain
                assigned until National changes them.
              </p>
              {actions?.changePost && !pending && (
                <form onSubmit={changePost} className="space-y-3">
                  <label className="block text-sm">
                    Requested affiliation
                    <select
                      className="input-field mt-1"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="">National at large</option>
                      {posts
                        .filter((p) => p.id !== member.post_id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.state}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Reason
                    <textarea
                      className="input-field mt-1"
                      required
                      maxLength={3000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={busy || target === (member.post_id ?? "")}
                    className="btn-gold"
                  >
                    Request Change
                  </button>
                </form>
              )}
              {pending && (
                <p className="text-sm text-gold">
                  An affiliation request is awaiting National review.
                </p>
              )}
              <ul className="space-y-3 mt-4">
                {requests.map((r) => (
                  <li
                    key={r.id}
                    className="text-sm border-t border-hairline pt-3"
                  >
                    <p>
                      {posts.find((p) => p.id === r.target_post_id)?.name ??
                        (r.target_post_id
                          ? "Requested post"
                          : "National at large")}{" "}
                      · <span className="capitalize">{r.status}</span>
                    </p>
                    {r.review_note && (
                      <p className="text-muted mt-1">{r.review_note}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <div className="flex gap-4 mt-6 text-sm">
            <Link className="text-gold" to="/member-home">
              Start a Post / Get Involved
            </Link>
            <Link className="text-gold" to="/my-applications">
              Track My Applications
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
