export const LIST_PAGE_SIZE = 50

export function ListPagination({ page, total, onPageChange }: { page: number; total: number; onPageChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE))
  if (pages === 1) return null
  return (
    <nav aria-label="List pages" className="flex items-center justify-between gap-3 mt-4 text-sm">
      <span className="text-muted">Page {page + 1} of {pages} · {total} records</span>
      <div className="flex gap-2">
        <button type="button" className="btn-ghost disabled:opacity-50" disabled={page === 0} onClick={() => onPageChange(page - 1)}>Previous</button>
        <button type="button" className="btn-ghost disabled:opacity-50" disabled={page >= pages - 1} onClick={() => onPageChange(page + 1)}>Next</button>
      </div>
    </nav>
  )
}
