import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
export interface FieldSpec {
  key: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "number"
    | "date"
    | "datetime-local"
    | "checkbox"
    | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  min?: number;
}
export function GovernanceForm({
  title,
  fields,
  initial = {},
  onSubmit,
  onClose,
}: {
  title: string;
  fields: FieldSpec[];
  initial?: Record<string, any>;
  onSubmit: (value: Record<string, any>) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit} className="space-y-4">
        {fields.map((f) => (
          <label className="block text-sm" key={f.key}>
            {f.label}
            {f.type === "checkbox" ? (
              <input
                type="checkbox"
                required={f.required}
                className="ml-3"
                checked={!!value[f.key]}
                onChange={(e) =>
                  setValue((v) => ({ ...v, [f.key]: e.target.checked }))
                }
                disabled={busy}
              />
            ) : f.type === "select" ? (
              <select
                className="input-field mt-1"
                required={f.required}
                value={value[f.key] ?? ""}
                onChange={(e) =>
                  setValue((v) => ({ ...v, [f.key]: e.target.value }))
                }
                disabled={busy}
              >
                <option value="">Choose…</option>
                {f.options?.map((o) => (
                  <option value={o.value} key={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                className="input-field mt-1"
                rows={3}
                required={f.required}
                maxLength={12000}
                value={value[f.key] ?? ""}
                onChange={(e) =>
                  setValue((v) => ({ ...v, [f.key]: e.target.value }))
                }
                disabled={busy}
              />
            ) : (
              <input
                className="input-field mt-1"
                type={f.type ?? "text"}
                min={f.min}
                required={f.required}
                value={value[f.key] ?? ""}
                onChange={(e) =>
                  setValue((v) => ({ ...v, [f.key]: e.target.value }))
                }
                disabled={busy}
              />
            )}
            {f.hint && (
              <span className="block text-xs text-muted mt-1">{f.hint}</span>
            )}
          </label>
        ))}
        {error && (
          <p className="text-status-attention" role="alert">
            {error}
          </p>
        )}
        <button className="btn-gold" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </Modal>
  );
}
export const options = (values: string[]) =>
  values.map((value) => ({ value, label: value.replaceAll("_", " ") }));
