import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_HEALTH_POLICY, type HealthPolicy } from "@/lib/postHealth";
const numericFields: { key: keyof HealthPolicy; label: string }[] = [
  { key: "meeting_green_days", label: "Meeting freshness: green through days" },
  {
    key: "meeting_yellow_days",
    label: "Meeting freshness: yellow through days",
  },
  { key: "membership_green", label: "Active members for green" },
  { key: "membership_yellow", label: "Active members for yellow" },
  { key: "new_post_days", label: "New-post grace period in days" },
  { key: "signature_days", label: "Signature freshness in days" },
  { key: "service_green_days", label: "Service activity: green through days" },
  {
    key: "service_yellow_days",
    label: "Service activity: yellow through days",
  },
  { key: "financial_fresh_days", label: "Financial record freshness in days" },
];
const signalKeys = [
  "officers",
  "meetings",
  "membership",
  "congress",
  "governance",
  "annual_review",
  "community_service",
  "financial",
  "sponsors",
];
export default function HealthPolicyEditor({
  policy,
  onSaved,
}: {
  policy: { version: number; settings: HealthPolicy; updated_at: string };
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false),
    [settings, setSettings] = useState<HealthPolicy>({
      ...DEFAULT_HEALTH_POLICY,
      ...policy.settings,
    }),
    [reason, setReason] = useState(""),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await supabase.rpc("cvoa_save_health_policy", {
      p_version: policy.version,
      p_settings: settings,
      p_reason: reason.trim(),
    });
    setBusy(false);
    if (r.error) setError(r.error.message);
    else onSaved();
  }
  const toggle = (key: "required_positions" | "critical_keys", value: string) =>
    setSettings((s) => ({
      ...s,
      [key]: s[key].includes(value)
        ? s[key].filter((v) => v !== value)
        : [...s[key], value],
    }));
  return (
    <section className="panel p-5">
      <button
        className="text-gold text-sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        National Operational Standards
      </button>
      <p className="text-xs text-muted mt-2">
        Version {policy.version} ·{" "}
        {policy.settings.confirmed
          ? "Confirmed by National"
          : "Provisional defaults awaiting National review"}{" "}
        · Updated {new Date(policy.updated_at).toLocaleString()}
      </p>
      {open && (
        <form onSubmit={save} className="space-y-5 mt-4">
          <p className="text-sm text-muted">
            These settings apply across post health dashboards. They are
            operational indicators. Each scored signal carries equal weight, and
            a red critical signal determines the red overall status. Record the
            approved policy or reason for changes.
          </p>
          {error && (
            <p role="alert" className="text-status-attention">
              {error}
            </p>
          )}
          <fieldset>
            <legend className="text-sm font-medium mb-2">
              Officer positions included in staffing
            </legend>
            <div className="flex gap-4 flex-wrap">
              {DEFAULT_HEALTH_POLICY.required_positions.map((position) => (
                <label key={position} className="text-sm capitalize">
                  <input
                    type="checkbox"
                    checked={settings.required_positions.includes(position)}
                    onChange={() => toggle("required_positions", position)}
                    className="mr-2"
                  />
                  {position.replaceAll("_", " ")}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid sm:grid-cols-2 gap-4">
            {numericFields.map((f) => (
              <label key={f.key} className="text-sm">
                {f.label}
                <input
                  type="number"
                  required
                  min={1}
                  max={10000}
                  step={1}
                  className="input-field mt-1"
                  value={Number(settings[f.key])}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      [f.key]: Number(e.target.value),
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <fieldset>
            <legend className="text-sm font-medium mb-2">
              Critical signals that override the average
            </legend>
            <div className="flex gap-4 flex-wrap">
              {signalKeys.map((signal) => (
                <label key={signal} className="text-sm capitalize">
                  <input
                    type="checkbox"
                    checked={settings.critical_keys.includes(signal)}
                    onChange={() => toggle("critical_keys", signal)}
                    className="mr-2"
                  />
                  {signal.replaceAll("_", " ")}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={settings.confirmed}
              onChange={(e) =>
                setSettings((s) => ({ ...s, confirmed: e.target.checked }))
              }
              className="mr-2"
            />
            National has reviewed these operational standards
          </label>
          <label className="block text-sm">
            Authority or reason
            <textarea
              required
              minLength={5}
              maxLength={1000}
              className="input-field mt-1"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            disabled={
              busy ||
              !settings.required_positions.length ||
              reason.trim().length < 5
            }
            className="btn-gold"
          >
            {busy ? "Saving…" : "Save Operational Standards"}
          </button>
        </form>
      )}
    </section>
  );
}
