import { useId, useRef, useState, type Dispatch, type FormEvent, type RefObject, type SetStateAction } from 'react'
import { parseNumber } from '../calc/parseNumber'
import type { Scope1Line } from '../calc/scope1'
import { formatPlate, fuelLabel, normalisePlate, vehicleName, type TestNorm, type Vehicle, type VehicleFuel } from '../calc/vehicles'
import { formatDate, formatNumber } from '../format'
import { newId } from '../newId'
import type { LookupVehicle, PlateLookup } from './lookup'

type Props = {
  vehicles: Vehicle[]
  setVehicles: Dispatch<SetStateAction<Vehicle[]>>
  scope1Lines: readonly Scope1Line[]
  lookup: PlateLookup
}

export function VehiclesPage({ vehicles, setVehicles, scope1Lines, lookup }: Props) {
  // What the data form starts with: a lookup result, a car being edited, or nothing.
  const [draft, setDraft] = useState<{ key: number; vehicle: Partial<Vehicle> } | null>(null)
  const formHeading = useRef<HTMLHeadingElement>(null)
  const usedBy = (id: string) => scope1Lines.filter((l) => l.vehicleId === id).length

  const openForm = (vehicle: Partial<Vehicle>) => {
    setDraft((d) => ({ key: (d?.key ?? 0) + 1, vehicle }))
    // Move focus to the form, so keyboard and screen-reader users land where the data is.
    requestAnimationFrame(() => formHeading.current?.focus())
  }

  return (
    <>
      <p className="lead">
        Virksomhedens diesel- og benzinbiler, også plugin-hybrider. Slå bilen op på nummerpladen, så
        hentes mærke, model og brændstofforbrug (WLTP) fra Motorregistret. Under Udledninger kan en
        linje så angives i kørte km for en bil, når der ikke er tankkort; den omregnes til liter med bilens
        km/l. For en plugin-hybrid regnes kun den del af kørslen med, der er på brændstof.
      </p>

      <LookupForm
        lookup={lookup}
        known={(plate) => vehicles.find((v) => v.plate === plate)}
        onFound={(vehicle) => openForm(vehicle)}
        onManual={(plate) => openForm({ plate: plate ?? '', source: 'manual' })}
      />

      {draft && (
        <VehicleForm
          key={draft.key}
          headingRef={formHeading}
          initial={draft.vehicle}
          taken={(plate) => vehicles.some((v) => v.plate === plate && v.id !== draft.vehicle.id)}
          onCancel={() => setDraft(null)}
          onSave={(vehicle) => {
            setVehicles((vs) => (vs.some((v) => v.id === vehicle.id) ? vs.map((v) => (v.id === vehicle.id ? vehicle : v)) : [...vs, vehicle]))
            setDraft(null)
          }}
        />
      )}

      <section aria-labelledby="vehicles-heading">
        <h2 id="vehicles-heading">Registrerede biler</h2>
        {vehicles.length === 0 ? (
          <div className="empty"><p>Ingen biler endnu.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">Virksomhedens biler</caption>
              <thead>
                <tr>
                  <th scope="col">Nummerplade</th>
                  <th scope="col">Bil</th>
                  <th scope="col">Brændstof</th>
                  <th scope="col" className="num">Forbrug</th>
                  <th scope="col" className="num">CO2</th>
                  <th scope="col" className="num">Rækkevidde</th>
                  <th scope="col">Kilde</th>
                  <th scope="col"><span className="visually-hidden">Handlinger</span></th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => {
                  const used = usedBy(v.id)
                  return (
                    <tr key={v.id}>
                      <th scope="row">{formatPlate(v.plate)}</th>
                      <td>
                        {[v.make, v.model].filter(Boolean).join(' ') || '—'}
                        {v.variant && <span className="sub">{v.variant}</span>}
                        {v.firstRegistration && <span className="sub">1. reg. {formatDate(v.firstRegistration)}</span>}
                      </td>
                      <td>
                        {fuelLabel[v.fuel]}
                        {v.pluginHybrid && (
                          <span className="sub">
                            Plugin-hybrid, {v.fuelSharePercent == null ? <span className="pending">andel på brændstof mangler</span> : `${formatNumber(v.fuelSharePercent, 0)} % på brændstof`}
                          </span>
                        )}
                      </td>
                      <td className="num">
                        {v.kmPerLitre === null ? <span className="pending">Mangler</span> : `${formatNumber(v.kmPerLitre, 1)} km/l`}
                        {v.testNorm && <span className="sub">{v.pluginHybrid ? `${v.testNorm}, på brændstof` : v.testNorm}</span>}
                        {v.pluginHybrid && v.whPerKm != null && <span className="sub">{formatNumber(v.whPerKm, 0)} Wh/km på el</span>}
                      </td>
                      <td className="num">{v.co2GPerKm == null ? '—' : `${formatNumber(v.co2GPerKm, 0)} g/km`}</td>
                      <td className="num">{v.rangeKm == null ? '—' : `${formatNumber(v.rangeKm, 0)} km`}</td>
                      <td>
                        {v.source === 'lookup' ? 'Motorregistret' : 'Indtastet'}
                        {v.source === 'lookup' && v.fetchedAt && <span className="sub">{formatDate(v.fetchedAt)}</span>}
                      </td>
                      <td>
                        <button type="button" className="link" onClick={() => openForm(v)} aria-label={`Ret ${vehicleName(v)}`}>Ret</button>
                        {used > 0 ? (
                          <span className="sub">Bruges af {used === 1 ? '1 linje' : `${used} linjer`} i Scope 1</span>
                        ) : (
                          <button type="button" className="link" onClick={() => setVehicles((vs) => vs.filter((x) => x.id !== v.id))} aria-label={`Slet ${vehicleName(v)}`}>
                            Slet
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="muted">
        Opslag sker via MotorAPI (motorapi.dk), som henter data fra Motorregistret ugentligt.
        Brændstofforbruget er typegodkendelsens tal (WLTP for biler fra september 2017, ellers ofte
        NEDC) og er typisk lavere end det reelle forbrug. For plugin-hybrider er andelen på
        brændstof et skøn. Linjer i liter fra tankkort er mere præcise.
      </footer>
    </>
  )
}

type LookupState =
  | { state: 'idle' }
  | { state: 'busy'; plate: string }
  | { state: 'done'; message: string; notes: string[] }
  | { state: 'failed'; message: string; plate: string | null }

function LookupForm({ lookup, known, onFound, onManual }: {
  lookup: PlateLookup
  known: (plate: string) => Vehicle | undefined
  onFound: (vehicle: LookupVehicle) => void
  onManual: (plate: string | null) => void
}) {
  const id = useId()
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<LookupState>({ state: 'idle' })

  async function submit(e: FormEvent) {
    e.preventDefault()
    const plate = normalisePlate(input)
    if (!plate) {
      setError(input.trim() ? 'Nummerpladen skal være 2–7 bogstaver og tal, fx AB 12 345.' : 'Angiv en nummerplade.')
      return
    }
    setError(null)
    const existing = known(plate)
    if (existing) {
      setStatus({ state: 'failed', message: `${formatPlate(plate)} er allerede registreret: ${[existing.make, existing.model].filter(Boolean).join(' ')}.`, plate: null })
      return
    }
    setStatus({ state: 'busy', plate })
    const result = await lookup.lookup(plate).catch(() => null)
    if (!result) {
      setStatus({ state: 'failed', message: 'Opslaget mislykkedes. Prøv igen om lidt, eller indtast bilen selv.', plate })
    } else if (result.ok) {
      setStatus({ state: 'done', message: `Fandt ${vehicleName({ ...result.vehicle, id: '' })}. Tjek data, og gem bilen.`, notes: result.notes })
      setInput('')
      onFound(result.vehicle)
    } else {
      setStatus({ state: 'failed', message: result.message, plate: result.reason === 'not-supported' ? null : plate })
    }
  }

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Tilføj bil</h2>
      {lookup.label && <p className="notice">{lookup.label}</p>}
      <form className="add-line" onSubmit={submit} noValidate>
        {lookup.available && (
          <>
            <div className="field">
              <label htmlFor={`${id}-plate`}>Nummerplade</label>
              <input
                id={`${id}-plate`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-plate-err` : undefined}
              />
              {error && <p id={`${id}-plate-err`} className="error">{error}</p>}
            </div>
            <div className="actions">
              <button type="submit" disabled={status.state === 'busy'}>Slå op</button>{' '}
              <button type="button" className="link" onClick={() => onManual(normalisePlate(input))}>Indtast selv</button>
            </div>
          </>
        )}
        {!lookup.available && (
          <div className="actions">
            <button type="button" onClick={() => onManual(null)}>Indtast bil</button>
          </div>
        )}
      </form>
      <div role="status" aria-live="polite">
        {status.state === 'busy' && <p>Slår {formatPlate(status.plate)} op …</p>}
        {status.state === 'done' && (
          <>
            <p>{status.message}</p>
            {status.notes.map((n) => <p key={n} className="warning">{n}</p>)}
          </>
        )}
        {status.state === 'failed' && (
          <p className="warning">
            {status.message}{' '}
            {status.plate && (
              <button type="button" className="link" onClick={() => onManual(status.plate)}>Indtast {formatPlate(status.plate)} selv</button>
            )}
          </p>
        )}
      </div>
    </section>
  )
}

function VehicleForm({ initial, headingRef, taken, onSave, onCancel }: {
  initial: Partial<Vehicle>
  headingRef: RefObject<HTMLHeadingElement | null>
  taken: (plate: string) => boolean
  onSave: (vehicle: Vehicle) => void
  onCancel: () => void
}) {
  const id = useId()
  const num = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))
  const [plate, setPlate] = useState(initial.plate ? formatPlate(initial.plate) : '')
  const [make, setMake] = useState(initial.make ?? '')
  const [model, setModel] = useState(initial.model ?? '')
  const [variant, setVariant] = useState(initial.variant ?? '')
  const [fuel, setFuel] = useState<VehicleFuel>(initial.fuel ?? 'diesel')
  const [firstRegistration, setFirstRegistration] = useState(initial.firstRegistration ?? '')
  const [kmPerLitre, setKmPerLitre] = useState(num(initial.kmPerLitre))
  const [co2, setCo2] = useState(num(initial.co2GPerKm))
  const [testNorm, setTestNorm] = useState<TestNorm | ''>(initial.testNorm ?? '')
  const [range, setRange] = useState(num(initial.rangeKm))
  const [pluginHybrid, setPluginHybrid] = useState(initial.pluginHybrid === true)
  const [fuelShare, setFuelShare] = useState(num(initial.fuelSharePercent))
  const [whPerKm, setWhPerKm] = useState(num(initial.whPerKm))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const editing = !!initial.id
  const fromLookup = initial.source === 'lookup'

  function submit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    const p = normalisePlate(plate)
    if (!plate.trim()) next.plate = 'Angiv en nummerplade.'
    else if (!p) next.plate = 'Nummerpladen skal være 2–7 bogstaver og tal, fx AB 12 345.'
    else if (taken(p)) next.plate = 'Der er allerede en bil med den nummerplade.'
    if (!make.trim()) next.make = 'Angiv mærket.'
    const positiveOrNull = (field: string, value: string, label: string) => {
      const n = parseNumber(value)
      if (n === null) return null
      if (Number.isNaN(n) || n <= 0) { next[field] = `${label} skal være et tal over 0.`; return null }
      return n
    }
    const kml = positiveOrNull('kmPerLitre', kmPerLitre, 'Forbruget')
    const co2Value = positiveOrNull('co2', co2, 'CO2-udledningen')
    const rangeValue = positiveOrNull('range', range, 'Rækkevidden')
    const whValue = pluginHybrid ? positiveOrNull('whPerKm', whPerKm, 'Elforbruget') : null
    let share: number | null = null
    if (pluginHybrid) {
      share = parseNumber(fuelShare.replace(/\s*%\s*$/, ''))
      if (share === null) next.fuelShare = 'Angiv et skøn over andelen på brændstof, fx 40 %.'
      else if (Number.isNaN(share) || share < 0 || share > 100) { next.fuelShare = 'Andelen skal være mellem 0 og 100 %.'; share = null }
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return

    // Changing the technical data by hand makes it the user's, not the register's.
    // The fuel share is always the user's estimate, so it doesn't count as a change; nor does
    // filling in a figure the register didn't have.
    const differs = (now: number | null, before: number | null | undefined) => before != null && now !== before
    const changed = fromLookup && (differs(kml, initial.kmPerLitre) || differs(whValue, initial.whPerKm) || fuel !== initial.fuel || (co2Value ?? null) !== (initial.co2GPerKm ?? null) || pluginHybrid !== (initial.pluginHybrid === true))
    onSave({
      id: initial.id ?? newId(),
      plate: p!,
      make: make.trim(),
      model: model.trim(),
      variant: variant.trim() || undefined,
      fuel,
      firstRegistration: firstRegistration || null,
      kmPerLitre: kml,
      ...(pluginHybrid ? { pluginHybrid: true, fuelSharePercent: share, whPerKm: whValue } : {}),
      co2GPerKm: co2Value,
      testNorm: testNorm || null,
      rangeKm: rangeValue,
      source: fromLookup && !changed ? 'lookup' : 'manual',
      fetchedAt: fromLookup && !changed ? (initial.fetchedAt ?? null) : null,
    })
  }

  const describedBy = (field: string, hint?: string) =>
    [hint, errors[field] ? `${id}-${field}-err` : undefined].filter(Boolean).join(' ') || undefined
  const err = (field: string) => errors[field] && <p id={`${id}-${field}-err`} className="error">{errors[field]}</p>

  return (
    <section aria-labelledby={`${id}-heading`} className="card">
      <h2 id={`${id}-heading`} ref={headingRef} tabIndex={-1}>{editing ? `Ret ${formatPlate(initial.plate ?? '')}` : 'Bilens data'}</h2>
      {fromLookup && (
        <p className="muted">
          Hentet fra Motorregistret. Ret tallene, hvis du har bedre data; så markeres bilen som indtastet.
          {initial.pluginHybrid && ' Andelen på brændstof er altid dit eget skøn.'}
        </p>
      )}
      <form className="add-line" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={`${id}-plate`}>Nummerplade</label>
          <input id={`${id}-plate`} value={plate} onChange={(e) => setPlate(e.target.value)} autoComplete="off" spellCheck={false} aria-invalid={!!errors.plate} aria-describedby={describedBy('plate')} />
          {err('plate')}
        </div>
        <div className="field">
          <label htmlFor={`${id}-make`}>Mærke</label>
          <input id={`${id}-make`} value={make} onChange={(e) => setMake(e.target.value)} autoComplete="off" aria-invalid={!!errors.make} aria-describedby={describedBy('make')} />
          {err('make')}
        </div>
        <div className="field">
          <label htmlFor={`${id}-model`}>Model <span className="optional">(valgfri)</span></label>
          <input id={`${id}-model`} value={model} onChange={(e) => setModel(e.target.value)} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor={`${id}-variant`}>Variant <span className="optional">(valgfri)</span></label>
          <input id={`${id}-variant`} value={variant} onChange={(e) => setVariant(e.target.value)} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor={`${id}-fuel`}>Brændstof</label>
          <select id={`${id}-fuel`} value={fuel} onChange={(e) => setFuel(e.target.value as VehicleFuel)}>
            <option value="diesel">Diesel</option>
            <option value="benzin">Benzin</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-reg`}>Første registrering <span className="optional">(valgfri)</span></label>
          <input id={`${id}-reg`} type="date" value={firstRegistration} onChange={(e) => setFirstRegistration(e.target.value)} />
        </div>
        <div className="field">
          <label className="check" htmlFor={`${id}-phev`}>
            <input id={`${id}-phev`} type="checkbox" checked={pluginHybrid} onChange={(e) => setPluginHybrid(e.target.checked)} aria-describedby={`${id}-phev-hint`} />
            Plugin-hybrid
          </label>
          <p id={`${id}-phev-hint`} className="sub">Kører en del af tiden på strøm fra opladning. Strømmen hører ikke til Scope 1.</p>
        </div>
        {pluginHybrid && (
          <div className="field">
            <label htmlFor={`${id}-share`}>Andel af kørslen på brændstof (%)</label>
            <input id={`${id}-share`} inputMode="decimal" autoComplete="off" value={fuelShare} onChange={(e) => setFuelShare(e.target.value)} aria-invalid={!!errors.fuelShare} aria-describedby={describedBy('fuelShare', `${id}-share-hint`)} />
            <p id={`${id}-share-hint`} className="sub">Et skøn, fx ud fra hvor ofte bilen lades op og hvor langt den kører ad gangen. Resten regnes som el-kørsel.</p>
            {err('fuelShare')}
          </div>
        )}
        <div className="field">
          <label htmlFor={`${id}-kml`}>{pluginHybrid ? 'Forbrug på brændstof (km/l)' : 'Brændstofforbrug (km/l)'}</label>
          <input id={`${id}-kml`} inputMode="decimal" autoComplete="off" value={kmPerLitre} onChange={(e) => setKmPerLitre(e.target.value)} aria-invalid={!!errors.kmPerLitre} aria-describedby={describedBy('kmPerLitre', `${id}-kml-hint`)} />
          <p id={`${id}-kml-hint`} className="sub">
            {pluginHybrid
              ? 'Hvor langt bilen kører på en liter, når den kører på brændstof (typegodkendelsens tal). Bruges til at omregne km på brændstof til liter.'
              : 'Bruges til at omregne km til liter. Uden det kan bilen kun bruges med linjer i liter.'}
          </p>
          {err('kmPerLitre')}
        </div>
        {pluginHybrid && (
          <div className="field">
            <label htmlFor={`${id}-wh`}>Elforbrug (Wh/km) <span className="optional">(valgfri)</span></label>
            <input id={`${id}-wh`} inputMode="decimal" autoComplete="off" value={whPerKm} onChange={(e) => setWhPerKm(e.target.value)} aria-invalid={!!errors.whPerKm} aria-describedby={describedBy('whPerKm', `${id}-wh-hint`)} />
            <p id={`${id}-wh-hint`} className="sub">Ved kørsel på el. Viser, hvor meget strøm el-kørslen bruger; strømmen tælles ikke i Scope 1.</p>
            {err('whPerKm')}
          </div>
        )}
        <div className="field">
          <label htmlFor={`${id}-norm`}>Målt efter</label>
          <select id={`${id}-norm`} value={testNorm} onChange={(e) => setTestNorm(e.target.value as TestNorm | '')}>
            <option value="">Ukendt</option>
            <option value="WLTP">WLTP</option>
            <option value="NEDC">NEDC</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-co2`}>CO2 (g/km) <span className="optional">(valgfri)</span></label>
          <input id={`${id}-co2`} inputMode="decimal" autoComplete="off" value={co2} onChange={(e) => setCo2(e.target.value)} aria-invalid={!!errors.co2} aria-describedby={describedBy('co2')} />
          {err('co2')}
        </div>
        <div className="field">
          <label htmlFor={`${id}-range`}>Rækkevidde (km) <span className="optional">(valgfri)</span></label>
          <input id={`${id}-range`} inputMode="decimal" autoComplete="off" value={range} onChange={(e) => setRange(e.target.value)} aria-invalid={!!errors.range} aria-describedby={describedBy('range')} />
          {err('range')}
        </div>
        <div className="actions">
          <button type="submit">{editing ? 'Gem ændringer' : 'Gem bil'}</button>{' '}
          <button type="button" className="link" onClick={onCancel}>Annullér</button>
        </div>
      </form>
    </section>
  )
}
