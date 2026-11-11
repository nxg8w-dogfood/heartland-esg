import { useId, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { Factor } from '../data/factors'
import type { Period } from '../calc/dates'
import { parseNumber } from '../calc/parseNumber'
import { scope1Groups, scope1Summary, type Scope1GroupId, type Scope1Line } from '../calc/scope1'
import { scope1GroupFor, vehicleName, type Vehicle } from '../calc/vehicles'
import { formatDate, formatNumber } from '../format'
import { FactorCell } from '../factors/FactorCell'
import { lineFactorChoice } from '../factors/choice'
import { newId } from '../newId'
import { Tile } from '../ui'
import { scope1Href } from './subpages'

const exampleLines: Omit<Scope1Line, 'id'>[] = [
  { group: 's1-diesel', date: '2025-01-01', dateTo: '2025-03-31', quantity: 1850, description: 'Brændstofkort, Q1' },
  { group: 's1-benzin', date: '2025-02-14', quantity: 420, description: 'Poolbil' },
  { group: 's1-naturgas', date: '2025-01-01', dateTo: '2025-12-31', quantity: 12400, description: 'Hovedkontor' },
  { group: 's1-hfc134a', date: '2025-06-03', quantity: 1.5, description: 'Efterfyldning, køleanlæg' },
  { group: 's1-koel-andet', date: '2025-09-10', quantity: 0.8, description: 'Serverrum, type ukendt' },
]

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

      <AddLineForm defaultDate={period.start} vehicles={vehicles} onAdd={(line) => setLines((ls) => [...ls, { ...line, id: newId() }])} />

      <section aria-labelledby="lines-heading">
        <h2 id="lines-heading">Aktivitetsdata</h2>
        {summary.lines.length === 0 ? (
          <div className="empty">
            <p>Ingen Scope 1-linjer i perioden.</p>
            {lines.length === 0 && (
              <button type="button" onClick={() => setLines(exampleLines.map((l) => ({ ...l, id: newId() })))}>
                Indsæt eksempellinjer
              </button>
            )}
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

      <footer className="muted">
        Faktorer: BEIS GHG Conversion Factors 2025. “Andet kølemiddel” kræver en verificeret
        GWP-værdi — angiv den under Faktorer, eller som egen faktor på linjen.
      </footer>
    </>
  )
}

function AddLineForm({ defaultDate, vehicles, onAdd }: { defaultDate: string; vehicles: readonly Vehicle[]; onAdd: (line: Omit<Scope1Line, 'id'>) => void }) {
  const id = useId()
  const [group, setGroup] = useState<Scope1GroupId>('s1-diesel')
  const [vehicleId, setVehicleId] = useState('')
  const [inKm, setInKm] = useState(false)
  const [date, setDate] = useState(defaultDate)
  const [dateTo, setDateTo] = useState('')
  const [quantity, setQuantity] = useState('')
  const [customFactor, setCustomFactor] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const groupDef = scope1Groups.find((g) => g.id === group)!
  const cars = groupDef.kind === 'mobile' ? vehicles.filter((v) => scope1GroupFor(v.fuel) === group) : []
  const car = cars.find((v) => v.id === vehicleId) ?? null
  const canUseKm = car !== null && car.kmPerLitre !== null
  const byKm = inKm && canUseKm
  const unit = byKm ? 'km' : groupDef.unit

  function chooseGroup(next: Scope1GroupId) {
    setGroup(next)
    // A car runs on one fuel, so a car chosen for the other fuel no longer fits.
    if (!vehicles.some((v) => v.id === vehicleId && scope1GroupFor(v.fuel) === next)) {
      setVehicleId('')
      setInKm(false)
    }
  }

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

  const describedBy = (field: string) => (errors[field] ? `${id}-${field}-err` : undefined)

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Tilføj linje</h2>
      <form className="add-line" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={`${id}-group`}>Kilde</label>
          <select id={`${id}-group`} value={group} onChange={(e) => chooseGroup(e.target.value as Scope1GroupId)}>
            {scope1Groups.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
        </div>
        {groupDef.kind === 'mobile' && (
          <div className="field">
            <label htmlFor={`${id}-car`}>Bil <span className="optional">(valgfri)</span></label>
            <select id={`${id}-car`} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} aria-describedby={cars.length === 0 ? `${id}-car-hint` : undefined}>
              <option value="">Ingen bestemt bil</option>
              {cars.map((v) => <option key={v.id} value={v.id}>{vehicleName(v)}</option>)}
            </select>
            {cars.length === 0 && <p id={`${id}-car-hint`} className="sub">Registrér biler under <a href={scope1Href('bilpark')}>Bilpark</a>.</p>}
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
