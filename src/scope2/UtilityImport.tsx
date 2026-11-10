import { useId, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { Period } from '../calc/dates'
import type { Location, Scope2Kind, Scope2Line } from '../calc/scope2'
import { municipality } from '../data/municipalities'
import { formatNumber } from '../format'
import { newId } from '../newId'
import { fetchElectricity } from '../utility/eloverblik'
import { completedMonths, monthLabel } from '../utility/months'
import { matchingLocation, newLocationsFor, shareMunicipalities } from '../utility/newLocations'
import { planImport, type MonthlyFigure } from '../utility/toLines'
import { fetchHeating } from '../utility/varmeoverblik'
import { defaultLocation } from './defaultLocation'

type Props = {
  period: Period
  locations: Location[]
  setLocations: Dispatch<SetStateAction<Location[]>>
  lines: Scope2Line[]
  setLines: Dispatch<SetStateAction<Scope2Line[]>>
}

type FetchedMeter = {
  key: string
  kind: Scope2Kind
  source: string
  label: string
  address: string
  municipalityCode: string | null
  months: MonthlyFigure[]
  error: string | null
}

const kindLabel: Record<Scope2Kind, string> = { electricity: 'El', heating: 'Fjernvarme' }
/** The location choice that creates a new location from the meter's address */
const NEW = 'new'

/**
 * Fetches monthly consumption from Eloverblik and Varmeoverblik straight from the app
 * (ADR 0011). The refresh tokens live in this component's state only: never saved, and
 * gone when the page is left.
 */
export function UtilityImport({ period, locations, setLocations, lines, setLines }: Props) {
  const id = useId()
  const [elToken, setElToken] = useState('')
  const [heatToken, setHeatToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [meters, setMeters] = useState<FetchedMeter[]>([])
  const [withoutData, setWithoutData] = useState<string[]>([])
  const [assigned, setAssigned] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('')

  // The clock is read once per mount; a month that ends while the page is open shows after a reload.
  const [now] = useState(() => Date.now())
  const months = completedMonths(period, now)

  async function fetchAll(e: FormEvent) {
    e.preventDefault()
    if (!elToken.trim() && !heatToken.trim()) {
      setErrors(['Indsæt mindst ét token.'])
      return
    }
    setBusy(true)
    setErrors([])
    setStatus('Henter …')
    setMeters([])
    setWithoutData([])
    const found: FetchedMeter[] = []
    const problems: string[] = []
    const doFetch: typeof fetch = (input, init) => fetch(input, init)
    if (elToken.trim()) {
      try {
        for (const m of await fetchElectricity(doFetch, elToken.trim(), months)) {
          found.push({
            key: `el:${m.meteringPointId}`,
            kind: 'electricity',
            source: `Eloverblik · ${m.meteringPointId} · ${m.address}`,
            label: `${m.address} (målepunkt ${m.meteringPointId})`,
            address: m.address,
            municipalityCode: m.municipalityCode,
            months: m.months,
            error: m.error,
          })
        }
      } catch (err) {
        problems.push(err instanceof Error ? err.message : String(err))
      }
    }
    if (heatToken.trim()) {
      try {
        const heating = await fetchHeating(doFetch, heatToken.trim(), months)
        for (const m of heating.meters) {
          found.push({
            key: `heat:${m.installationPointId}`,
            kind: 'heating',
            source: `Varmeoverblik · ${m.utility} · ${m.address}`,
            label: `${m.address} (${m.utility})`,
            address: m.address,
            municipalityCode: null,
            months: m.months,
            error: null,
          })
        }
        setWithoutData(heating.withoutData)
      } catch (err) {
        problems.push(err instanceof Error ? err.message : String(err))
      }
    }
    // Heating meters borrow the municipality of an electricity meter at the same address.
    const withMunicipality = shareMunicipalities(found)
    setMeters(withMunicipality)
    // A meter whose address is already a location's name goes there by default.
    setAssigned(Object.fromEntries(withMunicipality.flatMap((m) => {
      const match = matchingLocation(locations, m.address)
      return match ? [[m.key, match.id]] : []
    })))
    setErrors(problems)
    setBusy(false)
    // Keep the tokens in memory no longer than the fetch needs them.
    setElToken('')
    setHeatToken('')
    setStatus(found.length ? `Fandt ${found.length} ${found.length === 1 ? 'måler' : 'målere'}. Vælg en lokation for hver, og importér.` : problems.length ? '' : 'Ingen målere fundet.')
  }

  function importLines() {
    let added = 0
    let duplicates = 0
    const skipped: string[] = []
    const overlaps: string[] = []
    const next: Scope2Line[] = []
    const created = newLocationsFor(meters.filter((m) => assigned[m.key] === NEW), defaultLocation)
    const target = { ...assigned, ...created.byMeter }
    for (const m of meters) {
      const locationId = target[m.key]
      if (!locationId) continue
      const plan = planImport([...lines, ...next], locationId, m.kind, m.source, m.months)
      next.push(...plan.lines.map((l) => ({ ...l, id: newId() })))
      added += plan.lines.length
      duplicates += plan.duplicates
      if (plan.overlaps.length) overlaps.push(`${m.label} (${plan.overlaps.length === 1 ? plan.overlaps[0] : `${plan.overlaps.length} måneder`})`)
      skipped.push(...plan.skipped.map((s) => `${m.label}, ${s.month}: ${s.reason}`))
    }
    if (created.locations.length) setLocations((ls) => [...ls, ...created.locations])
    setLines((ls) => [...ls, ...next])
    // The new locations are now ordinary choices; a second import goes to them, not to new copies.
    setAssigned(target)
    const unknownMunicipality = created.locations.filter((l) => !l.municipalityCode).map((l) => l.name)
    setStatus(
      [
        created.locations.length ? `${created.locations.length} ${created.locations.length === 1 ? 'lokation' : 'lokationer'} oprettet.` : '',
        `${added} ${added === 1 ? 'linje' : 'linjer'} tilføjet.`,
        duplicates ? `${duplicates} fandtes allerede og blev sprunget over.` : '',
        overlaps.length ? `Tjek for dobbelttælling: andre linjer på samme lokation dækker også ${overlaps.join('; ')}.` : '',
        skipped.length ? `Ikke importeret: ${skipped.join('; ')}. Indtast dem i hånden.` : '',
        unknownMunicipality.length ? `Vælg kommune for ${unknownMunicipality.join(', ')}: indtil da bruges landsgennemsnittet for el.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    )
  }

  const anyAssigned = meters.some((m) => assigned[m.key])

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Hent forbrug fra Eloverblik og Varmeoverblik</h2>
      <div className="card">
        <p className="muted">
          Henter månedligt forbrug for afsluttede måneder i perioden
          {months.length ? ` (${monthLabel(months[0].key)} – ${monthLabel(months[months.length - 1].key)})` : ''}. Tokens
          gemmes ikke: de bruges kun til denne hentning og ryddes bagefter. Opret dem på
          eloverblik.dk og varmeoverblik.dk under datadeling.
        </p>
        {months.length === 0 ? (
          <p className="muted">Perioden har ingen afsluttede måneder endnu.</p>
        ) : (
          <form className="add-line" onSubmit={fetchAll} noValidate>
            <div className="field">
              <label htmlFor={`${id}-el`}>Eloverblik-token <span className="optional">(el)</span></label>
              <input id={`${id}-el`} type="password" autoComplete="off" spellCheck={false} value={elToken} onChange={(e) => setElToken(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-heat`}>Varmeoverblik-token <span className="optional">(fjernvarme)</span></label>
              <input id={`${id}-heat`} type="password" autoComplete="off" spellCheck={false} value={heatToken} onChange={(e) => setHeatToken(e.target.value)} />
            </div>
            <div className="actions">
              <button type="submit" disabled={busy}>{busy ? 'Henter …' : 'Hent forbrug'}</button>
            </div>
          </form>
        )}

        <p role="status" aria-live="polite">{status}</p>
        {errors.map((message) => (
          <p key={message} className="warning">{message}</p>
        ))}
        {withoutData.length > 0 && (
          <p className="muted">
            Ingen data fra {[...new Set(withoutData)].join(', ')} endnu. Forsyningen har måske ikke koblet sine målere
            på Varmeoverblik; spørg forsyningen.
          </p>
        )}

        {meters.length > 0 && (
          <>
            <div className="table-wrap">
              <table>
                <caption className="visually-hidden">Fundne målere</caption>
                <thead>
                  <tr>
                    <th scope="col">Type</th>
                    <th scope="col">Måler</th>
                    <th scope="col">Kommune</th>
                    <th scope="col" className="num">kWh i alt</th>
                    <th scope="col">Bemærkninger</th>
                    <th scope="col">Lokation</th>
                  </tr>
                </thead>
                <tbody>
                  {meters.map((m) => {
                    const total = m.months.reduce((t, x) => t + (x.kWh ?? 0), 0)
                    const notes = [
                      m.error,
                      m.months.some((x) => x.missing) && `${m.months.filter((x) => x.missing).length} måned(er) mangler`,
                      m.months.some((x) => x.estimated) && 'nogle måneder er anslået',
                      m.months.some((x) => x.negative) && 'måleren gik baglæns i en måned',
                    ].filter(Boolean)
                    const place = municipality(m.municipalityCode)
                    return (
                      <tr key={m.key}>
                        <td>{kindLabel[m.kind]}</td>
                        <td>{m.label}</td>
                        <td>{place ? `${place.name} (${place.priceArea})` : <span className="muted">Ukendt</span>}</td>
                        <td className="num">{formatNumber(total, 0)}</td>
                        <td>{notes.join('; ')}</td>
                        <td>
                          <label className="visually-hidden" htmlFor={`${id}-${m.key}`}>Lokation for {m.label}</label>
                          <select id={`${id}-${m.key}`} value={assigned[m.key] ?? ''} onChange={(e) => setAssigned((a) => ({ ...a, [m.key]: e.target.value }))}>
                            <option value="">Spring over</option>
                            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                            <option value={NEW}>Opret ny lokation: {m.address}</option>
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={importLines} disabled={!anyAssigned}>Importér som linjer</button>
          </>
        )}
      </div>
    </section>
  )
}
