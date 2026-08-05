/** Pure pagination — slice an array into a page + the metadata a UI needs. */
export type Paged<T> = {
  items: T[]
  page: number
  totalPages: number
  total: number
  /** 1-based index of the first item shown (0 when empty). */
  from: number
  /** 1-based index of the last item shown. */
  to: number
}

export function paginate<T>(all: T[], page: number, pageSize: number): Paged<T> {
  const total = all.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const p = Math.min(Math.max(1, page), totalPages)
  const start = (p - 1) * pageSize
  const items = all.slice(start, start + pageSize)
  return {
    items,
    page: p,
    totalPages,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + items.length,
  }
}
