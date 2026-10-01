import { useEffect, useMemo, useState } from 'react'
import type { ActivityLine } from './calc/activity'
import type { Survey } from './calc/commuting'
import type { Investment } from './calc/investments'
import { classify, ledgerSpendLines } from './calc/ledger'
import type { Deflation, SpendLine } from './calc/spend'
import type { Period } from './calc/dates'
import type { Scope1Line } from './calc/scope1'
import type { Location, Scope2Line } from './calc/scope2'
import type { Category3Params } from './calc/scope3'
import { applyFactorSources, type FactorSources } from './calc/factorSources'
import { factorPublications } from './data/factorPublications'
import { factors as baseFactors } from './data/factors'
import { FactorsPage } from './factors/FactorsPage'
import { LedgerPage } from './ledger/LedgerPage'
import type { LedgerState } from './ledger/state'
import { Scope1Page } from './scope1/Scope1Page'
import { Scope2Page } from './scope2/Scope2Page'
import { Scope3Page } from './scope3/Scope3Page'
import type { Relevance } from './scope3/relevance'
import { ACCOUNT_VERSION, emptyAccount, type AccountData } from './storage/account'
import { DataBar, type SaveStatus } from './storage/DataBar'
import { browserStore } from './storage/store'
import { PeriodPicker } from './ui'

const pages = [
  { id: 'scope1', label: 'Scope 1' },
  { id: 'scope2', label: 'Scope 2' },
  { id: 'scope3', label: 'Scope 3' },
  { id: 'kontoplan', label: 'Kontoplan' },
  { id: 'faktorer', label: 'Faktorer' },
] as const
type PageId = (typeof pages)[number]['id']

const pageFromHash = (): PageId => {
  const id = window.location.hash.replace('#/', '')
  return pages.some((p) => p.id === id) ? (id as PageId) : 'scope1'
}

// TEMPORARY until Dataverse (docs/adr/0005): the account is kept in this browser.
const store = browserStore()

type Loaded = { account: AccountData; generation: number; message: string | null }

/** Loads the saved account, then shows the workspace. Replacing the account restarts the workspace. */
function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    let cancelled = false
    store.load().then((result) => {
      if (cancelled) return
      if (!result) setLoaded({ account: emptyAccount(), generation: 0, message: null })
      else if (result.ok) {
        setLoaded({
          account: result.account,
          generation: 0,
          message: [result.dropped ? `${result.dropped} gemte poster kunne ikke bruges og er udeladt.` : '', ...result.notes].filter(Boolean).join(' ') || null,
        })
      } else setLoaded({ account: emptyAccount(), generation: 0, message: result.error })
    })
    return () => { cancelled = true }
  }, [])

  if (!loaded) return <p role="status" className="loading">Indlæser klimaregnskabet …</p>

  return (
    <Workspace
      key={loaded.generation}
      initial={loaded.account}
      initialMessage={loaded.message}
      onReplace={(account, message) => setLoaded((l) => ({ account, generation: (l?.generation ?? 0) + 1, message }))}
    />
  )
}

function Workspace({ initial, initialMessage, onReplace }: { initial: AccountData; initialMessage: string | null; onReplace: (account: AccountData, message: string | null) => void }) {
  const [page, setPage] = useState<PageId>(pageFromHash)
  const [period, setPeriod] = useState<Period>(initial.period)
  const [scope1Lines, setScope1Lines] = useState<Scope1Line[]>(initial.scope1Lines)
  const [locations, setLocations] = useState<Location[]>(initial.locations)
  const [scope2Lines, setScope2Lines] = useState<Scope2Line[]>(initial.scope2Lines)
  // Where each factor's value comes from: built-in, a publication, an API or entered by hand.
  const [factorSources, setFactorSources] = useState<FactorSources>(initial.factorSources)
  const [relevance, setRelevance] = useState<Relevance>(initial.relevance)
  const [category3Params, setCategory3Params] = useState<Category3Params>(initial.category3Params)
  const [cat5Lines, setCat5Lines] = useState<ActivityLine[]>(initial.cat5Lines)
  const [cat6Lines, setCat6Lines] = useState<ActivityLine[]>(initial.cat6Lines)
  const [surveys, setSurveys] = useState<Survey[]>(initial.surveys)
  const [investments, setInvestments] = useState<Investment[]>(initial.investments)
  const [cat1Lines, setCat1Lines] = useState<SpendLine[]>(initial.cat1Lines)
  const [deflation, setDeflation] = useState<Deflation>(initial.deflation)
  const [ledger, setLedger] = useState<LedgerState>(initial.ledger)
  const ledgerLines = useMemo(() => {
    const manual = new Map(Object.entries(ledger.manual))
    return ledgerSpendLines(ledger.postings.map((p) => classify(p, ledger.rules, manual)), 1)
  }, [ledger])

  const factors = useMemo(() => applyFactorSources(baseFactors, factorSources, factorPublications), [factorSources])

  const account: AccountData = useMemo(() => ({
    version: ACCOUNT_VERSION, period, scope1Lines, locations, scope2Lines, factorSources, relevance, category3Params,
    cat1Lines, cat5Lines, cat6Lines, surveys, investments, deflation, ledger,
  }), [period, scope1Lines, locations, scope2Lines, factorSources, relevance, category3Params, cat1Lines, cat5Lines, cat6Lines, surveys, investments, deflation, ledger])

  // Autosave half a second after the last change. The account as loaded isn't saved again, so
  // unreadable saved data is only replaced once someone actually changes something. Each part
  // keeps its loaded reference until changed, so comparing references is exact and cheap, and
  // it holds even when React runs the effect twice in development.
  const [status, setStatus] = useState<SaveStatus>({ state: 'idle' })
  useEffect(() => {
    const unchanged = (Object.keys(account) as (keyof AccountData)[]).every((k) => account[k] === initial[k])
    if (unchanged) return
    const timer = setTimeout(() => {
      setStatus({ state: 'pending' })
      store.save(account).then(
        () => setStatus({ state: 'saved', at: new Date() }),
        () => setStatus({ state: 'failed' }),
      )
    }, 500)
    return () => clearTimeout(timer)
  }, [account, initial])

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
        <DataBar
          storeLabel={store.label}
          central={store.central}
          status={status}
          message={initialMessage}
          account={account}
          onReplace={async (next, message) => {
            await store.save(next).catch(() => undefined)
            onReplace(next, message)
          }}
          onClear={async () => {
            await store.clear()
            onReplace(emptyAccount(), 'Alle data er ryddet.')
          }}
        />
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
      </main>
    </>
  )
}

export default App
