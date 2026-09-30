/**
 * Parses a number typed the Danish way: comma for decimals, dots or spaces between
 * thousands ("1.234,5", "1 234,5", including non-breaking spaces). A dot with no comma
 * is read as thousands only in the exact pattern "1.000" or "12.345.678"; otherwise it's a
 * decimal point ("2.5").
 *
 * Returns null for empty input and NaN for anything that isn't a number, so the
 * calculation flags the line instead of counting it as 0.
 */
export function parseNumber(input: string): number | null {
  const text = input.trim().replace(/\s/g, '')
  if (text === '') return null

  let normalised: string
  if (text.includes(',')) {
    if (!/^-?(\d{1,3}(\.\d{3})+|\d+),\d+$/.test(text)) return Number.NaN
    normalised = text.replace(/\./g, '').replace(',', '.')
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    normalised = text.replace(/\./g, '')
  } else if (/^-?\d+(\.\d+)?$/.test(text)) {
    normalised = text
  } else {
    return Number.NaN
  }
  return Number(normalised)
}
