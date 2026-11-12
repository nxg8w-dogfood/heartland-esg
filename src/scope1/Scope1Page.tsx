import { useId, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { Factor } from '../data/factors'
import type { Period } from '../calc/dates'
import { parseNumber } from '../calc/parseNumber'
import { scope1Groups, scope1Summary, type Scope1GroupId, type Scope1Line } from '../calc/scope1'
import { fuelLabel, scope1GroupFor, vehicleName, type Vehicle } from '../calc/vehicles'
import { formatDate, formatNumber } from '../format'
import { FactorCell } from '../factors/FactorCell'
import { lineFactorChoice } from '../factors/choice'
import { newId } from '../newId'
import { Tile } from '../ui'
import { scope1Href } from './subpages'

type Props = {
  period: Period
  factors: readonly Factor[]
  lines: Scope1Line[]
  setLines: Dispatch<SetStateAction<Scope1Line[]>>
  vehicles: readonly Vehicle[]
}

export function Scope1Page({ period, factors, lines, setLines, vehicles }: Props) {
  const summary = useMemo(() => scope1Summary(lines, factors, period, vehicles), [lines, factors, period, vehicles])
  const carName = (id: string | null | undefined) => {
    const v = vehicles.find((x) => x.id === id)
    return v ? vehicleName(v) : null
  }
  const hiddenCount = lines.length - summary.lines.length

  return (
    <>
      <p className="lead">
        Direkte udledninger fra egne eller kontrollerede kilder. Formel: aktivitetsdata ×
        emissionsfaktor ÷ 1.000 = tCO2e. Faktoren vælges efter linjens dato.
      </p>

      <section aria-labelledby="totals-heading">
        <h2 id="totals-heading" className="visually-hidden">Totaler</h2>
        <dl className="tiles" aria-live="polite">
          <Tile label="Scope 1 i alt" value={summary.total} accent />
          <Tile label="Mobil forbrænding" value={summary.mobile} />
          <Tile label="Stationær forbrænding" value={summary.stationary} />
          <Tile label="Kølemidler" value={summary.fugitive} />
        </dl>
        {summary.pendingCount > 0 && (
          <p className="warning">
            {summary.pendingCount === 1
              ? '1 linje afventer data og tæller ikke med endnu.'
              : `${summary.pendingCount} linjer afventer data og tæller ikke med endnu.`}
          </p>
        )}
        {summary.estimateCount > 0 && (
          <p className="notice">
            {summary.estimateCount === 1 ? '1 linje er' : `${summary.estimateCount} linjer er`} anslået
            ud fra kørte km og bilens typegodkendte brændstofforbrug, ikke fra tankkort.
          </p>
        )}
      </section>

      <section aria-labelledby="lines-heading">
        <h2 id="lines-heading">Aktivitetsdata</h2>
        {summary.lines.length === 0 ? (
          <div className="empty">
            <p>Ingen Scope 1-linjer i perioden.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">Scope 1-linjer i perioden</caption>
              <thead>
                <tr>
                  <th scope="col">Dato</th>
                  <th scope="col">Kilde</th>
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
                    <td>
                      {r.line.description}
                      {r.line.vehicleId && <span className="sub">{carName(r.line.vehicleId) ?? 'Slettet bil'}</span>}
                      {r.line.estimate && r.line.estimate.km !== null && (
                        <span className="sub">
                          Anslået: {formatNumber(r.line.estimate.km, 0)} km
                          {r.line.estimate.fuelShare !== null && r.line.estimate.fuelShare < 1 ? ` × ${formatNumber(r.line.estimate.fuelShare * 100, 0)} % på brændstof` : ''}
                          {r.line.estimate.kmPerLitre ? ` ÷ ${formatNumber(r.line.estimate.kmPerLitre, 1)} km/l` : ''}
                          {r.line.estimate.electricKwh !== null && `. På el: ca. ${formatNumber(r.line.estimate.electricKwh, 0)} kWh (ikke Scope 1)`}
                        </span>
                      )}
                    </td>
                    <td className="num">
                      {r.quantityInPeriod === null ? '—' : `${formatNumber(r.quantityInPeriod, 2)} ${r.group.unit}`}
                      {r.share < 1 && <span className="sub">{formatNumber(r.share * 100, 0)} % af linjen</span>}
                    </td>
                    <td className="num">
                      <FactorCell
                        value={r.factorValue}
                        factor={r.factor}
                        custom={r.line.customFactor != null}
                        choice={lineFactorChoice(r.line, r.group.factorId, factors, setLines, `${r.group.label}, ${formatDate(r.line.date)}`)}
                      />
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
                  <th scope="row" colSpan={5}>Scope 1 i alt</th>
                  <td className="num strong">{formatNumber(summary.total, 3)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {hiddenCount > 0 && (
          <p className="muted">
            {hiddenCount === 1 ? '1 linje ligger' : `${hiddenCount} linjer ligger`} uden for perioden
            og vises ikke, men er ikke slettet.
          </p>
        )}
      </section>

      <AddLineForm defaultDate={period.start} vehicles={vehicles} onAdd={(line) => setLines((ls) => [...ls, { ...line, id: newId() }])} startOpen={lines.length === 0} />

      <footer className="muted">
        Faktorer: BEIS GHG Conversion Factors 2025. “Andet kølemiddel” kræver en verificeret
        GWP-værdi — angiv den under Faktorer, eller som egen faktor på linjen.
      </footer>
    </>
  )
}

/** The source option for a line about one of the company's registered cars */
const CAR = 'car'
type Source = Scope1GroupId | typeof CAR

function AddLineForm({
  defaultDate,
  vehicles,
  onAdd,
  startOpen,
}: {
  defaultDate: string
  vehicles: readonly Vehicle[]
  onAdd: (line: Omit<Scope1Line, 'id'>) => void
  /** Open from the start when there are no lines yet; otherwise the form waits behind its toggle. */
  startOpen: boolean
}) {
  const id = useId()
  const [open, setOpen] = useState(startOpen)
  // A registered car is the usual source of a fuel line, so it comes first when there are any.
  const [source, setSource] = useState<Source>(() => (vehicles.length > 0 ? CAR : 's1-diesel'))
  const [vehicleId, setVehicleId] = useState('')
  const [inKm, setInKm] = useState(false)
  const [date, setDate] = useState(defaultDate)
  const [dateTo, setDateTo] = useState('')
  const [quantity, setQuantity] = useState('')
  const [customFactor, setCustomFactor] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const byCar = source === CAR
  const car = byCar ? vehicles.find((v) => v.id === vehicleId) ?? null : null
  // A car's line counts under the car's fuel; it isn't chosen separately.
  const group: Scope1GroupId = byCar ? (car ? scope1GroupFor(car.fuel) : 's1-diesel') : source
  const groupDef = scope1Groups.find((g) => g.id === group)!
  const canUseKm = car !== null && car.kmPerLitre !== null
  const byKm = inKm && canUseKm
  const unit = byKm ? 'km' : groupDef.unit

  function submit(e: FormEvent) {
    e.preventDefault()
    const q = parseNumber(quantity)
    const f = parseNumber(customFactor)
    const next: Record<string, string> = {}
    if (byCar && !car) next.car = vehicles.length > 0 ? 'Vælg en bil.' : 'Registrér bilen under Bilpark først.'
    if (q === null) next.quantity = 'Angiv en mængde.'
    else if (Number.isNaN(q)) next.quantity = 'Mængden er ikke et gyldigt tal. Brug fx 1.234,5.'
    if (f !== null && Number.isNaN(f)) next.customFactor = 'Faktoren er ikke et gyldigt tal.'
    if (!date) next.date = 'Angiv en dato.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    onAdd({
      group,
      date,
      dateTo: dateTo || null,
      // A line in km gets its litres from the car when it's calculated (resolveScope1Lines).
      quantity: byKm ? null : q,
      distanceKm: byKm ? q : null,
      vehicleId: car?.id ?? null,
      customFactor: f,
      description: description.trim(),
    })
    setQuantity('')
    setCustomFactor('')
    setDescription('')
  }

  const describedBy = (field: string, ...more: (string | false | undefined)[]) =>
    [errors[field] && `${id}-${field}-err`, ...more].filter(Boolean).join(' ') || undefined

  return (
    <section aria-labelledby={`${id}-heading`}>
      <div className="section-head">
        <h2 id={`${id}-heading`}>Tilføj linje</h2>
        <button type="button" className="link" aria-expanded={open} aria-controls={`${id}-form`} onClick={() => setOpen((o) => !o)}>
          {open ? 'Skjul formular' : 'Vis formular'}<span className="visually-hidden">: Tilføj linje</span>
        </button>
      </div>
      <form id={`${id}-form`} className="add-line" onSubmit={submit} noValidate hidden={!open}>
        <div className="field">
          <label htmlFor={`${id}-group`}>Kilde</label>
          <select id={`${id}-group`} value={source} onChange={(e) => setSource(e.target.value as Source)}>
            <option value={CAR}>Firmabil fra Bilpark</option>
            {scope1Groups.map((g) => (
              <option key={g.id} value={g.id}>{g.kind === 'mobile' ? `${g.label}, uden bestemt bil` : g.label}</option>
            ))}
          </select>
        </div>
        {byCar && (
          <div className="field">
            <label htmlFor={`${id}-car`}>Bil</label>
            <select
              id={`${id}-car`}
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              aria-invalid={!!errors.car}
              aria-describedby={describedBy('car', car ? `${id}-fuel` : vehicles.length === 0 && `${id}-car-hint`)}
            >
              <option value="">Vælg bil</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{vehicleName(v)}</option>)}
            </select>
            {errors.car && <p id={`${id}-car-err`} className="error">{errors.car}</p>}
            {car && <p id={`${id}-fuel`} className="sub">Brændstof: {fuelLabel[car.fuel]} (fra bilen)</p>}
            {vehicles.length === 0 && <p id={`${id}-car-hint`} className="sub">Registrér biler under <a href={scope1Href('bilpark')}>Bilpark</a>.</p>}
          </div>
        )}
        {car && (
          <fieldset className="field unit-choice">
            <legend>Angivet i</legend>
            <label className="check"><input type="radio" name={`${id}-unit`} checked={!byKm} onChange={() => setInKm(false)} /> Liter (tankkort)</label>
            <label className="check">
              <input type="radio" name={`${id}-unit`} checked={byKm} disabled={!canUseKm} onChange={() => setInKm(true)} aria-describedby={canUseKm ? undefined : `${id}-km-hint`} /> Kørte km
            </label>
            {!canUseKm && <p id={`${id}-km-hint`} className="sub">Bilen har intet brændstofforbrug (km/l). Angiv det under <a href={scope1Href('bilpark')}>Bilpark</a>.</p>}
          </fieldset>
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
          <label htmlFor={`${id}-quantity`}>Mængde ({unit})</label>
          <input id={`${id}-quantity`} inputMode="decimal" autoComplete="off" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-invalid={!!errors.quantity} aria-describedby={describedBy('quantity')} />
          {errors.quantity && <p id={`${id}-quantity-err`} className="error">{errors.quantity}</p>}
        </div>
        <div className="field">
          <label htmlFor={`${id}-factor`}>Egen faktor <span className="optional">(kg CO2e/{groupDef.unit}, valgfri)</span></label>
          <input id={`${id}-factor`} inputMode="decimal" autoComplete="off" value={customFactor} onChange={(e) => setCustomFactor(e.target.value)} aria-invalid={!!errors.customFactor} aria-describedby={describedBy('customFactor')} />
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
    </section>
  )
}
