import { useEffect, useMemo, useState } from 'react'
import type { Period } from './calc/dates'
import type { Scope1Line } from './calc/scope1'
import type { Location, Scope2Line } from './calc/scope2'
import { factors as baseFactors } from './data/factors'
import { FactorsPage } from './factors/FactorsPage'
import { Scope1Page } from './scope1/Scope1Page'
import { Scope2Page } from './scope2/Scope2Page'
import { defaultLocation } from './scope2/defaultLocation'
import { PeriodPicker } from './ui'

const pages = [
  { id: 'scope1', label: 'Scope 1' },
  { id: 'scope2', label: 'Scope 2' },
  { id: 'faktorer', label: 'Faktorer' },
] as const
type PageId = (typeof pages)[number]['id']

const pageFromHash = (): PageId => {
  const id = window.location.hash.replace('#/', '')
  return pages.some((p) => p.id === id) ? (id as PageId) : 'scope1'
}

function App() {
  const [page, setPage] = useState<PageId>(pageFromHash)
  const [period, setPeriod] = useState<Period>({ start: '2025-01-01', end: '2025-12-31' })
  const [scope1Lines, setScope1Lines] = useState<Scope1Line[]>([])
  const [locations, setLocations] = useState<Location[]>(() => [defaultLocation()])
  const [scope2Lines, setScope2Lines] = useState<Scope2Line[]>([])
  // Values entered for factors that ship without one (e.g. Energinet's residual mix).
  const [entered, setEntered] = useState<Record<string, number>>({})

  const factors = useMemo(
    () => baseFactors.map((f) => (f.value === null && f.id in entered ? { ...f, value: entered[f.id] } : f)),
    [entered],
  )

  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const current = pages.find((p) => p.id === page)!

  return (
    <>
      <header className="app-header">
        <div className="brand">Heartland Klimaregnskab</div>
        <nav aria-label="Sider">
          <ul>
            {pages.map((p) => (
              <li key={p.id}>
                <a href={`#/${p.id}`} aria-current={p.id === page ? 'page' : undefined}>{p.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main aria-label={current.label}>
        <p className="notice" role="note">
          Data gemmes ikke endnu og forsvinder, når siden lukkes. Lagring i Dataverse kommer senere.
        </p>
        {page !== 'faktorer' && <PeriodPicker period={period} onChange={setPeriod} />}
        {page === 'scope1' && <Scope1Page period={period} factors={factors} lines={scope1Lines} setLines={setScope1Lines} />}
        {page === 'scope2' && (
          <Scope2Page
            period={period}
            factors={factors}
            locations={locations}
            setLocations={setLocations}
            lines={scope2Lines}
            setLines={setScope2Lines}
          />
        )}
        {page === 'faktorer' && (
          <FactorsPage
            base={baseFactors}
            entered={entered}
            onEnter={(id, value) =>
              setEntered((e) => {
                const next = { ...e }
                if (value === null) delete next[id]
                else next[id] = value
                return next
              })
            }
          />
        )}
      </main>
    </>
  )
}

export default App
