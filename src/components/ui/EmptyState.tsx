export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="panel p-10 text-center">
      <div className="font-display text-2xl text-muted tracking-wide mb-1">{title}</div>
      {hint && <p className="text-sm text-muted/80">{hint}</p>}
    </div>
  )
}
