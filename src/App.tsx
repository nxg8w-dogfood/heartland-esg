import { useEffect, useMemo, useRef, useState } from 'react'
import { Logotype } from './brand/Logotype'
import type { ActivityLine } from './calc/activity'
import type { Survey } from './calc/commuting'
import type { Investment } from './calc/investments'
import type { Deflation, SpendLine } from './calc/spend'
import type { Period } from './calc/dates'
import type { Scope1Line } from './calc/scope1'
import type { Location, Scope2Line } from './calc/scope2'
import type { Category3Params } from './calc/scope3'
import { resolveScope1Lines, type Vehicle } from './calc/vehicles'
import { applyFactorSources, type FactorSources } from './calc/factorSources'
import { factorPublications } from './data/factorPublications'
import { factors as baseFactors } from './data/factors'
import { FactorsPage } from './factors/FactorsPage'
import { GroupPage } from './group/GroupPage'
import { LedgerPage } from './ledger/LedgerPage'
import type { LedgerState } from './ledger/state'
import { Scope1Header } from './scope1/Scope1Header'
import { Scope1Page } from './scope1/Scope1Page'
import { scope1SubpageFromHash, type Scope1SubpageId } from './scope1/subpages'
import { Scope2Page } from './scope2/Scope2Page'
import { Scope3Page } from './scope3/Scope3Page'
import type { Relevance } from './scope3/relevance'
import { scope3SubpageFromHash, type Scope3SubpageId } from './scope3/subpages'
import { ACCOUNT_VERSION, type AccountData } from './storage/account'
import { DataBar, type SaveStatus } from './storage/DataBar'
import { activeCompany, emptyGroup, selectedPeriod, withActiveCompany, type GroupData } from './storage/group'
import { chooseStore } from './storage/choose'
import type { GroupStore } from './storage/store'
import { movedHash, pageFromHash, pages, type CompanyPageId } from './pages'
import { ContextSwitcher } from './ui'
import { exampleLookup } from './vehicles/exampleLookup'
import { connectorLookup } from './vehicles/connectorLookup'
import { MotorAPIService } from './generated'
import { VehiclesPage } from './vehicles/VehiclesPage'

// Plate lookups go through the MotorAPI connector inside Power Apps (ADR 0009), which adds the
// key on the server. `npm run dev` in a plain browser has no connector, so it gets example answers.
const plateLookup = import.meta.env.DEV && window.self === window.top ? exampleLookup : connectorLookup(MotorAPIService)

/** The address in the browser, after replacing an old one (such as `#/bilpark`) with where it moved. */
function currentHash() {
  const moved = movedHash(window.location.hash)
  // Replaced, not added, so Back doesn't return to the old address and bounce forward again.
  if (moved) window.history.replaceState(null, '', moved)
  return window.location.hash
}

type Loaded = { store: GroupStore; group: GroupData; generation: number; message: string | null }

/** Loads the saved group, then shows it. Replacing the group restarts everything below. */
function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  // Shared data that can't be reached or read: nothing is shown to edit, since nothing could be
  // saved where it belongs (and the browser must never stand in for Dataverse).
  const [fatal, setFatal] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // Dataverse inside Power Apps, the browser draft otherwise (docs/adr/0005).
    chooseStore().then(async (store) => {
      let result
      try {
        result = await store.load()
      } catch (e) {
        const error = `Klimaregnskabet kunne ikke indlæses fra ${store.label}: ${e instanceof Error ? e.message : String(e)}`
        if (store.central) { if (!cancelled) setFatal(error); return }
        result = { ok: false as const, error }
      }
      if (cancelled) return
      if (!result) setLoaded({ store, group: emptyGroup(), generation: 0, message: null })
      else if (result.ok && result.group.companies.length === 0) {
        // Nothing stored yet, or nothing this user may read.
        setLoaded({ store, group: emptyGroup(), generation: 0, message: `Der er ingen virksomheder i ${store.label}, som du har adgang til. Opret den første under Koncern; det kræver rollen Koncern – Ansvarlig.` })
      } else if (result.ok) {
        setLoaded({
          store,
          group: result.group,
          generation: 0,
          message: [result.dropped ? `${result.dropped} gemte poster kunne ikke bruges og er udeladt.` : '', ...result.notes].filter(Boolean).join(' ') || null,
        })
      } else if (store.central) setFatal(result.error)
      else setLoaded({ store, group: emptyGroup(), generation: 0, message: result.error })
    }, (e: unknown) => { if (!cancelled) setFatal(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [])

  if (fatal) {
    return (
      <main className="fatal">
        <h1>Heartland Klimaregnskab</h1>
        <p role="alert" className="error">{fatal}</p>
        <button type="button" onClick={() => window.location.reload()}>Genindlæs</button>
      </main>
    )
  }
  if (!loaded) return <p role="status" className="loading">Indlæser klimaregnskabet …</p>

  return (
    <GroupApp
      key={loaded.generation}
      store={loaded.store}
      initial={loaded.group}
      initialMessage={loaded.message}
      onReplace={(group, message) => setLoaded((l) => (l ? { ...l, group, generation: l.generation + 1, message } : l))}
    />
  )
}

function GroupApp({ store, initial, initialMessage, onReplace }: { store: GroupStore; initial: GroupData; initialMessage: string | null; onReplace: (group: GroupData, message: string | null) => void }) {
  const [group, setGroup] = useState(initial)
  const [hash, setHash] = useState(currentHash)
  const page = pageFromHash(hash)
  const active = activeCompany(group)
  const activeId = active.id
  const period = selectedPeriod(group)
  // A new object only when the dates change, so the pages' calculations don't rerun needlessly.
  const range = useMemo(() => ({ start: period.start, end: period.end }), [period.start, period.end])

  // Autosave half a second after the last change. The group as loaded isn't saved again, so
  // unreadable saved data is only replaced once someone actually changes something.
  // The store runs one save at a time; only the latest save's outcome is shown, and a long
  // save's progress about once a second.
  const [status, setStatus] = useState<SaveStatus>({ state: 'idle' })
  const saveSeq = useRef(0)
  useEffect(() => {
    if (group === initial) return
    const timer = setTimeout(() => {
      const seq = ++saveSeq.current
      const isLatest = () => seq === saveSeq.current
      let shown = 0
      setStatus({ state: 'pending' })
      store.save(group, (done, total) => {
        const now = Date.now()
        if (!isLatest() || (done < total && now - shown < 1000)) return
        shown = now
        setStatus({ state: 'pending', done, total })
      }).then(
        () => { if (isLatest()) setStatus({ state: 'saved', at: new Date() }) },
        (e: unknown) => { if (isLatest()) setStatus({ state: 'failed', reason: e instanceof Error ? e.message : undefined }) },
      )
    }, 500)
    return () => clearTimeout(timer)
  }, [group, initial, store])

  useEffect(() => {
    const onHash = () => setHash(currentHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const onAccountChange = useMemo(
    () => (account: AccountData) => setGroup((g) => ({ ...g, companies: g.companies.map((c) => (c.id === activeId ? { ...c, account } : c)) })),
    [activeId],
  )

  const current = pages.find((p) => p.id === page)!

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <Logotype title="Heartland" />
          <span className="brand-name">Klimaregnskab</span>
          {store.central && <span className="connection">Forbundet til {store.label}</span>}
        </div>
        <ContextSwitcher
          companies={group.companies}
          companyId={active.id}
          onCompany={(id) => setGroup((g) => withActiveCompany(g, id))}
          periods={active.account.periods}
          periodId={period.id}
          onPeriod={(activePeriodId) => setGroup((g) => ({ ...g, activePeriodId }))}
        />
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
      <main aria-label={page === 'koncern' ? current.label : `${current.label}, ${active.name}`}>
        <DataBar
          storeLabel={store.label}
          central={store.central}
          status={status}
          message={initialMessage}
          onClear={store.clear && (async () => {
            await store.clear?.()
            onReplace(emptyGroup(), 'Alle data er ryddet.')
          })}
        />
        {page === 'koncern' ? (
          <GroupPage group={group} setGroup={setGroup} period={period} />
        ) : (
          <Workspace key={active.id} page={page} period={range} scope1Subpage={scope1SubpageFromHash(hash)} scope3Subpage={scope3SubpageFromHash(hash)} initial={active.account} onChange={onAccountChange} />
        )}
      </main>
    </>
  )
}

/** One company's pages. Reports every change to its account upwards. */
function Workspace({ page, period, scope1Subpage, scope3Subpage, initial, onChange }: { page: CompanyPageId; period: Period; scope1Subpage: Scope1SubpageId; scope3Subpage: Scope3SubpageId; initial: AccountData; onChange: (account: AccountData) => void }) {
  // Periods are edited on the Koncern page, which this isn't shown with, so they pass through.
  const [periods] = useState(initial.periods)
  const [scope1Lines, setScope1Lines] = useState<Scope1Line[]>(initial.scope1Lines)
  const [vehicles, setVehicles] = useState<Vehicle[]>(initial.vehicles)
  // Scope 3 category 3 needs litres, also for the lines entered in km.
  const scope1Litres = useMemo(() => resolveScope1Lines(scope1Lines, vehicles), [scope1Lines, vehicles])
  const [locations, setLocations] = useState<Location[]>(initial.locations)
  const [scope2Lines, setScope2Lines] = useState<Scope2Line[]>(initial.scope2Lines)
  // Where each factor's value comes from: built-in, a publication, an API or entered by hand.
  const [factorSources, setFactorSources] = useState<FactorSources>(initial.factorSources)
  const [relevance, setRelevance] = useState<Relevance>(initial.relevance)
  const [category3Params, setCategory3Params] = useState<Category3Params>(initial.category3Params)
  const [cat4Lines, setCat4Lines] = useState<ActivityLine[]>(initial.cat4Lines)
  const [cat4SpendLines, setCat4SpendLines] = useState<SpendLine[]>(initial.cat4SpendLines)
  const [cat5Lines, setCat5Lines] = useState<ActivityLine[]>(initial.cat5Lines)
  const [cat6Lines, setCat6Lines] = useState<ActivityLine[]>(initial.cat6Lines)
  const [surveys, setSurveys] = useState<Survey[]>(initial.surveys)
  const [investments, setInvestments] = useState<Investment[]>(initial.investments)
  const [cat1Lines, setCat1Lines] = useState<SpendLine[]>(initial.cat1Lines)
  const [deflation, setDeflation] = useState<Deflation>(initial.deflation)
  const [ledger, setLedger] = useState<LedgerState>(initial.ledger)

  const factors = useMemo(() => applyFactorSources(baseFactors, factorSources, factorPublications), [factorSources])

  const account: AccountData = useMemo(() => ({
    version: ACCOUNT_VERSION, periods, vehicles, scope1Lines, locations, scope2Lines, factorSources, relevance, category3Params,
    cat1Lines, cat4Lines, cat4SpendLines, cat5Lines, cat6Lines, surveys, investments, deflation, ledger,
  }), [periods, vehicles, scope1Lines, locations, scope2Lines, factorSources, relevance, category3Params, cat1Lines, cat4Lines, cat4SpendLines, cat5Lines, cat6Lines, surveys, investments, deflation, ledger])

  // Each part keeps its reference until changed, so comparing parts with what was last reported
  // is exact and cheap, and it holds even when React runs the effect twice in development.
  const reported = useRef(initial)
  useEffect(() => {
    const unchanged = (Object.keys(account) as (keyof AccountData)[]).every((k) => account[k] === reported.current[k])
    if (unchanged) return
    reported.current = account
    onChange(account)
  }, [account, onChange])

  return (
    <>
      {page === 'scope1' && (
        <>
          <Scope1Header subpage={scope1Subpage} />
          {scope1Subpage === 'udledninger' && <Scope1Page period={period} factors={factors} lines={scope1Lines} setLines={setScope1Lines} vehicles={vehicles} />}
          {scope1Subpage === 'bilpark' && <VehiclesPage vehicles={vehicles} setVehicles={setVehicles} scope1Lines={scope1Lines} lookup={plateLookup} />}
        </>
      )}
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
      {page === 'scope3' && (
        <Scope3Page
          subpage={scope3Subpage}
          period={period}
          factors={factors}
          scope1Lines={scope1Litres}
          locations={locations}
          scope2Lines={scope2Lines}
          relevance={relevance}
          setRelevance={setRelevance}
          params={category3Params}
          setParams={setCategory3Params}
          cat4Lines={cat4Lines}
          setCat4Lines={setCat4Lines}
          cat4SpendLines={cat4SpendLines}
          setCat4SpendLines={setCat4SpendLines}
          cat5Lines={cat5Lines}
          setCat5Lines={setCat5Lines}
          cat6Lines={cat6Lines}
          setCat6Lines={setCat6Lines}
          surveys={surveys}
          setSurveys={setSurveys}
          investments={investments}
          setInvestments={setInvestments}
          cat1Lines={cat1Lines}
          setCat1Lines={setCat1Lines}
          deflation={deflation}
          setDeflation={setDeflation}
          ledger={ledger}
          setLedger={setLedger}
        />
      )}
      {page === 'kontoplan' && <LedgerPage ledger={ledger} setLedger={setLedger} factors={factors} />}
      {page === 'faktorer' && (
        <FactorsPage
          base={baseFactors}
          factors={factors}
          publications={factorPublications}
          sources={factorSources}
          onChoose={(id, choice) =>
            setFactorSources((s) => {
              const next = { ...s }
              if (choice.kind === 'builtin') delete next[id]
              else next[id] = choice
              return next
            })
          }
        />
      )}
    </>
  )
}

export default App
