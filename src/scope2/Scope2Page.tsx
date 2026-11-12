import { useId, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { Factor } from '../data/factors'
import type { Period } from '../calc/dates'
import { parseNumber } from '../calc/parseNumber'
import { municipalities, municipality, priceAreaLabel } from '../data/municipalities'
import {
  gridFamilyFor,
  heatingFactors,
  heatingShare,
  marketInstruments,
  scope2Summary,
  type HeatingFactorId,
  type Location,
  type LocationSummary,
  type MarketInstrumentId,
  type Scope2Kind,
  type Scope2Line,
} from '../calc/scope2'
import { formatDate, formatFactor, formatNumber } from '../format'
import { factorLabel } from '../factors/label'
import { newId } from '../newId'
import { Tile } from '../ui'
import { defaultLocation } from './defaultLocation'
import { UtilityImport } from './UtilityImport'

const kindLabel: Record<Scope2Kind, string> = { electricity: 'El', heating: 'Fjernvarme' }
const regions = [...new Set(municipalities.map((m) => m.region))]

type Props = {
  period: Period
  factors: readonly Factor[]
  locations: Location[]
  setLocations: Dispatch<SetStateAction<Location[]>>
  lines: Scope2Line[]
  setLines: Dispatch<SetStateAction<Scope2Line[]>>
}

export function Scope2Page({ period, factors, locations, setLocations, lines, setLines }: Props) {
  const summary = useMemo(() => scope2Summary(locations, lines, factors, period), [locations, lines, factors, period])
  const shownCount = summary.locations.reduce((n, l) => n + l.electricity.length + l.heating.length, 0)
  const hiddenCount = lines.filter((l) => locations.some((loc) => loc.id === l.locationId)).length - shownCount

  const updateLocation = (id: string, patch: Partial<Location>) =>
    setLocations((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const deleteLocation = (location: Location) => {
    const count = lines.filter((l) => l.locationId === location.id).length
    const message = count
      ? `Slet ${location.name} og dens ${count} ${count === 1 ? 'linje' : 'linjer'}?`
      : `Slet ${location.name}?`
    if (!window.confirm(message)) return
    setLocations((ls) => ls.filter((l) => l.id !== location.id))
    setLines((ls) => ls.filter((l) => l.locationId !== location.id))
  }
  const insertExamples = () => {
    // Only offered when there's at least one location and no lines yet.
    const hq = locations[0]
    const store: Location = { ...defaultLocation(), name: 'Butik Aarhus', marketInstrument: 'oprindelsesgaranti', heatingFactorId: 'f-s2-fjernvarme-lokal' }
    setLocations((ls) => [...ls, store])
    setLines((ls) => [
      ...ls,
      { id: newId(), locationId: hq.id, kind: 'electricity', date: '2025-01-01', dateTo: '2025-06-30', kWh: 84_000, description: 'Elregning H1' },
      { id: newId(), locationId: hq.id, kind: 'electricity', date: '2025-07-01', dateTo: '2025-12-31', kWh: 79_500, description: 'Elregning H2' },
      { id: newId(), locationId: hq.id, kind: 'heating', date: '2025-01-01', dateTo: '2025-12-31', kWh: 96_000, description: 'Fjernvarme, årsopgørelse' },
      { id: newId(), locationId: store.id, kind: 'electricity', date: '2024-12-01', dateTo: '2025-02-28', kWh: 9_000, description: 'Kvartalsregning' },
      { id: newId(), locationId: store.id, kind: 'heating', date: '2025-01-01', dateTo: '2025-12-31', kWh: 22_000, description: 'Fjernvarme' },
    ])
  }

  return (
    <>
      <h1>Scope 2 — indirekte udledninger fra energi</h1>
      <p className="lead">
        Indkøbt el og fjernvarme pr. lokation. Location-based bruger nettets faktor på linjens
        dato; market-based bruger lokationens instrument. Begge rapporteres (dual reporting,
        GHG-protokollens Scope 2 Guidance).
      </p>

      <section aria-labelledby="s2-totals">
        <h2 id="s2-totals" className="visually-hidden">Totaler</h2>
        <dl className="tiles" aria-live="polite">
          <Tile label="Location-based i alt" value={summary.locationTotal} />
          <Tile label="Market-based i alt" value={summary.marketTotal} accent note={summary.pendingMarket ? 'Ufuldstændig — se nedenfor' : undefined} />
          <Tile label="Elforbrug" value={summary.electricityKWh} unit="kWh" decimals={0} />
          <Tile label="Fjernvarme" value={summary.heatingKWh} unit="kWh" decimals={0} />
        </dl>
        {summary.pendingMarket && (
          <p className="warning">
            <strong>Market-based faktor afventer.</strong> En eller flere lokationer bruger
            residualmiks for et år, hvor der ikke er valgt en kilde til Energinets værdi. Den må
            ikke gættes, så market-based totalen er ufuldstændig. Vælg kilden under Faktorer, når
            værdien er offentliggjort.
          </p>
        )}
        {summary.pendingHeating && (
          <p className="warning">
            <strong>Fjernvarmefaktor afventer.</strong> En lokation bruger en lokal
            leverandørfaktor uden værdi, så dens fjernvarme tæller ikke med. Indtast faktoren under
            Faktorer, eller vælg BEIS-fallback for lokationen.
          </p>
        )}
        {summary.invalidCount > 0 && (
          <p className="warning">
            {summary.invalidCount === 1 ? '1 linje har' : `${summary.invalidCount} linjer har`} en
            værdi, der ikke er et gyldigt tal, og tæller ikke med.
          </p>
        )}
      </section>

      <section aria-labelledby="s2-locations">
        <div className="section-head">
          <h2 id="s2-locations">Lokationer</h2>
          <button type="button" onClick={() => setLocations((ls) => [...ls, { ...defaultLocation(), name: 'Ny lokation' }])}>
            Ny lokation
          </button>
        </div>
        {locations.length === 0 ? (
          <div className="empty">
            <p>Ingen lokationer. Opret en lokation for at registrere el og fjernvarme.</p>
          </div>
        ) : (
          summary.locations.map((l) => (
            <LocationCard
              key={l.location.id}
              summary={l}
              onChange={(patch) => updateLocation(l.location.id, patch)}
              onDelete={() => deleteLocation(l.location)}
              onDeleteLine={(id) => setLines((ls) => ls.filter((x) => x.id !== id))}
            />
          ))
        )}
        {lines.length === 0 && locations.length > 0 && (
          <button type="button" className="secondary" onClick={insertExamples}>
            Indsæt eksempellinjer
          </button>
        )}
        {hiddenCount > 0 && (
          <p className="muted">
            {hiddenCount === 1 ? '1 linje ligger' : `${hiddenCount} linjer ligger`} uden for perioden
            og vises ikke, men er ikke slettet.
          </p>
        )}
      </section>

      {locations.length > 0 && (
        <AddLineForm
          locations={locations}
          defaultDate={period.start}
          onAdd={(line) => setLines((ls) => [...ls, { ...line, id: newId() }])}
        />
      )}

      {locations.length > 0 && <UtilityImport period={period} locations={locations} setLocations={setLocations} lines={lines} setLines={setLines} />}

      {summary.locations.length > 1 && <Consolidated summary={summary.locations} totals={summary} />}
    </>
  )
}

function LocationCard({
  summary,
  onChange,
  onDelete,
  onDeleteLine,
}: {
  summary: LocationSummary
  onChange: (patch: Partial<Location>) => void
  onDelete: () => void
  onDeleteLine: (id: string) => void
}) {
  const id = useId()
  const { location } = summary
  const rows = [...summary.electricity, ...summary.heating].sort((a, b) => a.line.date.localeCompare(b.line.date))
  // Collapsed to its sums once it has lines; a new, empty location opens so it can be named.
  const [open, setOpen] = useState(() => rows.length === 0)
  const place = municipality(location.municipalityCode)
  return (
    <article className="card" aria-labelledby={`${id}-title`}>
      <div className="location-head">
        <h3 id={`${id}-title`}>
          {location.name || 'Unavngivet lokation'}
          <span className="sub">{place ? `${place.name} · ${place.priceArea}` : 'Kommune ikke valgt'}</span>
        </h3>
        <button type="button" className="link" aria-expanded={open} aria-controls={`${id}-details`} onClick={() => setOpen((o) => !o)}>
          {open ? 'Skjul detaljer' : 'Vis detaljer'}<span className="visually-hidden">: {location.name}</span>
        </button>
      </div>
      <dl className="location-sums">
        <div><dt>El</dt><dd>{formatNumber(summary.electricityKWh, 0)} kWh</dd></div>
        <div>
          <dt>Fjernvarme</dt>
          <dd>
            {formatNumber(summary.heatingKWh, 0)} kWh
            {heatingShare(location) < 1 && <span className="sub">{formatPercent(heatingShare(location))} af bygningen</span>}
          </dd>
        </div>
        <div><dt>Location-based</dt><dd>{formatNumber(summary.locationTotal, 3)} tCO2e</dd></div>
        <div>
          <dt>Market-based</dt>
          <dd>
            {formatNumber(summary.marketTotal, 3)} tCO2e
            {summary.pendingMarket && <span className="sub warning-text">Ufuldstændig</span>}
          </dd>
        </div>
        <div><dt>Linjer i perioden</dt><dd>{rows.length}</dd></div>
      </dl>
      <div id={`${id}-details`} className="location-details" hidden={!open}>
      <div className="location-settings">
        <div className="field">
          <label htmlFor={`${id}-name`}>Navn</label>
          <input id={`${id}-name`} value={location.name} onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-municipality`}>Kommune</label>
          <select
            id={`${id}-municipality`}
            value={location.municipalityCode ?? ''}
            aria-describedby={`${id}-area`}
            onChange={(e) => onChange({ municipalityCode: e.target.value || null, gridFamily: gridFamilyFor(e.target.value) })}
          >
            <option value="">Ikke valgt (landsgennemsnit)</option>
            {regions.map((region) => (
              <optgroup key={region} label={region}>
                {municipalities.filter((m) => m.region === region).map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
              </optgroup>
            ))}
          </select>
          <p id={`${id}-area`} className="sub">
            {place ? `Elområde ${priceAreaLabel[place.priceArea]}` : 'Elfaktoren er landsgennemsnittet, til der er valgt en kommune.'}
          </p>
        </div>
        <div className="field">
          <label htmlFor={`${id}-market`}>Market-based instrument</label>
          <select id={`${id}-market`} value={location.marketInstrument} onChange={(e) => onChange({ marketInstrument: e.target.value as MarketInstrumentId })}>
            {marketInstruments.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-heat`}>Fjernvarmefaktor</label>
          <select id={`${id}-heat`} value={location.heatingFactorId} onChange={(e) => onChange({ heatingFactorId: e.target.value as HeatingFactorId })}>
            {heatingFactors.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
          </select>
        </div>
        <HeatingShareField location={location} onChange={onChange} />
        <div className="field end">
          <button type="button" className="link" onClick={onDelete}>
            Slet lokation<span className="visually-hidden">: {location.name}</span>
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="muted">Ingen linjer i perioden for {location.name}.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">Linjer for {location.name}</caption>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Dato</th>
                <th scope="col">Beskrivelse</th>
                <th scope="col" className="num">kWh i perioden</th>
                <th scope="col" className="num">Location-based</th>
                <th scope="col" className="num">Market-based</th>
                <th scope="col"><span className="visually-hidden">Handlinger</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line.id}>
                  <td>{kindLabel[r.line.kind]}</td>
                  <td>
                    {formatDate(r.line.date)}
                    {r.line.dateTo && r.line.dateTo > r.line.date && <> – {formatDate(r.line.dateTo)}</>}
                  </td>
                  <td>{r.line.description}</td>
                  <td className="num">
                    {formatNumber(r.kWh, 0)}
                    {r.share < 1 && <span className="sub">{formatNumber(r.share * 100, 0)} % af linjen</span>}
                    {r.buildingShare < 1 && <span className="sub">{formatPercent(r.buildingShare)} af bygningen</span>}
                  </td>
                  <td className="num">
                    {r.locationParts.length > 1 && r.line.customFactor == null
                      ? <SplitFigure t={r.locationT} parts={r.locationParts} />
                      : <Figure t={r.locationT} value={r.locationValue} factor={r.locationFactor} custom={r.line.customFactor != null} />}
                  </td>
                  <td className="num">
                    {r.line.kind === 'heating'
                      ? <span className="muted">Som location-based</span>
                      : <Figure t={r.marketT} value={r.marketValue} factor={r.marketFactor} />}
                  </td>
                  <td>
                    <button type="button" className="link" onClick={() => onDeleteLine(r.line.id)} aria-label={`Slet linje: ${kindLabel[r.line.kind]}, ${formatDate(r.line.date)}`}>
                      Slet
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={3}>{location.name} i alt</th>
                <td className="num strong">{formatNumber(summary.electricityKWh + summary.heatingKWh, 0)}</td>
                <td className="num strong">{formatNumber(summary.locationTotal, 3)}</td>
                <td className="num strong">
                  {formatNumber(summary.marketTotal, 3)}
                  {summary.pendingMarket && <span className="sub warning-text">Ufuldstændig</span>}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      </div>
    </article>
  )
}

/** A line's tCO2e for one method, with the factor's value, name and source underneath. */
export function Figure({ t, value, factor, custom }: { t: number; value: number | null; factor: Factor | null; custom?: boolean }) {
  const label = factorLabel(factor)
  if (value === null) {
    return (
      <>
        <span className="pending">Faktor mangler</span>
        {label && <span className="sub">{label}</span>}
      </>
    )
  }
  return (
    <>
      <span className="strong">{formatNumber(t, 3)}</span>
      <span className="sub">{formatFactor(value)} kg/kWh</span>
      {label && <span className="sub">{label}</span>}
      <span className="sub">{custom ? 'Egen faktor' : factor?.source}</span>
    </>
  )
}

/** A bill spanning two grid-mix years: show each year's part, so the total can be checked. */
export function SplitFigure({ t, parts }: { t: number; parts: { factor: Factor | null; kWh: number }[] }) {
  const label = factorLabel(parts[0]?.factor)
  return (
    <>
      <span className="strong">{formatNumber(t, 3)}</span>
      {label && <span className="sub">{label}</span>}
      {parts.map((p, i) => (
        <span key={i} className="sub">
          {p.factor?.validFrom?.slice(0, 4) ?? p.factor?.name}: {formatNumber(p.kWh, 0)} kWh × {p.factor?.value == null ? '—' : formatFactor(p.factor.value)}
        </span>
      ))}
    </>
  )
}

function Consolidated({ summary, totals }: { summary: LocationSummary[]; totals: { electricityKWh: number; heatingKWh: number; locationTotal: number; marketTotal: number } }) {
  return (
    <section aria-labelledby="s2-consolidated">
      <h2 id="s2-consolidated">Konsolideret på tværs af lokationer</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Lokation</th>
              <th scope="col" className="num">El (kWh)</th>
              <th scope="col" className="num">Varme (kWh)</th>
              <th scope="col" className="num">Location-based</th>
              <th scope="col" className="num">Market-based</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((l) => (
              <tr key={l.location.id}>
                <th scope="row">{l.location.name}</th>
                <td className="num">{formatNumber(l.electricityKWh, 0)}</td>
                <td className="num">{formatNumber(l.heatingKWh, 0)}</td>
                <td className="num">{formatNumber(l.locationTotal, 3)}</td>
                <td className="num">{formatNumber(l.marketTotal, 3)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">I alt</th>
              <td className="num strong">{formatNumber(totals.electricityKWh, 0)}</td>
              <td className="num strong">{formatNumber(totals.heatingKWh, 0)}</td>
              <td className="num strong">{formatNumber(totals.locationTotal, 3)}</td>
              <td className="num strong">{formatNumber(totals.marketTotal, 3)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function AddLineForm({ locations, defaultDate, onAdd }: { locations: Location[]; defaultDate: string; onAdd: (line: Omit<Scope2Line, 'id'>) => void }) {
  const id = useId()
  const [locationId, setLocationId] = useState(locations[0].id)
  const [kind, setKind] = useState<Scope2Kind>('electricity')
  const [date, setDate] = useState(defaultDate)
  const [dateTo, setDateTo] = useState('')
  const [kWh, setKWh] = useState('')
  const [customFactor, setCustomFactor] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Keep a valid selection if the chosen location is deleted.
  const selected = locations.some((l) => l.id === locationId) ? locationId : locations[0].id

  function submit(e: FormEvent) {
    e.preventDefault()
    const q = parseNumber(kWh)
    const f = parseNumber(customFactor)
    const next: Record<string, string> = {}
    if (q === null) next.kWh = 'Angiv forbruget i kWh.'
    else if (Number.isNaN(q)) next.kWh = 'Forbruget er ikke et gyldigt tal. Brug fx 12.500.'
    if (f !== null && Number.isNaN(f)) next.customFactor = 'Faktoren er ikke et gyldigt tal.'
    if (!date) next.date = 'Angiv en dato.'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    onAdd({ locationId: selected, kind, date, dateTo: dateTo || null, kWh: q, customFactor: f, description: description.trim() })
    setKWh('')
    setCustomFactor('')
    setDescription('')
  }

  const describedBy = (field: string) => (errors[field] ? `${id}-${field}-err` : undefined)
  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Tilføj linje</h2>
      <form className="add-line" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={`${id}-loc`}>Lokation</label>
          <select id={`${id}-loc`} value={selected} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-kind`}>Type</label>
          <select id={`${id}-kind`} value={kind} onChange={(e) => setKind(e.target.value as Scope2Kind)}>
            <option value="electricity">El</option>
            <option value="heating">Fjernvarme</option>
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
          <label htmlFor={`${id}-kwh`}>Forbrug (kWh)</label>
          <input id={`${id}-kwh`} inputMode="decimal" autoComplete="off" value={kWh} onChange={(e) => setKWh(e.target.value)} aria-invalid={!!errors.kWh} aria-describedby={describedBy('kWh')} />
          {errors.kWh && <p id={`${id}-kWh-err`} className="error">{errors.kWh}</p>}
        </div>
        <div className="field">
          <label htmlFor={`${id}-factor`}>
            Egen faktor <span className="optional">(kg CO2e/kWh, valgfri{kind === 'electricity' ? ', kun location-based' : ''})</span>
          </label>
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

/**
 * Our share of the building's district heating, typed as a percent. Kept as text while typing so
 * "62," doesn't jump; only a number from 0 to 100 (or empty, meaning all of it) is saved.
 */
function HeatingShareField({ location, onChange }: { location: Location; onChange: (patch: Partial<Location>) => void }) {
  const id = useId()
  const saved = location.heatingSharePercent
  const [text, setText] = useState(saved == null ? '' : formatNumber(saved, Number.isInteger(saved) ? 0 : 2))
  const [error, setError] = useState<string | null>(null)
  const update = (value: string) => {
    setText(value)
    const pct = parseNumber(value)
    if (pct === null) {
      setError(null)
      onChange({ heatingSharePercent: null })
    } else if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
      setError(null)
      onChange({ heatingSharePercent: pct })
    } else {
      setError('Skriv en procent mellem 0 og 100.')
    }
  }
  return (
    <div className="field">
      <label htmlFor={`${id}-share`}>Andel af bygningens varme (%)</label>
      <input
        id={`${id}-share`}
        inputMode="decimal"
        value={text}
        placeholder="100"
        aria-invalid={error !== null}
        aria-describedby={`${id}-share-hint`}
        onChange={(e) => update(e.target.value)}
      />
      <p id={`${id}-share-hint`} className={error ? 'sub warning-text' : 'sub'} role={error ? 'alert' : undefined}>
        {error ?? 'Når varmemåleren også dækker lejere uden egen måler: vores m² ÷ bygningens m². Tom = 100 %.'}
      </p>
    </div>
  )
}

/** A fraction as a percent, with decimals only when it has them: 0.6 → "60 %", 0.625 → "62,50 %". */
const formatPercent = (fraction: number) => {
  const pct = Math.round(fraction * 10_000) / 100
  return `${formatNumber(pct, Number.isInteger(pct) ? 0 : 2)} %`
}
