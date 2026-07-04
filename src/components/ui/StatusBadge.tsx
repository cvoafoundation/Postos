import clsx from 'clsx'

type Tone = 'active' | 'developing' | 'attention' | 'neutral'

const TONE_CLASSES: Record<Tone, string> = {
  active: 'bg-status-active/15 text-status-active border-status-active/40',
  developing: 'bg-status-developing/15 text-status-developing border-status-developing/40',
  attention: 'bg-status-attention/15 text-status-attention border-status-attention/40',
  neutral: 'bg-surface text-muted border-hairline',
}

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-sm border text-[11px] font-mono uppercase tracking-wide',
        TONE_CLASSES[tone]
      )}
    >
      {label}
    </span>
  )
}

export function healthTone(status: 'green' | 'yellow' | 'red'): Tone {
  if (status === 'green') return 'active'
  if (status === 'yellow') return 'developing'
  return 'attention'
}
