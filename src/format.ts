const formatters = new Map<number, Intl.NumberFormat>()

/** Danish number formatting, e.g. 1234.5 → "1.234,500" with 3 decimals. */
export function formatNumber(value: number, decimals: number): string {
  let f = formatters.get(decimals)
  if (!f) {
    f = new Intl.NumberFormat('da-DK', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    formatters.set(decimals, f)
  }
  return f.format(value)
}

/** Factor values need more precision than totals; show up to 5 decimals, no trailing zeros. */
export function formatFactor(value: number): string {
  return new Intl.NumberFormat('da-DK', { maximumFractionDigits: 5 }).format(value)
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}.${m}.${y}` : iso
}
