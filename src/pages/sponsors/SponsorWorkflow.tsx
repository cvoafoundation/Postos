import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  GovernanceForm,
  type FieldSpec,
} from "@/pages/meetings/governance/Forms";
import { Modal } from "@/components/ui/Modal";
import {
  googleCalendarUrl,
  downloadCalendar,
  edgeError,
  money,
} from "./sponsorship";

export function SponsorStageForm({
  sponsor,
  stage,
  onClose,
  onSaved,
}: {
  sponsor: any;
  stage: string;
  onClose: () => void;
  onSaved: (s: any) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const common: FieldSpec[] = [
    {
      key: "sponsorship_value",
      label: "Agreed sponsorship / donation amount ($)",
      type: "number",
      min: 0,
      step: 0.01,
      required: true,
    },
  ];
  const fields: FieldSpec[] =
    stage === "contacted"
      ? [
          { key: "person", label: "Who did you speak with?", required: true },
          {
            key: "method",
            label: "How did you contact them?",
            type: "select",
            required: true,
            options: [
              "phone",
              "email",
              "in_person",
              "video",
              "text",
              "other",
            ].map((value) => ({ value, label: value.replaceAll("_", " ") })),
          },
          { key: "email", label: "Contact email", type: "email" },
          { key: "phone", label: "Contact phone" },
          {
            key: "summary",
            label: "What did you discuss? What happens next?",
            type: "textarea",
            required: true,
          },
        ]
      : stage === "meeting_scheduled"
        ? [
            {
              key: "meeting_with",
              label: "Who is the meeting with?",
              required: true,
            },
            {
              key: "meeting_start",
              label: "Meeting start (your local time)",
              type: "datetime-local",
              required: true,
            },
            {
              key: "meeting_end",
              label: "Meeting end (your local time)",
              type: "datetime-local",
              required: true,
            },
            { key: "meeting_location", label: "Location or video link" },
          ]
        : stage === "proposal_sent"
          ? [
              {
                key: "proposal_text",
                label: "Type the proposal, or upload it below",
                type: "textarea",
              },
              { key: "summary", label: "How was the proposal shared?" },
            ]
          : [
              {
                key: "summary",
                label:
                  stage === "lost"
                    ? "Why is the sponsor not proceeding?"
                    : "Update / next steps",
                type: "textarea",
                required: stage === "lost",
              },
            ];
  const local = (date: string) =>
    date
      ? new Date(
          new Date(date).getTime() - new Date(date).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "";
  return (
    <GovernanceForm
      title={
        stage === "meeting_scheduled"
          ? "Schedule sponsor meeting"
          : stage === "contacted"
            ? "Record sponsor contact"
            : stage === "proposal_sent"
              ? "Save sent proposal"
              : "Update sponsorship"
      }
      onClose={onClose}
      fields={[...fields, ...common]}
      initial={{
        sponsorship_value: sponsor.sponsorship_value,
        person: sponsor.contact_name || "",
        email: sponsor.email || "",
        phone: sponsor.phone || "",
        method: "phone",
        meeting_with: sponsor.meeting_with || sponsor.contact_name || "",
        meeting_start: local(sponsor.meeting_start),
        meeting_end: local(sponsor.meeting_end),
        meeting_location: sponsor.meeting_location || "",
        proposal_text: sponsor.proposal_text || "",
      }}
      onSubmit={async (values) => {
        let path = sponsor.proposal_storage_path;
        if (file) {
          if (
            file.size > 20 * 1024 * 1024 ||
            !/\.(pdf|docx?)$/i.test(file.name)
          )
            throw new Error("Choose a PDF, DOC or DOCX under 20 MB.");
          path = `${sponsor.id}/proposals/${crypto.randomUUID()}.${file.name.split(".").pop()?.toLowerCase()}`;
          const r = await supabase.storage
            .from("sponsor-agreements")
            .upload(path, file);
          if (r.error) throw r.error;
        }
        const data = {
          ...values,
          stage,
          ...(stage === "proposal_sent" ? { proposal_storage_path: path } : {}),
          ...(stage === "meeting_scheduled"
            ? {
                meeting_start: new Date(values.meeting_start).toISOString(),
                meeting_end: new Date(values.meeting_end).toISOString(),
              }
            : {}),
        };
        const r = await supabase.rpc("cvoa_sponsor_save", {
          p_sponsor: sponsor.id,
          p_version: sponsor.workflow_version,
          p_data: data,
        });
        if (r.error) throw r.error;
        onSaved(r.data);
      }}
    >
      {stage === "proposal_sent" && (
        <label className="block text-sm">
          Upload proposal (PDF, DOC or DOCX; up to 20 MB)
          <input
            className="input-field mt-2"
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
      )}
    </GovernanceForm>
  );
}

export function SponsorCalendar({ sponsor }: { sponsor: any }) {
  return sponsor.meeting_start ? (
    <div className="panel p-3 text-sm space-y-2">
      <p>
        Meeting with <strong>{sponsor.meeting_with}</strong> •{" "}
        {new Date(sponsor.meeting_start).toLocaleString()} (
        {Intl.DateTimeFormat().resolvedOptions().timeZone})
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          className="btn-ghost"
          target="_blank"
          rel="noreferrer"
          href={googleCalendarUrl(sponsor)}
        >
          Add to Google Calendar
        </a>
        <button className="btn-ghost" onClick={() => downloadCalendar(sponsor)}>
          Apple / Outlook / other calendar (.ics)
        </button>
      </div>
    </div>
  ) : null;
}

export function CollectSponsorPayment({
  sponsor,
  onClose,
  onSaved,
}: {
  sponsor: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(sponsor.sponsorship_value || "")),
    [id] = useState(() => crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [mode, setMode] = useState("");
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await supabase.functions.invoke("create-sponsorship-checkout", {
        body: {
          action: "create",
          sponsor_id: sponsor.id,
          amount: Number(amount),
          request_id: id,
        },
      });
      if (r.error) throw new Error(await edgeError(r.error));
      if (r.data.error) throw new Error(r.data.error);
      setUrl(r.data.url);
      setMode(r.data.livemode ? "Live payment" : "TEST MODE: no real money");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Collect sponsorship • ${sponsor.company}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Create a secure Stripe checkout for this payment. The sponsor enters
          their own card details on Stripe. You can open it here or copy the
          link for them.
        </p>
        {!url ? (
          <form onSubmit={create} className="space-y-3">
            <label className="block text-sm">
              Amount to collect ($)
              <input
                className="input-field mt-1"
                type="number"
                min="1"
                max="999999.99"
                step="0.01"
                required
                disabled={busy}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <button className="btn-gold" disabled={busy}>
              {busy ? "Creating secure checkout…" : "Create Stripe checkout"}
            </button>
          </form>
        ) : (
          <>
            <p className="font-mono text-gold">
              {money(amount)} • {mode}
            </p>
            <a
              className="btn-gold inline-block"
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              Open payment screen
            </a>
            <button
              className="btn-ghost ml-2"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setError("Payment link copied.");
                } catch {
                  setError("Copy the payment link from the field below.");
                }
              }}
            >
              Copy payment link
            </button>
            <input
              readOnly
              aria-label="Stripe payment link"
              className="input-field"
              value={url}
            />
            <p className="text-xs text-muted">
              This link has a fixed amount and expires after 24 hours. Changing
              the agreed amount does not change an existing payment link.
            </p>
          </>
        )}
        {error && (
          <p role="status" className="text-sm text-status-attention">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
