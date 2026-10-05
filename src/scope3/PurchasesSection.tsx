import { useId, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { Factor } from '../data/factors'
import { currencyRates } from '../data/currencies'
import { parseNumber } from '../calc/parseNumber'
import { category1Groups, type Category1 } from '../calc/scope3'
import type { Deflation, SpendGroup, SpendLine } from '../calc/spend'
import { formatDate, formatFactor, formatNumber } from '../format'
import { newId } from '../newId'

type Props = {
  cat1: Category1
  lines: SpendLine[]
  setLines: Dispatch<SetStateAction<SpendLine[]>>
  deflation: Deflation
  setDeflation: Dispatch<SetStateAction<Deflation>>
  factors: readonly Factor[]
  defaultDate: string
}

const examples = (year: string): Omit<SpendLine, 'id'>[] => [
  { group: 'k1-raadgivning', date: `${year}-03-31`, amount: 425_000, currency: 'DKK', description: 'Revision og juridisk rådgivning' },
  { group: 'k1-software', date: `${year}-01-15`, amount: 38_000, currency: 'EUR', description: 'Årslicenser' },
  { group: 'k1-events', date: `${year}-06-12`, amount: 96_000, currency: 'DKK', description: 'Strategiseminar' },
  { group: 'k1-kantine', date: `${year}-01-01`, dateTo: `${year}-12-31`, amount: 310_000, currency: 'DKK', description: 'Kantineordning' },
  { group: 'k1-rengoering', date: `${year}-01-01`, dateTo: `${year}-12-31`, amount: 185_000, currency: 'DKK', description: 'Rengøringsaftale' },
  { group: 'k1-bank', date: `${year}-12-31`, amount: 42_000, currency: 'DKK', description: 'Bankgebyrer' },
]

export function PurchasesSection({ cat1, lines, setLines, deflation, setDeflation, factors, defaultDate }: Props) {
  const id = useId()
  const hiddenCount = lines.length - cat1.lines.filter((r) => r.source === 'manual').length
  const fromLedger = cat1.lines.filter((r) => r.source === 'ledger').length
  const usedFactors = [...new Map(cat1.lines.filter((r) => r.factor?.method === 'spend').map((r) => [r.factor!.id, r.factor!])).values()]
  const blankGroups = category1Groups.filter((g) => !g.excluded && factors.find((f) => f.id === g.factorId)?.value == null)

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Kategori 1 — indkøbte varer og services</h2>
      <p className="muted">
        Spendbaseret: beløbet omregnes til DKK og videre til faktorens valuta (EUR for EXIOBASE), og
        ganges med faktoren i kg CO2e pr. EUR for indkøbstypens EXIOBASE-sektor. Priserne kan
        indeksreguleres til faktorens prisår (se nedenfor). Posteringer, der er tagget på{' '}
        <a href="#/kontoplan">Kontoplan</a>, kommer med her automatisk
        {fromLedger > 0 && <> ({fromLedger} i perioden)</>}.
      </p>
      {blankGroups.length > 0 && (
        <p className="warning">
          <strong>{blankGroups.length} af indkøbstyperne har endnu ingen EXIOBASE-faktor</strong> (afventer
          fuld EXIOBASE-upload): {blankGroups.map((g) => g.label).join(', ')}. Linjer af de typer tæller
          ikke med, før en verificeret faktor er indtastet under Faktorer eller som egen faktor på linjen.
        </p>
      )}

      {cat1.lines.length === 0 ? (
        <div className="empty">
          <p>Ingen indkøb i perioden.</p>
          {lines.length === 0 && (
            <button type="button" className="secondary" onClick={() => setLines(examples(defaultDate.slice(0, 4)).map((l) => ({ ...l, id: newId() })))}>
              Indsæt eksempellinjer
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">Indkøb i perioden</caption>
            <thead>
              <tr>
                <th scope="col">Dato</th>
                <th scope="col">Indkøbstype</th>
                <th scope="col">Beskrivelse</th>
                <th scope="col" className="num">Beløb i perioden</th>
                <th scope="col" className="num">I faktorens valuta</th>
                <th scope="col" className="num">Faktor</th>
                <th scope="col" className="num">tCO2e</th>
                <th scope="col"><span className="visually-hidden">Handlinger</span></th>
              </tr>
            </thead>
            <tbody>
              {cat1.lines.map((r) => (
                <tr key={r.line.id}>
                  <td>
                    {formatDate(r.line.date)}
                    {r.line.dateTo && r.line.dateTo > r.line.date && <> – {formatDate(r.line.dateTo)}</>}
                  </td>
                  <td>
                    {r.group.label}
                    <span className="sub">{r.group.sector}</span>
                  </td>
                  <td>{r.line.description}</td>
                  <td className="num">
                    {r.line.amount === null ? '—' : `${formatNumber(r.line.amount * r.share, 0)} ${r.line.currency}`}
                    {r.share < 1 && <span className="sub">{formatNumber(r.share * 100, 0)} % af linjen</span>}
                  </td>
                  <td className="num">
                    {r.excluded ? '—' : r.amountInFactorCurrency === null ? '—' : `${formatNumber(r.amountInFactorCurrency, 0)} ${r.factorCurrency}`}
                    {r.deflation.status === 'applied' && r.deflatedAmount !== null && (
                      <span className="sub">{formatNumber(r.deflatedAmount, 0)} i {r.deflation.baseYear}-priser</span>
                    )}
                  </td>
                  <td className="num">
                    {r.excluded ? (
                      <span className="muted">{r.group.excluded}</span>
                    ) : r.factorValue === null ? (
                      <span className="pending">Faktor mangler</span>
                    ) : (
                      <>
                        {formatFactor(r.factorValue)}
                        <span className="sub">{r.line.customFactor != null ? 'Egen faktor' : r.factor?.unit}</span>
                      </>
                    )}
                  </td>
                  <td className="num strong">
                    {r.excluded ? <span className="muted">Ekskluderet</span> : r.pending ? <span className="pending">Afventer</span> : formatNumber(r.tCO2e, 3)}
                    {r.warning && <span className="sub warning-text">{r.warning}</span>}
                  </td>
                  <td>
                    {r.source === 'ledger' ? (
                      <a href="#/kontoplan" className="muted">Fra kontoplan</a>
                    ) : (
                      <button type="button" className="link" onClick={() => setLines((ls) => ls.filter((l) => l.id !== r.line.id))} aria-label={`Slet linje: ${r.group.label}, ${formatDate(r.line.date)}`}>
                        Slet
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={6}>Kategori 1 i alt</th>
                <td className="num strong">{formatNumber(cat1.total, 3)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {cat1.pendingCount > 0 && (
        <p className="warning">{cat1.pendingCount === 1 ? '1 linje afventer' : `${cat1.pendingCount} linjer afventer`} en faktor og tæller ikke med endnu.</p>
      )}
      {hiddenCount > 0 && (
        <p className="muted">{hiddenCount === 1 ? '1 linje ligger' : `${hiddenCount} linjer ligger`} uden for perioden og vises ikke, men er ikke slettet.</p>
      )}

      <AddSpendForm defaultDate={defaultDate} onAdd={(line) => setLines((ls) => [...ls, { ...line, id: newId() }])} />

      <DeflationPanel deflation={deflation} setDeflation={setDeflation} usedFactors={usedFactors} />
    </section>
  )
}

/** Adds a spend line of one of the given types. Shared with category 4's courier lines. */
export function AddSpendForm({ defaultDate, onAdd, groups = category1Groups, label = 'Tilføj indkøb', groupLabel = 'Indkøbstype' }: {
  defaultDate: string
  onAdd: (line: Omit<SpendLine, 'id'>) => void
  groups?: readonly SpendGroup[]
  label?: string
  groupLabel?: string
}) {
  const id = useId()
  const [group, setGroup] = useState(groups[0].id)
  const [date, setDate] = useState(defaultDate)
  const [dateTo, setDateTo] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('DKK')
  const [customFactor, setCustomFactor] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  function submit(e: FormEvent) {
    e.preventDefault()
    const a = parseNumber(amount)
    const f = parseNumber(customFactor)
    const next: Record<string, string> = {}
    if (a === null) next.amount = 'Angiv et beløb.'
    else if (Number.isNaN(a)) next.amount = 'Beløbet er ikke et gyldigt tal. Brug fx 12.500,00.'
    if (f !== null && Number.isNaN(f)) next.customFactor = 'Faktoren er ikke et gyldigt tal.'
    if (!date) next.date = 'Angiv en dato.'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    onAdd({ group, date, dateTo: dateTo || null, amount: a, currency, customFactor: f, description: description.trim() })
    setAmount('')
    setCustomFactor('')
    setDescription('')
  }
  const describedBy = (field: string) => (errors[field] ? `${id}-${field}-err` : undefined)
  return (
    <form className="add-line" onSubmit={submit} noValidate aria-label={label}>
      <div className="field">
        <label htmlFor={`${id}-group`}>{groupLabel}</label>
        <select id={`${id}-group`} value={group} onChange={(e) => setGroup(e.target.value)}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.label}{g.excluded ? ' (ekskluderet)' : ''}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-date`}>Dato</label>
        <input id={`${id}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!errors.date} aria-describedby={describedBy('date')} />
        {errors.date && <p id={`${id}-date-err`} className="error">{errors.date}</p>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-dateTo`}>Til dato <span className="optional">(valgfri)</span></label>
        <input id={`${id}-dateTo`} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-amount`}>Beløb</label>
        <input id={`${id}-amount`} inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!errors.amount} aria-describedby={describedBy('amount')} />
        {errors.amount && <p id={`${id}-amount-err`} className="error">{errors.amount}</p>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-cur`}>Valuta</label>
        <select id={`${id}-cur`} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {currencyRates.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-custom`}>Egen faktor <span className="optional">(kg CO2e/EUR, valgfri)</span></label>
        <input id={`${id}-custom`} inputMode="decimal" autoComplete="off" value={customFactor} onChange={(e) => setCustomFactor(e.target.value)} aria-invalid={!!errors.customFactor} aria-describedby={describedBy('customFactor')} />
        {errors.customFactor && <p id={`${id}-customFactor-err`} className="error">{errors.customFactor}</p>}
      </div>
      <div className="field wide">
        <label htmlFor={`${id}-desc`}>Beskrivelse <span className="optional">(valgfri)</span></label>
        <input id={`${id}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="actions">
        <button type="submit">{label}</button>
      </div>
    </form>
  )
}

function DeflationPanel({ deflation, setDeflation, usedFactors }: { deflation: Deflation; setDeflation: Dispatch<SetStateAction<Deflation>>; usedFactors: Factor[] }) {
  const id = useId()
  const series = deflation.series.find((s) => s.id === deflation.seriesId) ?? null
  const [newYear, setNewYear] = useState('')
  const [newValue, setNewValue] = useState('')
  const [pointError, setPointError] = useState<string | null>(null)

  const setPoints = (points: { year: number; value: number }[]) =>
    setDeflation((d) => ({ ...d, series: d.series.map((s) => (s.id === d.seriesId ? { ...s, points: [...points].sort((a, b) => a.year - b.year) } : s)) }))
  const addPoint = () => {
    const y = Number(newYear)
    const v = parseNumber(newValue)
    if (!Number.isInteger(y) || y < 1990 || y > 2100) return setPointError('Angiv et årstal, fx 2020.')
    if (v === null || Number.isNaN(v) || v <= 0) return setPointError('Angiv en indeksværdi over 0.')
    setPointError(null)
    setPoints([...(series?.points ?? []).filter((p) => p.year !== y), { year: y, value: v }])
    setNewYear('')
    setNewValue('')
  }

  return (
    <fieldset className="params">
      <legend>Indeksregulering af spendfaktorer</legend>
      <div className="field wide">
        <label className="check">
          <input type="checkbox" checked={deflation.active} onChange={(e) => setDeflation((d) => ({ ...d, active: e.target.checked }))} />
          Omregn beløb til faktorens prisår (beløb ÷ indeks for linjens år × indeks for basisåret)
        </label>
      </div>
      {deflation.active && (
        <>
          <div className="field">
            <label htmlFor={`${id}-series`}>Indeksserie</label>
            <select id={`${id}-series`} value={deflation.seriesId ?? ''} onChange={(e) => setDeflation((d) => ({ ...d, seriesId: e.target.value || null }))}>
              <option value="">Vælg serie</option>
              {deflation.series.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {series && (
            <div className="field wide">
              <p className="muted">{series.source}. {series.note}</p>
              {series.points.length === 0 ? (
                <p className="warning">Serien har ingen indeksværdier endnu.</p>
              ) : (
                <table>
                  <caption className="visually-hidden">Indeksværdier for {series.name}</caption>
                  <thead><tr><th scope="col">År</th><th scope="col" className="num">Indeks</th><th scope="col"><span className="visually-hidden">Handlinger</span></th></tr></thead>
                  <tbody>
                    {series.points.map((p) => (
                      <tr key={p.year}>
                        <td>{p.year}</td>
                        <td className="num">{formatFactor(p.value)}</td>
                        <td><button type="button" className="link" onClick={() => setPoints(series.points.filter((x) => x.year !== p.year))} aria-label={`Slet indeksværdi for ${p.year}`}>Slet</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="add-line">
                <div className="field">
                  <label htmlFor={`${id}-year`}>År</label>
                  <input id={`${id}-year`} inputMode="numeric" value={newYear} onChange={(e) => setNewYear(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor={`${id}-value`}>Indeksværdi</label>
                  <input id={`${id}-value`} inputMode="decimal" value={newValue} onChange={(e) => setNewValue(e.target.value)} aria-invalid={!!pointError} aria-describedby={pointError ? `${id}-perr` : undefined} />
                </div>
                <div className="field end">
                  <button type="button" className="secondary" onClick={addPoint}>Tilføj indeksværdi</button>
                </div>
                {pointError && <p id={`${id}-perr`} className="error">{pointError}</p>}
              </div>
            </div>
          )}
          {usedFactors.length > 0 && (
            <div className="field wide">
              <p className="strong">Basisår for de spendfaktorer, der bruges i perioden</p>
              <div className="location-settings">
                {usedFactors.map((f) => (
                  <YearField
                    key={f.id}
                    label={`${f.name}, ${f.region}`}
                    value={deflation.factorSettings[f.id]?.baseYear ?? null}
                    onCommit={(baseYear) => setDeflation((d) => ({ ...d, factorSettings: { ...d.factorSettings, [f.id]: { ...d.factorSettings[f.id], baseYear } } }))}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </fieldset>
  )
}

/** A year, written without a thousands separator. Commits on blur or Enter. */
function YearField({ label, value, onCommit }: { label: string; value: number | null; onCommit: (year: number | null) => void }) {
  const id = useId()
  const [text, setText] = useState(value === null ? '' : String(value))
  const [error, setError] = useState<string | null>(null)
  function commit() {
    const t = text.trim()
    if (t === '') { setError(null); return onCommit(null) }
    const y = Number(t)
    if (!/^\d{4}$/.test(t) || y < 1990 || y > 2100) return setError('Angiv et årstal, fx 2020.')
    setError(null)
    onCommit(y)
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label} <span className="optional">(prisår)</span></label>
      <input id={id} inputMode="numeric" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit() }} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} />
      {error && <p id={`${id}-err`} className="error">{error}</p>}
    </div>
  )
}
