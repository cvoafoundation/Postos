import type { ReactNode } from 'react'

export interface KanbanColumn<T> {
  key: string
  label: string
  items: T[]
}

export function KanbanBoard<T>({
  columns,
  renderCard,
  keyExtractor,
}: {
  columns: KanbanColumn<T>[]
  renderCard: (item: T) => ReactNode
  keyExtractor: (item: T) => string
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => (
        <div key={col.key} className="w-72 shrink-0">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="eyebrow">{col.label}</div>
            <div className="font-mono text-xs text-muted">{col.items.length}</div>
          </div>
          <div className="space-y-2">
            {col.items.length === 0 ? (
              <div className="border border-dashed border-hairline rounded-sm p-4 text-center text-xs text-muted/70">
                Empty
              </div>
            ) : (
              col.items.map((item) => <div key={keyExtractor(item)}>{renderCard(item)}</div>)
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
