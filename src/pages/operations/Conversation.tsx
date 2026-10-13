import { useEffect, useRef, useState } from "react";
import {
  AtSign,
  Paperclip,
  Send,
  MessageSquare,
  Pin,
  ListTodo,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Attachment, Message, Person, Reaction } from "./types";
export async function fileLink(file: Attachment) {
  const r = await supabase.storage
    .from("operations-files")
    .createSignedUrl(file.path, 60);
  if (r.error) throw r.error;
  window.open(r.data.signedUrl, "_blank", "noopener,noreferrer");
}
const initials = (name: string) =>
  name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
export function MessageCard({
  message: m,
  userId,
  canManage,
  replies = 0,
  reactions,
  onReply,
  onReact,
  onTask,
  onEdit,
  onRemove,
  onPin,
  onError,
}: {
  message: Message;
  userId: string;
  canManage: boolean;
  replies?: number;
  reactions: Reaction[];
  onReply: (m: Message) => void;
  onReact: (m: Message, emoji: string) => void;
  onTask: (m: Message) => void;
  onEdit: (m: Message) => void;
  onRemove: (m: Message) => void;
  onPin: (m: Message) => void;
  onError: (error: unknown) => void;
}) {
  return (
    <article
      className="group flex gap-3 px-4 py-3 hover:bg-white/[.035] border-b border-hairline/30"
      id={`message-${m.id}`}
    >
      <div className="w-9 h-9 shrink-0 rounded bg-elevated border border-hairline flex items-center justify-center text-xs font-semibold">
        {initials(m.author_name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex gap-2 flex-wrap items-baseline">
          <strong className="text-sm">{m.author_name}</strong>
          <time className="text-[11px] text-muted" dateTime={m.created_at}>
            {new Date(m.created_at).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
          {m.edited_at && (
            <span className="text-[11px] text-muted">edited</span>
          )}
          {m.pinned && <Pin size={12} />}
        </div>
        <p className="text-sm whitespace-pre-wrap break-words mt-1">
          {m.body.replace(/@\[([^\]]+)\]\([0-9a-f-]+\)/g, "@$1")}
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          {m.attachments.map((f) => (
            <button
              key={f.path}
              className="border border-hairline rounded p-2 text-xs inline-flex gap-2 items-center"
              onClick={() => fileLink(f).catch(onError)}
            >
              <Paperclip size={13} />
              {f.name} · {Math.ceil(f.size / 1024)} KB
            </button>
          ))}
        </div>
        {!m.deleted_at && (
          <div className="flex gap-1 flex-wrap mt-2 items-center">
            {["👍", "✅", "❤️", "👀", "🎉"].map((emoji) => {
              const rs = reactions.filter(
                (r) => r.message_id === m.id && r.emoji === emoji,
              );
              return (
                <button
                  key={emoji}
                  aria-label={`React ${emoji}`}
                  aria-pressed={rs.some((r) => r.user_id === userId)}
                  onClick={() => onReact(m, emoji)}
                  className={`px-2 py-0.5 rounded text-xs border ${rs.some((r) => r.user_id === userId) ? "border-white bg-elevated" : "border-hairline text-muted"}`}
                >
                  {emoji}
                  {rs.length ? ` ${rs.length}` : ""}
                </button>
              );
            })}
            {!m.parent_id && (
              <button
                onClick={() => onReply(m)}
                className="text-xs text-muted ml-2 flex gap-1 items-center"
              >
                <MessageSquare size={12} />
                {replies ? `${replies} replies` : "Reply in thread"}
              </button>
            )}
            <button
              onClick={() => onTask(m)}
              title="Turn message into action"
              aria-label="Turn message into action"
              className="p-1.5 text-muted"
            >
              <ListTodo size={14} />
            </button>
            {canManage && (
              <button
                onClick={() => onPin(m)}
                aria-label={m.pinned ? "Unpin message" : "Pin message"}
                className="p-1.5 text-muted"
              >
                <Pin size={14} />
              </button>
            )}
            {m.author_id === userId && (
              <button
                onClick={() => onEdit(m)}
                aria-label="Edit message"
                className="p-1.5 text-muted"
              >
                <Pencil size={14} />
              </button>
            )}
            {(m.author_id === userId || canManage) && (
              <button
                onClick={() => onRemove(m)}
                aria-label="Remove message"
                className="p-1.5 text-muted"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
export interface ComposerDraft {
  body: string;
  mentions: string[];
  files: File[];
}
export function Composer({
  channelId,
  userId,
  people,
  disabled,
  placeholder,
  onSend,
  onTyping,
  drafts,
  draftKey,
}: {
  drafts?: Map<string, ComposerDraft>;
  draftKey?: string;
  channelId: string;
  userId: string;
  people: Person[];
  disabled: boolean;
  placeholder: string;
  onSend: (
    body: string,
    mentions: string[],
    attachments: Attachment[],
  ) => Promise<void>;
  onTyping: () => void;
}) {
  const [body, setBody] = useState(drafts?.get(draftKey || "")?.body || ""),
    [mentions, setMentions] = useState<string[]>(
      drafts?.get(draftKey || "")?.mentions || [],
    ),
    [files, setFiles] = useState<File[]>(
      drafts?.get(draftKey || "")?.files || [],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mentionPicker, setMentionPicker] = useState(false);
  useEffect(() => {
    if (drafts && draftKey) drafts.set(draftKey, { body, mentions, files });
  }, [body, mentions, files, drafts, draftKey]);
  const fileInput = useRef<HTMLInputElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null);
  async function send() {
    if (disabled || busy || (!body.trim() && !files.length)) return;
    setBusy(true);
    setError("");
    try {
      const uploaded: Attachment[] = [];
      for (const file of files) {
        if (file.size > 10485760)
          throw new Error("Files must be 10 MB or smaller.");
        const path = `${channelId}/${userId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const r = await supabase.storage
          .from("operations-files")
          .upload(path, file, { upsert: false });
        if (r.error) throw r.error;
        uploaded.push({ path, name: file.name, size: file.size });
      }
      await onSend(body.trim(), mentions, uploaded);
      setBody("");
      setMentions([]);
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
      textarea.current?.focus();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not send. Your draft remains here.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="p-3 border-t border-hairline bg-charcoal">
      <div className="border border-hairline rounded-lg overflow-hidden">
        <textarea
          ref={textarea}
          aria-label={placeholder}
          disabled={disabled || busy}
          value={body}
          maxLength={10000}
          rows={3}
          placeholder={placeholder}
          onChange={(e) => {
            setBody(e.target.value);
            onTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          className="w-full bg-transparent text-sm p-3 resize-none outline-none"
        />
        {files.length > 0 && (
          <div className="px-3 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <button
                key={`${f.name}-${i}`}
                className="text-xs text-muted flex gap-1 items-center"
                onClick={() => setFiles(files.filter((_, n) => n !== i))}
              >
                {f.name}
                <X size={12} />
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-between items-center bg-surface px-2 py-1">
          <div className="flex gap-1">
            <input
              ref={fileInput}
              aria-label="Attach files"
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx,.xlsx"
              className="hidden"
              onChange={(e) => {
                const next = [...files, ...Array.from(e.target.files || [])];
                if (next.length > 5) setError("Attach up to five files.");
                else setFiles(next);
              }}
            />
            <button
              disabled={disabled || busy}
              onClick={() => fileInput.current?.click()}
              aria-label="Attach a file"
              className="p-2"
            >
              <Paperclip size={16} />
            </button>
            <button
              disabled={disabled || busy}
              onClick={() => setMentionPicker(!mentionPicker)}
              aria-label="Mention someone"
              className="p-2"
            >
              <AtSign size={16} />
            </button>
          </div>
          <span className="text-[10px] text-muted hidden sm:block">
            Enter to send · Shift + Enter for a new line
          </span>
          <button
            disabled={disabled || busy || (!body.trim() && !files.length)}
            onClick={() => void send()}
            aria-label="Send message"
            className="btn-gold p-2"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
      {mentionPicker && (
        <select
          aria-label="Choose someone to mention"
          className="input-field mt-2"
          value=""
          onChange={(e) => {
            const p = people.find((p) => p.id === e.target.value);
            if (p) {
              setBody(body + ` @[${p.full_name}](${p.id}) `);
              setMentions([...new Set([...mentions, p.id])]);
              setMentionPicker(false);
              textarea.current?.focus();
            }
          }}
        >
          <option value="">Choose a person…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-300 mt-2">
          {error}
        </p>
      )}
    </div>
  );
}
