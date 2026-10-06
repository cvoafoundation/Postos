import { useState, useEffect, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/AppShell";
import { Modal } from "@/components/ui/Modal";
import { supabase } from "@/lib/supabase";
import { getFunctionError } from "@/lib/functionErrors";
import { useWorkspace } from "@/lib/workspaces";
import { WorkspaceStatus } from "@/components/workspaces/WorkspaceStatus";
import { ListPagination, LIST_PAGE_SIZE } from "@/components/ui/ListPagination";
import {
  RemovedPeople,
  notifyPeopleChanged,
} from "@/components/access/RemovePerson";
import PersonWorkspace from "@/components/access/PersonWorkspace";
import {
  ROLE_LABELS,
  activationLabel,
  accountIssues,
  scopeLabel,
  type AccessDirectory,
  type AccountRow,
} from "@/lib/access";
import type { Post, UserRole } from "@/lib/types";
import { UserPlus, Loader2, ShieldCheck, AlertCircle } from "lucide-react";
const ROLES = Object.entries(ROLE_LABELS).map(([value, label]) => ({
  value: value as UserRole,
  label,
}));
type Filter = "all" | "attention" | "unlinked" | "test";
export default function UserManagement() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? ""),
    [filter, setFilter] = useState<Filter>("all"),
    [page, setPage] = useState(0),
    [showInvite, setShowInvite] = useState(false);
  const [search, setSearch] = useState(query);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const { data, loading, error, refresh } = useWorkspace<AccessDirectory>(
    "cvoa_accounts_directory",
    { p_search: search, p_view: filter, p_page: page, p_size: LIST_PAGE_SIZE },
  );
  const [selected, setSelected] = useState<{
      profile?: string;
      member?: string;
    } | null>(null),
    [repairing, setRepairing] = useState<string | null>(null),
    [actionError, setActionError] = useState<string | null>(null),
    [success, setSuccess] = useState<string | null>(null);
  useEffect(() => {
    const profile = params.get("profile"),
      member = params.get("member");
    if (profile || member)
      setSelected({
        profile: profile ?? undefined,
        member: member ?? undefined,
      });
  }, [params]);
  const accounts = data?.accounts ?? [],
    unlinked = data?.unlinked_members ?? [];
  const visible = accounts,
    memberRows = unlinked;
  function selectFilter(value: Filter) {
    setFilter(value);
    setPage(0);
  }
  async function repair(member: string, profile: string) {
    const reason = window.prompt(
      "Reason for linking this membership to the verified account (at least five characters):",
    );
    if (!reason) return;
    if (reason.trim().length < 5) {
      setActionError("Explain the reason using at least five characters.");
      return;
    }
    setRepairing(member);
    setActionError(null);
    setSuccess(null);
    try {
      const { error } = await supabase.rpc("cvoa_link_account", {
        p_member: member,
        p_profile: profile,
        p_reason: reason,
      });
      if (error) throw error;
      setSuccess(
        "Membership linked to its verified account. Appointments are preserved.",
      );
      refresh();
    } catch (e) {
      setActionError(
        (e as { message?: string }).message ??
          "Could not reconcile this record.",
      );
    } finally {
      setRepairing(null);
    }
  }
  return (
    <div>
      <PageHeader
        eyebrow="National · identity & authority"
        title="Accounts & Access"
        action={
          <button
            className="btn-gold flex items-center gap-2"
            onClick={() => setShowInvite(true)}
          >
            <UserPlus size={16} />
            Invite Account
          </button>
        }
      />
      <p className="text-sm text-muted max-w-3xl mb-6">
        One person connects membership, login activation, and appointed
        authority. Review the relationship before granting access. Every
        appointment names its state or post; Ethics Tribunal records remain
        separately restricted.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: "People & Memberships",
            count: (data?.counts.ordinary ?? 0) + (data?.counts.unlinked ?? 0),
            filter: "all" as Filter,
            detail: "Linked accounts and roster-only members",
          },
          {
            label: "Needs attention",
            count: data?.counts.attention ?? 0,
            filter: "attention" as Filter,
            detail: "Activation, identity, or scope",
          },
          {
            label: "Members without accounts",
            count: data?.counts.unlinked ?? 0,
            filter: "unlinked" as Filter,
            detail: "Invite or review a verified match",
          },
          {
            label: "Marked test accounts",
            count: data?.counts.test ?? 0,
            filter: "test" as Filter,
            detail: "Preserved and clearly separated",
          },
        ].map((c) => (
          <button
            key={c.filter}
            onClick={() => selectFilter(c.filter)}
            aria-pressed={filter === c.filter}
            className={`panel p-4 text-left ${filter === c.filter ? "border-gold" : ""}`}
          >
            <span className="eyebrow">{c.label}</span>
            <span className="block font-display text-3xl mt-2">
              {loading ? "—" : c.count}
            </span>
            <span className="block text-xs text-muted mt-2">{c.detail}</span>
          </button>
        ))}
      </div>
      <div className="panel p-4 mb-5 flex flex-wrap gap-4 items-center">
        <ShieldCheck size={20} className="text-gold" />
        <p className="text-sm flex-1">
          National: organization-wide. States: assigned state oversight. Post
          staff: assigned post operations. Delegates: designated post and state
          voting summaries.
        </p>
        <Link to="/members" className="text-gold text-sm">
          Membership Roster →
        </Link>
      </div>
      <RemovedPeople onChanged={refresh} />
      <button className="btn-ghost mb-4" onClick={refresh}>
        Refresh People
      </button>
      <label className="block text-sm mb-4">
        Search people, roles, states, or posts
        <input
          className="input-field mt-2"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Name, email, IN, post, office…"
        />
      </label>
      <WorkspaceStatus loading={loading} error={error} retry={refresh} />
      {actionError && (
        <p
          role="alert"
          className="panel p-3 text-status-attention text-sm mb-4"
        >
          {actionError}
        </p>
      )}
      {success && (
        <p role="status" className="panel p-3 text-status-active text-sm mb-4">
          {success}
        </p>
      )}
      {!loading && data && (
        <>
          <div className="panel overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-muted">
                <tr>
                  {[
                    "Person",
                    "Membership",
                    "Affiliation",
                    "Access Role",
                    "Account",
                    "Actions",
                  ].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="px-4 py-3 font-medium"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ...visible.map((a) => ({
                    id: a.profile.id,
                    name: a.profile.full_name,
                    account: a,
                    member: null,
                  })),
                  ...memberRows.map((m) => ({
                    id: m.id,
                    name: m.full_name,
                    account: null,
                    member: m,
                  })),
                ]
                  .sort(
                    (a, b) =>
                      a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
                  )
                  .map((row) =>
                    row.account ? (
                      <AccountRowView
                        key={row.id}
                        account={row.account}
                        onOpen={() => setSelected({ profile: row.id })}
                      />
                    ) : (
                      row.member && (
                        <tr
                          key={row.id}
                          className="border-b border-border hover:bg-white/5 align-top"
                        >
                          <td className="px-4 py-3">
                            <button
                              className="text-gold"
                              onClick={() => setSelected({ member: row.id })}
                            >
                              {row.name}
                            </button>
                            <p className="text-xs text-muted">
                              {row.member.email ?? "Email Not Recorded"}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            {row.member.membership_type ?? "Membership"} ·{" "}
                            {row.member.membership_status.replaceAll("_", " ")}
                          </td>
                          <td className="px-4 py-3">
                            {data.posts.find(
                              (p) => p.id === row.member?.post_id,
                            )?.name ?? "National At-Large"}
                          </td>
                          <td className="px-4 py-3 text-muted">
                            No Appointed Account
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-status-developing">
                              No Linked Login
                            </p>
                            {row.member.candidate_id && (
                              <button
                                disabled={repairing === row.id}
                                className="text-gold text-xs mt-2"
                                onClick={() =>
                                  repair(row.id, row.member!.candidate_id!)
                                }
                              >
                                Review &amp; Link Verified Account
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              className="btn-ghost text-xs"
                              onClick={() => setSelected({ member: row.id })}
                            >
                              Manage / Delete
                            </button>
                          </td>
                        </tr>
                      )
                    ),
                  )}
              </tbody>
            </table>
          </div>
          {memberRows.length + visible.length === 0 && (
            <div className="panel p-6 text-sm text-muted">
              {filter === "test"
                ? "No accounts have been marked as tests. Open a confirmed test account and review its access to label it."
                : "No people match this view."}
            </div>
          )}
          <ListPagination
            page={page}
            total={data.total}
            onPageChange={setPage}
          />
          <p className="text-xs text-muted mt-4">
            An account without membership can represent legitimate staff access.
            Test accounts are labeled by an administrator; names and email
            addresses never trigger automatic deletion or reclassification.
          </p>
        </>
      )}
      {selected && (
        <Modal title="Person workspace" onClose={() => setSelected(null)}>
          <PersonWorkspace
            profileId={selected.profile}
            memberId={selected.member}
            posts={data?.posts}
            onChanged={refresh}
          />
        </Modal>
      )}
      {showInvite && (
        <InviteUserModal
          posts={(data?.posts ?? []) as Post[]}
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false);
            notifyPeopleChanged();
            refresh();
          }}
        />
      )}
    </div>
  );
}
function AccountRowView({
  account: a,
  onOpen,
}: {
  account: AccountRow;
  onOpen: () => void;
}) {
  const issues = accountIssues(a);
  return (
    <tr className="border-b border-border last:border-0 hover:bg-white/5 align-top">
      <td className="px-4 py-3">
        <button className="text-left font-medium text-gold" onClick={onOpen}>
          {a.profile.full_name}
        </button>
        <p className="text-xs text-muted mt-1">{a.profile.email}</p>
        {a.profile.is_test_account && (
          <span className="text-xs text-status-attention">Test account</span>
        )}
      </td>
      <td className="px-4 py-3">
        {a.memberships.length ? (
          a.memberships.map((m) => (
            <p key={m.id}>
              {m.membership_type?.replaceAll("_", " ")} ·{" "}
              {m.membership_status.replaceAll("_", " ")}
            </p>
          ))
        ) : (
          <span className="text-muted">No linked membership</span>
        )}
      </td>
      <td className="px-4 py-3">
        {a.memberships.length ? (
          a.memberships.map((m) => (
            <p key={m.id}>
              {m.post_name ??
                (m.post_id ? "Assigned post" : "At-large member (no post)")}
            </p>
          ))
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {a.scopes.map((s) => (
          <div key={s.scope_id} className="mb-1">
            <span>{ROLE_LABELS[s.role]}</span>
            <p className="text-xs text-muted">{scopeLabel(s)}</p>
          </div>
        ))}
      </td>
      <td className="px-4 py-3">
        <span
          className={
            a.profile.access_suspended ? "text-status-attention" : "text-muted"
          }
        >
          {activationLabel({
            ...a,
            access_suspended: a.profile.access_suspended,
          })}
        </span>
        {issues.length > 0 && (
          <p className="text-xs text-status-developing mt-1">
            {issues.join(" · ")}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <button
          className="btn-ghost text-xs whitespace-nowrap"
          onClick={onOpen}
        >
          Manage / Delete
        </button>
      </td>
    </tr>
  );
}

function InviteUserModal({
  posts,
  onClose,
  onInvited,
}: {
  posts: Post[];
  onClose: () => void;
  onInvited: () => void;
}) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    role: "guest_applicant" as UserRole,
    post_id: "",
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "invite-user",
        {
          body: {
            email: form.email,
            full_name: form.full_name,
            role: form.role,
            post_id: form.post_id || null,
          },
        },
      );
      if (invokeError || data?.error) {
        setError(await getFunctionError(invokeError, data));
        return;
      }
      onInvited();
    } catch (error) {
      setError(await getFunctionError(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal title="Invite New User" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-xs text-muted">
          Sends them a real invite email with a link to set their own password.
          Staff authority is assigned separately through a reviewed appointment
          after the account is created.
        </p>
        <input
          required
          placeholder="Full name"
          className="input-field"
          value={form.full_name}
          onChange={(e) => update("full_name", e.target.value)}
        />
        <input
          required
          type="email"
          placeholder="Email"
          className="input-field"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
        />
        <select
          className="input-field"
          value={form.role}
          onChange={(e) => update("role", e.target.value as UserRole)}
        >
          {ROLES.filter((r) =>
            ["guest_applicant", "member"].includes(r.value),
          ).map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          className="input-field"
          value={form.post_id}
          onChange={(e) => update("post_id", e.target.value)}
        >
          <option value="">No assigned post</option>
          {posts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {error && <p className="text-status-attention text-sm">{error}</p>}
        <button
          type="submit"
          disabled={sending}
          className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {sending ? (
            <>
              <Loader2 className="animate-spin" size={16} /> Sending invite…
            </>
          ) : (
            "Send Invite"
          )}
        </button>
      </form>
    </Modal>
  );
}
