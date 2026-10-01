import { useId, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { Factor } from '../data/factors'
import { factorOptions, type ActivityGroup, type ActivityLine, type ActivitySummary } from '../calc/activity'
import { parseNumber } from '../calc/parseNumber'
import { formatDate, formatFactor, formatNumber } from '../format'
import { newId } from '../newId'

type Props = {
  title: string
  intro?: string
  groups: readonly ActivityGroup[]
  factors: readonly Factor[]
  summary: ActivitySummary
  lines: ActivityLine[]
  setLines: Dispatch<SetStateAction<ActivityLine[]>>
  defaultDate: string
  emptyText: string
  examples?: Omit<ActivityLine, 'id'>[]
}

/** Add, list and delete activity lines for one category: quantity × factor per row type. */
export function ActivityLinesSection({ title, intro, groups, factors, summary, lines, setLines, defaultDate, emptyText, examples }: Props) {
  const id = useId()
  const hiddenCount = lines.length - summary.lines.length
  const factorLabel = (f: Factor | null) => (f ? `${f.name}${f.region && f.region !== 'UK/generisk' ? `, ${f.region}` : ''}` : '')

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{title}</h2>
      {intro && <p className="muted">{intro}</p>}

      {summary.lines.length === 0 ? (
        <div className="empty">
          <p>{emptyText}</p>
          {lines.length === 0 && examples && (
            <button type="button" className="secondary" onClick={() => setLines(examples.map((l) => ({ ...l, id: newId() })))}>
              Indsæt eksempellinjer
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">{title}</caption>
            <thead>
              <tr>
                <th scope="col">Dato</th>
                <th scope="col">Type</th>
                <th scope="col">Beskrivelse</th>
                <th scope="col" className="num">Mængde i perioden</th>
                <th scope="col" className="num">Emissionsfaktor</th>
                <th scope="col" className="num">tCO2e</th>
                <th scope="col"><span className="visually-hidden">Handlinger</span></th>
              </tr>
            </thead>
            <tbody>
              {summary.lines.map((r) => (
                <tr key={r.line.id}>
                  <td>
                    {formatDate(r.line.date)}
                    {r.line.dateTo && r.line.dateTo > r.line.date && <> – {formatDate(r.line.dateTo)}</>}
                  </td>
                  <td>{r.group.label}</td>
                  <td>{r.line.description}</td>
                  <td className="num">
                    {r.quantityInPeriod === null ? '—' : `${formatNumber(r.quantityInPeriod, 2)} ${r.group.unit}`}
                    {r.share < 1 && <span className="sub">{formatNumber(r.share * 100, 0)} % af linjen</span>}
                  </td>
                  <td className="num">
                    {r.factorValue === null ? (
                      <span className="pending">Faktor mangler<span className="sub">{factorLabel(r.factor)}</span></span>
                    ) : (
                      <>
                        {formatFactor(r.factorValue)}
                        <span className="sub">{r.line.customFactor != null ? 'Egen faktor' : factorLabel(r.factor)}</span>
                      </>
                    )}
                  </td>
                  <td className="num strong">
                    {r.pending ? <span className="pending">Afventer</span> : formatNumber(r.tCO2e, 3)}
                    {r.warning && <span className="sub warning-text">{r.warning}</span>}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="link"
                      onClick={() => setLines((ls) => ls.filter((l) => l.id !== r.line.id))}
                      aria-label={`Slet linje: ${r.group.label}, ${formatDate(r.line.date)}`}
                    >
                      Slet
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={5}>I alt</th>
                <td className="num strong">{formatNumber(summary.total, 3)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {summary.pendingCount > 0 && (
        <p className="warning">
          {summary.pendingCount === 1 ? '1 linje afventer' : `${summary.pendingCount} linjer afventer`} en
          faktor og tæller ikke med endnu.
        </p>
      )}
      {hiddenCount > 0 && (
        <p className="muted">
          {hiddenCount === 1 ? '1 linje ligger' : `${hiddenCount} linjer ligger`} uden for perioden og
          vises ikke, men er ikke slettet.
        </p>
      )}

      <AddLineForm groups={groups} factors={factors} defaultDate={defaultDate} onAdd={(line) => setLines((ls) => [...ls, { ...line, id: newId() }])} />
    </section>
  )
}

function AddLineForm({ groups, factors, defaultDate, onAdd }: { groups: readonly ActivityGroup[]; factors: readonly Factor[]; defaultDate: string; onAdd: (line: Omit<ActivityLine, 'id'>) => void }) {
  const id = useId()
  const [groupId, setGroupId] = useState(groups[0].id)
  const [factorId, setFactorId] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [dateTo, setDateTo] = useState('')
  const [quantity, setQuantity] = useState('')
  const [customFactor, setCustomFactor] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const group = groups.find((g) => g.id === groupId)!
  const options = factorOptions(group, factors)
  const chosen = options.some((f) => f.id === factorId) ? factorId : group.factorId

  function submit(e: FormEvent) {
    e.preventDefault()
    const q = parseNumber(quantity)
    const f = parseNumber(customFactor)
    const next: Record<string, string> = {}
    if (q === null) next.quantity = 'Angiv en mængde.'
    else if (Number.isNaN(q)) next.quantity = 'Mængden er ikke et gyldigt tal. Brug fx 1.234,5.'
    if (f !== null && Number.isNaN(f)) next.customFactor = 'Faktoren er ikke et gyldigt tal.'
    if (!date) next.date = 'Angiv en dato.'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    onAdd({
      group: groupId,
      factorId: chosen === group.factorId ? null : chosen,
      date,
      dateTo: dateTo || null,
      quantity: q,
      customFactor: f,
      description: description.trim(),
    })
    setQuantity('')
    setCustomFactor('')
    setDescription('')
  }

  const describedBy = (field: string) => (errors[field] ? `${id}-${field}-err` : undefined)
  return (
    <form className="add-line" onSubmit={submit} noValidate aria-label="Tilføj linje">
      <div className="field">
        <label htmlFor={`${id}-group`}>Type</label>
        <select id={`${id}-group`} value={groupId} onChange={(e) => { setGroupId(e.target.value); setFactorId('') }}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      </div>
      {options.length > 1 && (
        <div className="field">
          <label htmlFor={`${id}-factor-choice`}>Land</label>
          <select id={`${id}-factor-choice`} value={chosen} onChange={(e) => setFactorId(e.target.value)}>
            {options.map((f) => (
              <option key={f.id} value={f.id}>
                {f.region}{f.value === null ? ' (faktor mangler)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
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
        <label htmlFor={`${id}-quantity`}>Mængde ({group.unit})</label>
        <input id={`${id}-quantity`} inputMode="decimal" autoComplete="off" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-invalid={!!errors.quantity} aria-describedby={describedBy('quantity')} />
        {errors.quantity && <p id={`${id}-quantity-err`} className="error">{errors.quantity}</p>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-custom`}>Egen faktor <span className="optional">(kg CO2e/{group.unit}, valgfri)</span></label>
        <input id={`${id}-custom`} inputMode="decimal" autoComplete="off" value={customFactor} onChange={(e) => setCustomFactor(e.target.value)} aria-invalid={!!errors.customFactor} aria-describedby={describedBy('customFactor')} />
        {errors.customFactor && <p id={`${id}-customFactor-err`} className="error">{errors.customFactor}</p>}
      </div>
      <div className="field wide">
        <label htmlFor={`${id}-desc`}>Beskrivelse <span className="optional">(valgfri)</span></label>
        <input id={`${id}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="actions">
        <button type="submit">Tilføj linje</button>
      </div>
    </form>
  )
}
