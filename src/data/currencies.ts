// Exchange rates from the original app: DKK per unit of each currency.

export type CurrencyRate = { code: string; toDKK: number }

export const currencyRates: readonly CurrencyRate[] = [
  { code: 'DKK', toDKK: 1 },
  { code: 'EUR', toDKK: 7.4604 },
  { code: 'SEK', toDKK: 0.6688 },
  { code: 'ISK', toDKK: 1.9254 / 100 },
  { code: 'CNY', toDKK: 0.91 },
]

/** DKK per unit. DKK, a missing code and an unknown code all give 1, as in the original. */
export function toDKK(rates: readonly CurrencyRate[], code: string | null | undefined): number {
  if (!code || code === 'DKK') return 1
  return rates.find((r) => r.code === code)?.toDKK ?? 1
}
