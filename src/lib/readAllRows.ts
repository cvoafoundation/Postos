// Administrative lists must not silently stop at Supabase's default row cap.
// Create a fresh, consistently ordered query for each page.
export async function readAllRows<T>(createQuery: () => any): Promise<T[]> {
  const rows: T[] = []
  const pageSize = 500
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await createQuery().range(start, start + pageSize - 1)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}
