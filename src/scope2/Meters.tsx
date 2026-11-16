import { useId, type Dispatch, type SetStateAction } from 'react'
import type { Location } from '../calc/scope2'
import { municipality } from '../data/municipalities'
import { newLocationsFor } from '../utility/newLocations'
import { serviceLabel, type Meter } from '../utility/meters'
import { defaultLocation } from './defaultLocation'

type Props = {
  meters: Meter[]
  setMeters: Dispatch<SetStateAction<Meter[]>>
  locations: Location[]
  setLocations: Dispatch<SetStateAction<Location[]>>
}

/** The location choice that creates a new location from the meter's address */
const NEW = 'new'

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' }) : 'Endnu ikke'

/**
 * The meters the nightly sync found with the company's tokens (ADR 0021). A meter's months are
 * imported once it has a location, so picking one is what starts the stream.
 */
export function Meters({ meters, setMeters, locations, setLocations }: Props) {
  const id = useId()
  const waiting = meters.filter((m) => !m.locationId).length

  function choose(meter: Meter, value: string) {
    if (value === NEW) {
      const created = newLocationsFor([{ key: meter.id, address: meter.address, municipalityCode: meter.municipalityCode }], defaultLocation)
      setLocations((ls) => [...ls, ...created.locations])
      setMeters((ms) => ms.map((m) => (m.id === meter.id ? { ...m, locationId: created.byMeter[meter.id] } : m)))
      return
    }
    setMeters((ms) => ms.map((m) => (m.id === meter.id ? { ...m, locationId: value || null } : m)))
  }

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Målere, der hentes hver nat</h2>
      <div className="card">
        {meters.length === 0 ? (
          <p className="muted">
            Ingen målere endnu. Når virksomhedens token til Eloverblik eller Varmeoverblik er lagt i Key Vault, finder
            synkroniseringen målerne i løbet af natten. Indtil da kan du hente forbrug med et token herunder.
          </p>
        ) : (
          <>
            <p className="muted">
              Hver nat hentes de seneste 13 afsluttede måneder, og nye måneder bliver til linjer på målerens lokation.
              {waiting ? ` ${waiting === 1 ? 'Én måler' : `${waiting} målere`} mangler en lokation og importeres ikke endnu.` : ''}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Type</th>
                    <th scope="col">Måler</th>
                    <th scope="col">Kommune</th>
                    <th scope="col">Lokation</th>
                    <th scope="col">Sidst hentet</th>
                  </tr>
                </thead>
                <tbody>
                  {meters.map((m) => {
                    const place = municipality(m.municipalityCode)
                    return (
                      <tr key={m.id}>
                        <td>{serviceLabel[m.service]}</td>
                        <td>
                          {m.address}
                          <br />
                          <span className="muted">{m.meterId}</span>
                        </td>
                        <td>{place ? `${place.name} (${place.priceArea})` : <span className="muted">Ukendt</span>}</td>
                        <td>
                          <select
                            aria-label={`Lokation for ${m.address} (${m.meterId})`}
                            value={m.locationId ?? ''}
                            onChange={(e) => choose(m, e.target.value)}
                          >
                            <option value="">Ikke valgt – importeres ikke</option>
                            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                            <option value={NEW}>Opret ny lokation: {m.address}</option>
                          </select>
                        </td>
                        <td>
                          {when(m.lastFetched)}
                          {m.error && <><br /><span className="error">{m.error}</span></>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
