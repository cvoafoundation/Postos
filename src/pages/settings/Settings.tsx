import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/AppShell";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { getFunctionError } from "@/lib/functionErrors";
import ProfileAvatar from "@/components/account/ProfileAvatar";
import { prepareProfilePhoto } from "./profilePhoto";
type SettingsData = {
  full_name: string;
  phone: string | null;
  email: string;
  avatar_path: string | null;
  memberships: {
    id: string;
    membership_type: string;
    membership_status: string;
    expires_at: string | null;
    auto_renew: boolean;
  }[];
  payments: {
    id: string;
    amount: number;
    status: string;
    paid_at: string | null;
    created_at: string;
  }[];
};
const message = (e: unknown) =>
  (e as { message?: string })?.message ??
  "Could not save this change. Please retry.";
export default function Settings() {
  const { profile } = useAuth();
  return <AccountSettings key={profile?.id} />;
}
function AccountSettings() {
  const { profile, refreshProfile, membershipOnly } = useAuth(),
    [params] = useSearchParams();
  const [data, setData] = useState<SettingsData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    void supabase
      .rpc("cvoa_account_settings")
      .then(({ data, error }) => {
        if (alive) {
          if (error) setError(error.message);
          else setData(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(message(e));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [version]);
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Your account"
        title="Settings"
        description="Manage your profile, payment methods, and sign-in security."
        action={
          <button
            className="btn-ghost"
            disabled={loading}
            onClick={() => setVersion((v) => v + 1)}
          >
            Refresh
          </button>
        }
      />
      <nav
        aria-label="Settings sections"
        className="flex gap-2 overflow-x-auto pb-2"
      >
        <a className="btn-ghost whitespace-nowrap" href="#profile-settings">
          Profile & photo
        </a>
        <a className="btn-ghost whitespace-nowrap" href="#billing-settings">
          Membership & billing
        </a>
        <a className="btn-ghost whitespace-nowrap" href="#security-settings">
          Sign-in & security
        </a>
      </nav>
      {params.get("billing") === "returned" && (
        <p role="status" className="text-sm text-muted">
          You’re back from secure billing. Payment methods are managed in
          Stripe.
        </p>
      )}
      {loading && (
        <p role="status" className="text-sm text-muted">
          Loading your settings…
        </p>
      )}
      {error && (
        <p role="alert" className="text-status-attention">
          {error}
        </p>
      )}
      {data && (
        <>
          <section
            id="profile-settings"
            className="panel p-5 sm:p-6 space-y-6 scroll-mt-24"
          >
            <h2 className="font-display text-2xl">Profile & Photo</h2>
            <PhotoSection />
            <ProfileSection
              initialName={data.full_name}
              initialPhone={data.phone ?? ""}
              onSaved={async (result) => {
                setData(result);
                await refreshProfile();
              }}
            />
            <p className="text-xs text-muted">
              Your display name identifies your account. Contact National to
              correct the official name on your membership record.
            </p>
          </section>
          <BillingSection
            data={data}
            membershipOnly={membershipOnly}
            onChanged={() => setVersion((v) => v + 1)}
          />
        </>
      )}
      <section
        id="security-settings"
        className="panel p-5 sm:p-6 space-y-6 scroll-mt-24"
      >
        <h2 className="font-display text-2xl">Sign-in & Security</h2>
        <SecuritySection email={data?.email ?? profile?.email ?? ""} />
      </section>
    </div>
  );
}
function PhotoSection() {
  const { profile, refreshProfile } = useAuth(),
    [prepared, setPrepared] = useState<Blob | null>(null),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (!prepared) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(prepared);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [prepared]);
  async function save(remove = false) {
    if (!profile || busy || (!remove && !prepared)) return;
    setBusy(true);
    setError("");
    setNotice("");
    const old = profile.avatar_path;
    let uploaded: string | null = null;
    try {
      if (!remove && prepared) {
        uploaded = `${profile.id}/${crypto.randomUUID()}.webp`;
        const r = await supabase.storage
          .from("profile-photos")
          .upload(uploaded, prepared, {
            contentType: "image/webp",
            upsert: false,
          });
        if (r.error) throw r.error;
      }
      const saved = await supabase.rpc("cvoa_set_profile_photo", {
        p_path: remove ? null : uploaded,
      });
      if (saved.error) throw saved.error;
      uploaded = null;
      setPrepared(null);
      await refreshProfile();
      setNotice(remove ? "Profile photo removed." : "Profile photo saved.");
      if (old)
        try {
          await supabase.storage.from("profile-photos").remove([old]);
        } catch {}
    } catch (e) {
      setError(message(e));
      if (uploaded)
        await supabase.storage.from("profile-photos").remove([uploaded]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-4 items-center">
        {preview ? (
          <img
            src={preview}
            alt="New photo preview"
            className="h-24 w-24 rounded-full object-cover"
          />
        ) : (
          <ProfileAvatar className="h-24 w-24 text-3xl" />
        )}
        <div>
          <label className="block text-sm font-medium" htmlFor="profile-photo">
            Your profile photo
          </label>
          <p className="text-xs text-muted mt-1">
            JPG, PNG, or WebP · up to 10 MB. A square preview is shown before
            saving.
          </p>
        </div>
      </div>
      <input
        id="profile-photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        className="block w-full text-sm"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setError("");
          setNotice("");
          setPrepared(null);
          try {
            setPrepared(await prepareProfilePhoto(file));
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      />
      <div className="flex flex-wrap gap-3">
        {prepared && (
          <button
            className="btn-gold"
            disabled={busy}
            onClick={() => void save()}
          >
            Save photo
          </button>
        )}
        {prepared && (
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={() => setPrepared(null)}
          >
            Discard preview
          </button>
        )}
        {profile?.avatar_path && (
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={() => void save(true)}
          >
            Remove photo
          </button>
        )}
      </div>
      {busy && (
        <p role="status" className="text-sm text-muted">
          Preparing or saving your photo…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-status-attention">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-status-active">
          {notice}
        </p>
      )}
    </div>
  );
}
function ProfileSection({
  initialName,
  initialPhone,
  onSaved,
}: {
  initialName: string;
  initialPhone: string;
  onSaved: (data: SettingsData) => Promise<void>;
}) {
  const [name, setName] = useState(initialName),
    [phone, setPhone] = useState(initialPhone),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await supabase.rpc("cvoa_save_account_profile", {
        p_name: name.trim(),
        p_phone: phone.trim(),
      });
      if (r.error) throw r.error;
      await onSaved(r.data);
      setNotice("Profile saved.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-4 border-t border-hairline pt-5">
      <label className="block text-sm">
        Display name
        <input
          className="input-field mt-2"
          required
          minLength={1}
          maxLength={120}
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Phone (optional)
        <input
          className="input-field mt-2"
          type="tel"
          maxLength={40}
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="text-status-attention text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-status-active text-sm">
          {notice}
        </p>
      )}
      <button disabled={busy} className="btn-gold">
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
function BillingSection({
  data,
  membershipOnly,
  onChanged,
}: {
  data: SettingsData;
  membershipOnly: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function openPortal() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await supabase.functions.invoke(
        "create-member-billing-portal",
        { body: {} },
      );
      if (r.error || r.data?.error)
        throw new Error(await getFunctionError(r.error, r.data));
      const url = new URL(r.data?.url);
      if (url.protocol !== "https:" || url.hostname !== "billing.stripe.com")
        throw new Error("Secure billing did not return a valid link.");
      window.location.assign(url.href);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }
  async function cancel(id: string) {
    if (
      busy ||
      !window.confirm(
        "Stop future automatic renewals? Your paid membership time stays available.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await supabase.functions.invoke(
        "cancel-membership-subscription",
        { body: { member_id: id } },
      );
      if (r.error || r.data?.error)
        throw new Error(await getFunctionError(r.error, r.data));
      setNotice(
        "Future automatic renewals stopped. Your paid membership time is unchanged.",
      );
      onChanged();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      id="billing-settings"
      className="panel p-5 sm:p-6 space-y-4 scroll-mt-24"
    >
      <h2 className="font-display text-2xl">Membership & Billing</h2>
      <p className="text-sm text-muted">
        Add or update your payment method and billing address securely in
        Stripe. A card update does not charge you or change your membership.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          className="btn-gold"
          disabled={busy || !data.memberships.length}
          onClick={() => void openPortal()}
        >
          {busy ? "Please wait…" : "Manage payment methods"}
        </button>
        <Link className="btn-ghost" to="/my-membership">
          {membershipOnly ? "Membership card" : "Membership, renewal & upgrade"}
        </Link>
      </div>
      {!data.memberships.length && (
        <p className="text-sm text-muted">
          Contact National to link your membership before managing payment
          details.
        </p>
      )}
      <ul className="divide-y divide-hairline">
        {data.memberships.map((m) => (
          <li key={m.id} className="py-4 text-sm space-y-2">
            <p className="capitalize">
              {m.membership_type} · {m.membership_status}
            </p>
            <p className="text-muted">
              {m.membership_type === "lifetime"
                ? "Lifetime membership · No recurring dues"
                : m.expires_at
                  ? `Expires ${m.expires_at}`
                  : "Expiration not recorded"}
              {m.auto_renew ? " · Automatic renewal on" : ""}
            </p>
            {m.auto_renew && (
              <button
                disabled={busy}
                className="text-gold"
                onClick={() => void cancel(m.id)}
              >
                Stop automatic renewals
              </button>
            )}
          </li>
        ))}
      </ul>
      <details className="border-t border-hairline pt-4">
        <summary className="cursor-pointer text-sm">
          Membership payment history
        </summary>
        <p className="text-xs text-muted mt-2">
          Your latest 50 recorded membership transactions.
        </p>
        {data.payments.length ? (
          <ul className="divide-y divide-hairline mt-3">
            {data.payments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap justify-between gap-2 py-3 text-sm"
              >
                <span>{(p.paid_at ?? p.created_at).slice(0, 10)}</span>
                <span>
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                  }).format(Number(p.amount))}{" "}
                  ·{" "}
                  <span className="capitalize">
                    {p.status.replaceAll("_", " ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted mt-3">
            No membership transactions recorded for this account.
          </p>
        )}
      </details>
      {error && (
        <p role="alert" className="text-sm text-status-attention">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-status-active">
          {notice}
        </p>
      )}
    </section>
  );
}
function SecuritySection({ email }: { email: string }) {
  const { session, signOut } = useAuth(),
    [nextEmail, setNextEmail] = useState(""),
    [emailPassword, setEmailPassword] = useState(""),
    [currentPassword, setCurrentPassword] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function reauthenticate(current: string) {
    const signed = await supabase.auth.signInWithPassword({
      email: session?.user.email ?? email,
      password: current,
    });
    if (signed.error) throw signed.error;
  }
  async function update(kind: "email" | "password", e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    if (kind === "password" && (password.length < 8 || password !== confirm)) {
      setError("Use at least eight characters and enter matching passwords.");
      return;
    }
    if (
      kind === "email" &&
      nextEmail.trim().toLowerCase() === email.toLowerCase()
    ) {
      setError("Enter a different email address.");
      return;
    }
    setBusy(true);
    try {
      await reauthenticate(kind === "email" ? emailPassword : currentPassword);
      const r = await supabase.auth.updateUser(
        kind === "email" ? { email: nextEmail.trim() } : { password },
        kind === "email"
          ? { emailRedirectTo: "https://cvoa.one/settings" }
          : undefined,
      );
      if (r.error) throw r.error;
      setNotice(
        kind === "email"
          ? "Check your current and new email inboxes for confirmation instructions. Your sign-in address changes after confirmation."
          : "Password updated.",
      );
      setCurrentPassword("");
      setEmailPassword("");
      setPassword("");
      setConfirm("");
      if (kind === "email") setNextEmail("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function otherSessions() {
    if (
      busy ||
      !window.confirm(
        "Sign out your other devices? This device will stay signed in.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await supabase.auth.signOut({ scope: "others" });
      if (r.error) throw r.error;
      setNotice("Other sessions signed out.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted">Sign-in email</p>
        <p className="text-sm break-all mt-1">{email || "Loading…"}</p>
      </div>
      <details>
        <summary className="cursor-pointer font-medium text-sm">
          Change email address
        </summary>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => void update("email", e)}
        >
          <label className="block text-sm">
            New email
            <input
              type="email"
              autoComplete="email"
              required
              className="input-field mt-2"
              value={nextEmail}
              onChange={(e) => setNextEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Current password
            <input
              type="password"
              autoComplete="current-password"
              required
              className="input-field mt-2"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
            />
          </label>
          <button disabled={busy} className="btn-ghost">
            Send confirmation instructions
          </button>
        </form>
      </details>
      <details>
        <summary className="cursor-pointer font-medium text-sm">
          Change password
        </summary>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => void update("password", e)}
        >
          <label className="block text-sm">
            Current password
            <input
              type="password"
              autoComplete="current-password"
              required
              className="input-field mt-2"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="input-field mt-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="input-field mt-2"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <button disabled={busy} className="btn-ghost">
            Update password
          </button>
        </form>
      </details>
      <div className="border-t border-hairline pt-5">
        <h3 className="font-medium text-sm mb-3">Your sessions</h3>
        <div className="flex flex-wrap gap-3">
          <button
            disabled={busy}
            className="btn-ghost"
            onClick={() => void otherSessions()}
          >
            Sign out other devices
          </button>
          <button
            disabled={busy}
            className="btn-ghost"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-status-attention">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-status-active">
          {notice}
        </p>
      )}
    </div>
  );
}
