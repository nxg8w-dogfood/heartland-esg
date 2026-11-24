import { useId, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { Factor } from '../data/factors'
import { currencyRates } from '../data/currencies'
import { parseNumber } from '../calc/parseNumber'
import { category1Groups, type Category1 } from '../calc/scope3'
import type { SpendGroup, SpendLine } from '../calc/spend'
import { formatDate, formatNumber } from '../format'
import { FactorCell } from '../factors/FactorCell'
import { lineFactorChoice } from '../factors/choice'
import { newId } from '../newId'

type Props = {
  cat1: Category1
  lines: SpendLine[]
  setLines: Dispatch<SetStateAction<SpendLine[]>>
  factors: readonly Factor[]
  defaultDate: string
}

export function PurchasesSection({ cat1, lines, setLines, factors, defaultDate }: Props) {
  const id = useId()
  const hiddenCount = lines.length - cat1.lines.filter((r) => r.source === 'manual').length
  const blankGroups = category1Groups.filter((g) => !g.excluded && factors.find((f) => f.id === g.factorId)?.value == null)

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Kategori 1 — indkøbte varer og services</h2>
      {blankGroups.length > 0 && (
        <p className="warning">
          <strong>{blankGroups.length} af indkøbstyperne har endnu ingen EXIOBASE-faktor</strong> (afventer
          fuld EXIOBASE-upload): {blankGroups.map((g) => g.label).join(', ')}. Linjer af de typer tæller
          ikke med, før en verificeret faktor er indtastet under Faktorer eller som egen faktor på linjen.
        </p>
      )}

      {cat1.lines.length > 0 && (
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
                  </td>
                  <td className="num">
                    {r.excluded ? (
                      <span className="muted">{r.group.excluded}</span>
                    ) : (
                      <FactorCell
                        value={r.factorValue}
                        factor={r.factor}
                        custom={r.line.customFactor != null}
                        regulation={{ result: r.deflation, value: r.regulatedFactorValue }}
                        choice={r.source === 'ledger' ? undefined : lineFactorChoice(r.line, r.group.factorId, factors, setLines, `${r.group.label}, ${formatDate(r.line.date)}`)}
                      />
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
