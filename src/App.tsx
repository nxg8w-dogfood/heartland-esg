import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ledgerLinesFor } from './calc/accountTotals'
import type { ActivityLine } from './calc/activity'
import type { Survey } from './calc/commuting'
import type { Investment } from './calc/investments'
import type { Deflation, SpendLine } from './calc/spend'
import type { Period } from './calc/dates'
import type { Scope1Line } from './calc/scope1'
import type { Location, Scope2Line } from './calc/scope2'
import type { Category3Params } from './calc/scope3'
import { applyFactorSources, type FactorSources } from './calc/factorSources'
import { factorPublications } from './data/factorPublications'
import { factors as baseFactors } from './data/factors'
import { FactorsPage } from './factors/FactorsPage'
import { GroupPage } from './group/GroupPage'
import { LedgerPage } from './ledger/LedgerPage'
import type { LedgerState } from './ledger/state'
import { Scope1Page } from './scope1/Scope1Page'
import { Scope2Page } from './scope2/Scope2Page'
import { Scope3Page } from './scope3/Scope3Page'
import type { Relevance } from './scope3/relevance'
import { ACCOUNT_VERSION, type AccountData } from './storage/account'
import { DataBar, type SaveStatus } from './storage/DataBar'
import { emptyGroup, type GroupData } from './storage/group'
import { browserStore } from './storage/store'
import { PeriodPicker } from './ui'

const pages = [
  { id: 'koncern', label: 'Koncern' },
  { id: 'scope1', label: 'Scope 1' },
  { id: 'scope2', label: 'Scope 2' },
  { id: 'scope3', label: 'Scope 3' },
  { id: 'kontoplan', label: 'Kontoplan' },
  { id: 'faktorer', label: 'Faktorer' },
] as const
type PageId = (typeof pages)[number]['id']
type CompanyPageId = Exclude<PageId, 'koncern'>

const pageFromHash = (): PageId => {
  const id = window.location.hash.replace('#/', '')
  return pages.some((p) => p.id === id) ? (id as PageId) : 'scope1'
}

// TEMPORARY until Dataverse (docs/adr/0005): the group is kept in this browser.
const store = browserStore()

type Loaded = { group: GroupData; generation: number; message: string | null }

/** Loads the saved group, then shows it. Replacing the group restarts everything below. */
function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    let cancelled = false
    store.load().then((result) => {
      if (cancelled) return
      if (!result) setLoaded({ group: emptyGroup(), generation: 0, message: null })
      else if (result.ok) {
        setLoaded({
          group: result.group,
          generation: 0,
          message: [result.dropped ? `${result.dropped} gemte poster kunne ikke bruges og er udeladt.` : '', ...result.notes].filter(Boolean).join(' ') || null,
        })
      } else setLoaded({ group: emptyGroup(), generation: 0, message: result.error })
    })
    return () => { cancelled = true }
  }, [])

  if (!loaded) return <p role="status" className="loading">Indlæser klimaregnskabet …</p>

  return (
    <GroupApp
      key={loaded.generation}
      initial={loaded.group}
      initialMessage={loaded.message}
      onReplace={(group, message) => setLoaded((l) => ({ group, generation: (l?.generation ?? 0) + 1, message }))}
    />
  )
}

function GroupApp({ initial, initialMessage, onReplace }: { initial: GroupData; initialMessage: string | null; onReplace: (group: GroupData, message: string | null) => void }) {
  const [group, setGroup] = useState(initial)
  const [page, setPage] = useState<PageId>(pageFromHash)
  const companyId = useId()
  const active = group.companies.find((c) => c.id === group.activeCompanyId) ?? group.companies[0]
  const activeId = active.id

  // Autosave half a second after the last change. The group as loaded isn't saved again, so
  // unreadable saved data is only replaced once someone actually changes something.
  const [status, setStatus] = useState<SaveStatus>({ state: 'idle' })
  useEffect(() => {
    if (group === initial) return
    const timer = setTimeout(() => {
      setStatus({ state: 'pending' })
      store.save(group).then(
        () => setStatus({ state: 'saved', at: new Date() }),
        () => setStatus({ state: 'failed' }),
      )
    }, 500)
    return () => clearTimeout(timer)
  }, [group, initial])

  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
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
        <div className="brand">Heartland Klimaregnskab</div>
        <div className="company-picker">
          <label htmlFor={companyId}>Virksomhed</label>
          <select id={companyId} value={active.id} onChange={(e) => setGroup((g) => ({ ...g, activeCompanyId: e.target.value }))}>
            {group.companies.map((c) => <option key={c.id} value={c.id}>{c.name || 'Uden navn'}</option>)}
          </select>
        </div>
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
          group={group}
          onReplace={async (next, message) => {
            await store.save(next).catch(() => undefined)
            onReplace(next, message)
          }}
          onClear={async () => {
            await store.clear()
            onReplace(emptyGroup(), 'Alle data er ryddet.')
          }}
        />
        {page === 'koncern' ? (
          <GroupPage group={group} setGroup={setGroup} />
        ) : (
          <Workspace key={active.id} page={page} companyName={active.name} initial={active.account} onChange={onAccountChange} />
        )}
      </main>
    </>
  )
}

/** One company's pages. Reports every change to its account upwards. */
function Workspace({ page, companyName, initial, onChange }: { page: CompanyPageId; companyName: string; initial: AccountData; onChange: (account: AccountData) => void }) {
  const [period, setPeriod] = useState<Period>(initial.period)
  const [scope1Lines, setScope1Lines] = useState<Scope1Line[]>(initial.scope1Lines)
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
  const ledgerLines = useMemo(() => ledgerLinesFor(ledger), [ledger])

  const factors = useMemo(() => applyFactorSources(baseFactors, factorSources, factorPublications), [factorSources])

  const account: AccountData = useMemo(() => ({
    version: ACCOUNT_VERSION, period, scope1Lines, locations, scope2Lines, factorSources, relevance, category3Params,
    cat1Lines, cat4Lines, cat4SpendLines, cat5Lines, cat6Lines, surveys, investments, deflation, ledger,
  }), [period, scope1Lines, locations, scope2Lines, factorSources, relevance, category3Params, cat1Lines, cat4Lines, cat4SpendLines, cat5Lines, cat6Lines, surveys, investments, deflation, ledger])

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
      <p className="company-context">Viser <strong>{companyName || 'Uden navn'}</strong></p>
      {page !== 'faktorer' && page !== 'kontoplan' && <PeriodPicker period={period} onChange={setPeriod} />}
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
      {page === 'scope3' && (
        <Scope3Page
          period={period}
          factors={factors}
          scope1Lines={scope1Lines}
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
          ledgerLines={ledgerLines}
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
