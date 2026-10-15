import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Post } from "@/lib/types";
import { postDisplayName } from "@/pages/posts/model";
import { Modal } from "@/components/ui/Modal";
import { MembershipCardVisual } from "@/components/membership/MembershipCardVisual";
import MembershipCardPage from "./MembershipCardPage";
import { PageHeader } from "@/components/layout/AppShell";
import { CheckCircle2, Copy, Check } from "lucide-react";
import { useMemberHome } from "./useMemberHome";
import { nextSteps, companySessions } from "./memberHomeModel";

const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
];

export default function MemberHome() {
  const { membershipOnly, profile } = useAuth();
  return membershipOnly ? (
    <MembershipCardPage />
  ) : (
    <MemberOverview key={profile?.id} />
  );
}
function MemberOverview() {
  const { profile } = useAuth();
  const { data, errors, loading, refresh } = useMemberHome(profile?.id);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showStartPost, setShowStartPost] = useState(
      searchParams.get("start") === "company",
    ),
    [showRecruit, setShowRecruit] = useState(false);
  const { member, posts } = data;
  const today = new Date().toLocaleDateString("en-CA");
  const homePost = posts.find((p) => p.id === member?.post_id);
  const verification = data.verification.find((v) => v.id === member?.id);
  const tasks = errors.membership
    ? []
    : nextSteps(member, verification, data.applications, today);
  const company = companySessions(
    data.meetings.sessions,
    data.meetings.bodies,
    member?.post_id,
  );
  const representatives = member?.post_id
    ? data.delegates.filter(
        (d) =>
          d.post_id === member.post_id &&
          d.profile_id &&
          (!d.term_start || d.term_start <= today) &&
          (!d.term_end || d.term_end >= today),
      )
    : [];
  const names = new Map(data.labels.profiles.map((p) => [p.id, p.full_name]));
  const hasErrors = Object.keys(errors).length > 0;
  const serviceStatus =
    verification?.status === "verified"
      ? "Service verified"
      : verification?.status === "rejected"
        ? "Updated document requested"
        : verification?.has_document
          ? "Awaiting staff review"
          : verification
            ? "Document needed"
            : "Verification status unavailable";
  const companyName = homePost
    ? postDisplayName(homePost)
    : member?.post_id
      ? "Your affiliated company"
      : "National at large";
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your CVOA"
        description="Your membership, company, and representation in one place."
        title={`Welcome${profile?.full_name ? ", " + profile.full_name.split(" ")[0] : ""}`}
        action={
          <button className="btn-ghost" disabled={loading} onClick={refresh}>
            Refresh
          </button>
        }
      />
      {loading ? (
        <p role="status" className="text-sm text-muted">
          Loading your member home…
        </p>
      ) : (
        <>
          {hasErrors && (
            <p role="alert" className="text-status-attention text-sm">
              Some information could not be loaded. Available sections are shown
              below. Use Refresh to retry.
            </p>
          )}
          <section
            className="panel p-5 sm:p-6"
            aria-labelledby="next-steps-heading"
          >
            <h2 id="next-steps-heading" className="font-display text-2xl">
              My Next Steps
            </h2>
            {tasks.length ? (
              <ul className="divide-y divide-hairline mt-3">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <Link className="block py-4 hover:text-gold" to={t.to}>
                      <strong className="text-sm">{t.title} →</strong>
                      <p className="text-sm text-muted mt-1">{t.detail}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted mt-3">
                {hasErrors
                  ? "Refresh to check whether anything needs your attention."
                  : "You’re caught up. Check your company activity and open votes below."}
              </p>
            )}
          </section>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            <section
              className="panel p-5 sm:p-6 space-y-4"
              aria-labelledby="membership-heading"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="membership-heading" className="font-display text-2xl">
                  My Membership
                </h2>
                <Link to="/my-membership" className="text-sm text-gold">
                  Manage membership →
                </Link>
              </div>
              {errors.membership ? (
                <p className="text-status-attention text-sm">
                  Membership information could not be loaded.
                </p>
              ) : member ? (
                <>
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-muted">Membership</dt>
                      <dd className="capitalize mt-1">
                        {member.membership_type} · {member.membership_status}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">
                        {member.membership_type === "lifetime"
                          ? "Term"
                          : "Expiration"}
                      </dt>
                      <dd className="mt-1">
                        {member.membership_type === "lifetime"
                          ? "Lifetime"
                          : (member.expires_at ?? "Not recorded")}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-sm">
                    {serviceStatus}
                    {errors.verification && " · Refresh to retry."}
                  </p>
                  <div className="flex gap-x-5 gap-y-3 flex-wrap text-sm">
                    <Link className="text-gold" to="/my-membership">
                      {member.membership_type === "lifetime"
                        ? "View membership card"
                        : "Renew or upgrade"}{" "}
                      →
                    </Link>
                    <Link className="text-gold" to="/membership-verification">
                      Service verification →
                    </Link>
                  </div>
                  <details className="border-t border-hairline pt-4">
                    <summary className="text-sm cursor-pointer">
                      Show my membership card
                    </summary>
                    <div className="mt-4">
                      <MembershipCardVisual
                        member={member}
                        role={profile?.role}
                      />
                      <Link
                        to="/my-membership"
                        className="block text-sm text-gold text-center mt-3"
                      >
                        Open card and membership details →
                      </Link>
                    </div>
                  </details>
                </>
              ) : (
                <p className="text-sm text-muted">
                  Your account does not have a linked membership yet. Open My
                  Membership for assistance and next steps.
                </p>
              )}
            </section>
            <section
              className="panel p-5 sm:p-6 space-y-4"
              aria-labelledby="company-heading"
            >
              <h2 id="company-heading" className="font-display text-2xl">
                My Company
              </h2>
              <p className="text-sm">
                {errors.membership
                  ? "Company information unavailable"
                  : companyName}
              </p>
              {member?.post_id ? (
                <>
                  <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
                    <Link
                      className="text-gold"
                      to={`/meetings?post=${member.post_id}`}
                    >
                      Meetings & minutes →
                    </Link>
                    <Link className="text-gold" to="/shared-files">
                      Shared documents →
                    </Link>
                    {profile?.post_id === member.post_id && (
                      <Link className="text-gold" to="/post-officers">
                        Company leadership →
                      </Link>
                    )}
                  </div>
                  {errors.meetings ? (
                    <p className="text-sm text-muted">
                      Meeting activity could not be loaded. Open Meetings or
                      refresh to retry.
                    </p>
                  ) : (
                    <>
                      <h3 className="font-medium text-sm">
                        Scheduled & ongoing meetings
                      </h3>
                      {company.upcoming.length ? (
                        <ul className="space-y-3">
                          {company.upcoming.map((s) => (
                            <li key={s.id} className="text-sm">
                              <Link
                                className="text-gold"
                                to={
                                  s.readable === false
                                    ? `/meetings?post=${member.post_id}`
                                    : `/meetings/session/${s.id}`
                                }
                              >
                                {s.title} →
                              </Link>
                              <p className="text-xs text-muted mt-1">
                                {new Date(s.scheduled_at).toLocaleString()}
                                {s.readable === false
                                  ? " · Record available after publication"
                                  : ""}
                              </p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted">
                          No upcoming company meetings listed.
                        </p>
                      )}
                      {company.published.length > 0 && (
                        <div>
                          <h3 className="font-medium text-sm mb-2">
                            Latest published minutes
                          </h3>
                          <ul className="space-y-2 text-sm">
                            {company.published.map((s) => (
                              <li key={s.id}>
                                <Link
                                  className="text-gold"
                                  to={`/meetings/session/${s.id}`}
                                >
                                  {s.title} · Read or print →
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted">
                  You can participate as a National at-large member. Company
                  affiliation is optional; explore it in My Membership when
                  you’re ready.
                </p>
              )}
              {errors.companies && (
                <p className="text-sm text-muted">
                  Company names could not be loaded.
                </p>
              )}
              {member?.post_id && (
                <div>
                  <h3 className="font-medium text-sm mb-2">
                    Upcoming company events
                  </h3>
                  {errors.events ? (
                    <p className="text-sm text-muted">
                      Event information could not be loaded.
                    </p>
                  ) : data.events.length ? (
                    <ul className="space-y-2 text-sm">
                      {data.events.map((e) => (
                        <li key={e.id}>
                          {e.title}
                          <span className="text-muted"> · {e.event_date}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">
                      No upcoming community events listed.
                    </p>
                  )}
                </div>
              )}
              <Link
                to="/my-membership"
                className="inline-block text-sm text-gold"
              >
                {member?.post_id
                  ? "Manage company affiliation"
                  : "Explore company affiliation"}{" "}
                →
              </Link>
            </section>
          </div>
          <section
            className="panel p-5 sm:p-6 space-y-4"
            aria-labelledby="representation-heading"
          >
            <h2 id="representation-heading" className="font-display text-2xl">
              My Representation
            </h2>
            {errors.delegates || errors.labels ? (
              <p className="text-sm text-muted">
                Delegate information could not be loaded. Open the Congress
                directory or refresh to retry.
              </p>
            ) : representatives.length ? (
              <ul className="space-y-2 text-sm">
                {representatives.map((d) => (
                  <li key={d.id}>
                    <strong>
                      {names.get(d.profile_id!) ?? "Appointed delegate"}
                    </strong>{" "}
                    · {d.is_alternate ? "Alternate" : "Primary delegate"} ·{" "}
                    {companyName}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                {member?.post_id
                  ? "No active delegate is listed for your company. NCC manages Congress appointments."
                  : "You can follow Congress and open resolutions. The delegate directory shows which companies currently have representation."}
              </p>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
              <Link className="text-gold" to="/congress">
                Open votes & resolutions →
              </Link>
              <Link className="text-gold" to="/congress/delegates">
                Delegate directory →
              </Link>
              <Link className="text-gold" to="/file-complaint">
                Ethics Tribunal · Submit or follow a complaint →
              </Link>
            </div>
          </section>
          <details className="panel p-5 sm:p-6">
            <summary className="cursor-pointer font-display text-xl">
              Get Involved & Company Applications
            </summary>
            <p className="text-sm text-muted mt-4">
              Help grow CVOA or track a company application.
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              <Link className="btn-ghost" to="/my-applications">
                My applications
                {data.applications.length
                  ? ` (${data.applications.length})`
                  : ""}
              </Link>
              <button
                className="btn-ghost"
                onClick={() => setShowStartPost(true)}
              >
                Start a company
              </button>
              <button
                className="btn-ghost"
                onClick={() => setShowRecruit(true)}
              >
                Share a membership link
              </button>
            </div>
            {errors.applications && (
              <p className="text-sm text-muted mt-3">
                Application updates could not be loaded. Open My Applications or
                refresh to retry.
              </p>
            )}
          </details>
        </>
      )}
      {showStartPost && (
        <StartPostModal
          defaultName={profile?.full_name ?? ""}
          defaultEmail={profile?.email ?? ""}
          onClose={() => {
            setShowStartPost(false);
            if (searchParams.has("start")) {
              const next = new URLSearchParams(searchParams);
              next.delete("start");
              setSearchParams(next, { replace: true });
            }
            refresh();
          }}
        />
      )}
      {showRecruit && (
        <RecruitLinkModal
          post={homePost ?? null}
          onClose={() => setShowRecruit(false)}
        />
      )}
    </div>
  );
}

function RecruitLinkModal({
  post,
  onClose,
}: {
  post: Post | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // National at-large members (no post_id) don't have a single post's
  // sign-up link to share — point them at the general join page instead.
  const link = post
    ? `${window.location.origin}/join-post/${post.id}`
    : `${window.location.origin}/join`;

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal title="Recruiting Link" onClose={onClose}>
      <p className="text-sm text-muted mb-4">
        {post
          ? `Share this link with a veteran you think should join ${post.name}. It drops them straight into that post's recruiting pipeline.`
          : `You're not currently tied to a specific post, so this is the general CVOA sign-up link.`}
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          className="input-field flex-1 text-xs font-mono"
          onFocus={(e) => e.target.select()}
        />
        <button
          onClick={copyLink}
          className="btn-gold px-3 py-2 shrink-0"
          aria-label="Copy link"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
    </Modal>
  );
}

function StartPostModal({
  defaultName,
  defaultEmail,
  onClose,
}: {
  defaultName: string;
  defaultEmail: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: defaultName,
    email: defaultEmail,
    phone: "",
    city: "",
    state: "",
    motivation: "",
  });
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("post_applications").insert({
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      city: form.city || null,
      state: form.state,
      motivation: form.motivation || null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSubmitted(true);
  }

  return (
    <Modal title="Start a CVOA Company" onClose={onClose}>
      {submitted ? (
        <div className="text-center py-6">
          <CheckCircle2 className="mx-auto mb-3 text-status-active" size={36} />
          <p className="text-sm text-ink">
            Submitted — National will follow up with next steps.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            aria-label="Your name"
            placeholder="Your name"
            className="input-field"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
          />
          <input
            required
            type="email"
            aria-label="Email"
            placeholder="Email"
            className="input-field"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              aria-label="City"
              placeholder="City"
              className="input-field"
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
            />
            <select
              required
              aria-label="State"
              className="input-field"
              value={form.state}
              onChange={(e) => update("state", e.target.value)}
            >
              <option value="">State</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <input
            aria-label="Phone"
            placeholder="Phone"
            className="input-field"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
          />
          <textarea
            aria-label="Why do you want to start a company here?"
            placeholder="Why do you want to start a company here?"
            className="input-field"
            rows={3}
            value={form.motivation}
            onChange={(e) => update("motivation", e.target.value)}
          />
          {error && <p className="text-status-attention text-sm">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="btn-gold w-full disabled:opacity-50"
          >
            {saving ? "Submitting…" : "Submit Application"}
          </button>
        </form>
      )}
    </Modal>
  );
}
