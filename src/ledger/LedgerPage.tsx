import { useId, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { Factor } from '../data/factors'
import {
  classifyLedger, guessMapping, hitLabel, isCurrencyCode, postingStatusLabels, ledgerFieldLabels, ledgerSummary, parseCsv, rowsToPostings, tableToRows,
  type ClassifiedPosting, type ColumnMapping, type PostingStatus,
  type LedgerField, type ManualAction, type Posting, type TableRow,
} from '../calc/ledger'
import type { LedgerState } from './state'
import { formatDate, formatNumber } from '../format'
import { newId } from '../newId'
import { Tile } from '../ui'
import { useConfirm } from '../confirm'
import { RulesSection } from './RulesSection'
import { emptyPostingFilter, filterOptions, filterPostings, isFiltered, type FilterOption, type PostingFilter } from '../calc/postingFilter'

const exampleCsv = `Bilagsdato;Kontonr.;Kontotekst;Kreditor;Posteringstekst;Beløb;Valuta
15.01.2025;6100;Revision;Deloitte;Revision 2024;185.000,00;DKK
31.03.2025;6110;Juridisk rådgivning;Kammeradvokaten;Kontraktgennemgang;62.500,00;DKK
05.02.2025;6200;Software;Microsoft Ireland;Microsoft 365, år;12.400,00;EUR
28.02.2025;6300;Kantine;Kantinen ApS;Frokostordning februar;24.800,00;DKK
10.04.2025;6400;Rengøring;Rengøringsselskabet;Rengøring april;15.200,00;DKK
30.06.2025;7300;Bankgebyrer;Danske Bank;Gebyrer Q2;3.150,00;DKK
15.08.2025;6100;Revision;Deloitte;Halvårsgennemgang;45.000,00;DKK
01.09.2025;6500;Husleje;Ejendomsselskab;Husleje september;95.000,00;DKK`

type Props = { ledger: LedgerState; setLedger: Dispatch<SetStateAction<LedgerState>>; factors: readonly Factor[] }

export function LedgerPage({ ledger, setLedger, factors }: Props) {
  const classified = useMemo(() => classifyLedger(ledger), [ledger])
  const summary = ledgerSummary(classified)
  const spendFactors = factors.filter((f) => f.method === 'spend')
  const { confirm, dialog } = useConfirm()
  // Postings per import, to spot an import whose save was cut short (e.g. by closing the app).
  const stored = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of ledger.postings) m.set(p.importId, (m.get(p.importId) ?? 0) + 1)
    return m
  }, [ledger.postings])

  return (
    <>
      {dialog}
      <h1>Kontoplan</h1>
      <p className="lead">
        Importer posteringer fra finanssystemet. ESG-ansvarliges kontoregler giver hver konto en
        Scope 3-kategori og en EXIOBASE-faktor, og posteringsreglerne finjusterer enkelte posteringer
        ud fra et søgeord; du kan rette en posteringsregel for denne virksomhed. Dine egne
        undtagelser går forud for begge, og en manuel handling på en postering går forud for alt. Medtagne posteringer og posteringer til review indgår i deres
        kategori i Scope 3.
      </p>

      <ImportSection
        onImport={(fileName, rows) =>
          setLedger((l) => {
            const importId = newId()
            const postings = rows.map((r) => ({ ...r, id: newId(), importId }))
            return { ...l, postings: [...l.postings, ...postings], imports: [...l.imports, { id: importId, fileName, importedAt: new Date().toISOString(), count: postings.length }] }
          })
        }
      />

      {ledger.imports.length > 0 && (
        <section aria-labelledby="imports-heading">
          <h2 id="imports-heading">Importer</h2>
          <ul className="plain">
            {ledger.imports.map((b) => (
              <li key={b.id}>
                {b.fileName} · {formatNumber(b.count, 0)} posteringer · {new Date(b.importedAt).toLocaleString('da-DK')}{' '}
                {(stored.get(b.id) ?? 0) < b.count && (
                  <span className="warning-text">
                    Kun {formatNumber(stored.get(b.id) ?? 0, 0)} er gemt. Importen blev afbrudt, før den var gemt: slet den og importér filen igen.{' '}
                  </span>
                )}
                <button
                  type="button"
                  className="link"
                  onClick={async () => {
                    if (!(await confirm(`Slet importen ${b.fileName} og dens ${b.count} posteringer?`, 'Slet import'))) return
                    setLedger((l) => {
                      const gone = new Set(l.postings.filter((p) => p.importId === b.id).map((p) => p.id))
                      return {
                        ...l,
                        postings: l.postings.filter((p) => p.importId !== b.id),
                        imports: l.imports.filter((i) => i.id !== b.id),
                        manual: Object.fromEntries(Object.entries(l.manual).filter(([id]) => !gone.has(id))),
                      }
                    })
                  }}
                >
                  Slet import<span className="visually-hidden">: {b.fileName}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ledger.postings.length > 0 && (
        <dl className="tiles" aria-live="polite">
          <Tile label="Posteringer" value={summary.total} unit="" decimals={0} />
          <Tile label="Medtaget" value={summary.included} unit="" decimals={0} accent />
          <Tile label="Til review" value={summary.review} unit="" decimals={0} />
          <Tile label="Afventer" value={summary.pending} unit="" decimals={0} />
          <Tile label="Udeladt" value={summary.excluded} unit="" decimals={0} />
          <Tile label="Utagget" value={summary.untagged} unit="" decimals={0} note={summary.manual ? `${summary.manual} håndteret manuelt` : undefined} />
        </dl>
      )}

      <RulesSection ledger={ledger} setLedger={setLedger} classified={classified} spendFactors={spendFactors} />

      {ledger.postings.length > 0 && <PostingsSection classified={classified} setLedger={setLedger} spendFactors={spendFactors} />}
    </>
  )
}

/** Reads text as UTF-8, falling back to Windows-1252 (common in Danish exports) if it isn't valid. */
async function readText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8
}

/** The first sheet of an .xlsx file. The reader is loaded only when an Excel file is chosen. */
async function readXlsx(file: File): Promise<{ headers: string[]; rows: TableRow[] }> {
  const { readXlsxSheet } = await import('../calc/readXlsx')
  return tableToRows(await readXlsxSheet(file))
}

function ImportSection({ onImport }: { onImport: (fileName: string, rows: Omit<Posting, 'id' | 'importId'>[]) => void }) {
  const id = useId()
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: TableRow[] } | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)

  const load = (name: string, parsed: { headers: string[]; rows: TableRow[] }) => {
    if (parsed.rows.length === 0) {
      setFile(null)
      setError('Filen indeholder ingen rækker.')
      return
    }
    setError(null)
    setFile({ name, ...parsed })
    setMapping(guessMapping(parsed.headers))
  }

  const postings = file && mapping ? rowsToPostings(file.rows, mapping) : []
  const missingDates = postings.filter((p) => !p.date).length
  const missingAmounts = postings.filter((p) => p.amount === null).length
  const badCurrencies = [...new Set(postings.filter((p) => !isCurrencyCode(p.currency)).map((p) => p.currency))]

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Importer posteringer</h2>
      <div className="add-line">
        <div className="field wide">
          <label htmlFor={`${id}-file`}>Fil fra finanssystemet (CSV eller Excel)</label>
          <input
            id={`${id}-file`}
            type="file"
            accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-describedby={`${id}-hint`}
            disabled={reading}
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              if (/\.xls$/i.test(f.name)) {
                setError('Gamle Excel-filer (XLS, Excel 97–2003) understøttes ikke. Gem filen som XLSX eller CSV og prøv igen.')
                return
              }
              const isXlsx = /\.xlsx$/i.test(f.name) || f.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              if (!isXlsx && !/\.csv$/i.test(f.name) && f.type !== 'text/csv') {
                setError('Vælg en CSV- eller XLSX-fil.')
                return
              }
              setReading(true)
              try {
                load(f.name, isXlsx ? await readXlsx(f) : parseCsv(await readText(f)))
              } catch {
                setFile(null)
                setError('Filen kunne ikke læses. Er det en gyldig CSV- eller XLSX-fil?')
              } finally {
                setReading(false)
              }
            }}
          />
          <p id={`${id}-hint`} className="muted">
            CSV (semikolon-, komma- eller tabulatorsepareret) eller XLSX; for Excel bruges det første ark.
            Kolonnerne genkendes automatisk og kan rettes før import. Filen læses kun i browseren.{' '}
            <button type="button" className="link" onClick={() => load('eksempel.csv', parseCsv(exampleCsv))}>Prøv med eksempelfil</button>
          </p>
          {reading && <p className="muted" role="status">Læser filen …</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </div>

      {file && mapping && (
        <div className="card">
          <p className="strong">{file.name}: {file.rows.length} rækker</p>
          <div className="location-settings">
            {(Object.keys(ledgerFieldLabels) as LedgerField[]).map((f) => (
              <div className="field" key={f}>
                <label htmlFor={`${id}-map-${f}`}>{ledgerFieldLabels[f]}</label>
                <select id={`${id}-map-${f}`} value={mapping[f]} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value })}>
                  <option value="">(ingen)</option>
                  {file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <caption className="muted">Forhåndsvisning af de første 5 rækker</caption>
              <thead>
                <tr>{(Object.keys(ledgerFieldLabels) as LedgerField[]).map((f) => <th key={f} scope="col">{ledgerFieldLabels[f]}</th>)}</tr>
              </thead>
              <tbody>
                {postings.slice(0, 5).map((p, i) => (
                  <tr key={i}>
                    <td>{p.date ? formatDate(p.date) : <span className="pending">Mangler</span>}</td>
                    <td>{p.account}</td>
                    <td>{p.accountName}</td>
                    <td>{p.supplier}</td>
                    <td>{p.text}</td>
                    <td className="num">{p.amount === null ? <span className="pending">Ulæseligt</span> : formatNumber(p.amount, 2)}</td>
                    <td>{p.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(missingDates > 0 || missingAmounts > 0) && (
            <p className="warning">
              {missingDates > 0 && `${missingDates} rækker har ingen læsbar dato og kommer ikke med i nogen periode. `}
              {missingAmounts > 0 && `${missingAmounts} rækker har et ulæseligt beløb.`}
            </p>
          )}
          {badCurrencies.length > 0 && (
            <p className="error" id={`${id}-currency-error`} role="alert">
              Kolonnen “{mapping.currency}” indeholder værdier, der ikke er valutakoder
              ({badCurrencies.slice(0, 3).map((c) => `“${c}”`).join(', ')}{badCurrencies.length > 3 ? ' …' : ''}).
              Vælg den kolonne, der har valutakoden (fx DKK eller EUR), eller (ingen), hvis alle beløb er i DKK.
            </p>
          )}
          <div className="actions">
            <button
              type="button"
              disabled={badCurrencies.length > 0}
              aria-describedby={badCurrencies.length > 0 ? `${id}-currency-error` : undefined}
              onClick={() => { onImport(file.name, postings); setFile(null); setMapping(null) }}
            >
              Importer {postings.length} posteringer
            </button>{' '}
            <button type="button" className="secondary" onClick={() => { setFile(null); setMapping(null) }}>Annullér</button>
          </div>
        </div>
      )}
    </section>
  )
}

const PAGE = 200

function PostingsSection({ classified, setLedger, spendFactors }: { classified: ClassifiedPosting[]; setLedger: Dispatch<SetStateAction<LedgerState>>; spendFactors: Factor[] }) {
  const id = useId()
  const [filter, setFilter] = useState<PostingFilter>(emptyPostingFilter)
  const options = useMemo(() => filterOptions(classified), [classified])
  const shown = useMemo(() => filterPostings(classified, filter), [classified, filter])
  const set = (patch: Partial<PostingFilter>) => setFilter((f) => ({ ...f, ...patch }))
  const choice = (o: FilterOption) => <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
  const setManual = (postingId: string, action: ManualAction | null) =>
    setLedger((l) => {
      const manual = { ...l.manual }
      if (action) manual[postingId] = action
      else delete manual[postingId]
      return { ...l, manual }
    })

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Posteringer</h2>
      <div className="location-settings" role="search" aria-label="Filtrer posteringer">
        <div className="field wide">
          <label htmlFor={`${id}-search`}>Søg</label>
          <input
            id={`${id}-search`}
            type="search"
            value={filter.search}
            onChange={(e) => set({ search: e.target.value })}
            aria-describedby={`${id}-search-hint`}
          />
          <span id={`${id}-search-hint`} className="muted">Konto, kontonavn, leverandør eller tekst. Flere ord skal alle passe.</span>
        </div>
        <div className="field">
          <label htmlFor={`${id}-status`}>Status</label>
          <select id={`${id}-status`} value={filter.status} onChange={(e) => set({ status: e.target.value as PostingFilter['status'] })}>
            <option value="">Alle</option>
            {(Object.keys(postingStatusLabels) as PostingStatus[]).map((s) => <option key={s} value={s}>{postingStatusLabels[s]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-account`}>Konto</label>
          <select id={`${id}-account`} value={filter.account} onChange={(e) => set({ account: e.target.value })}>
            <option value="">Alle</option>
            {options.accounts.map(choice)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-category`}>Kategori</label>
          <select id={`${id}-category`} value={filter.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">Alle</option>
            {options.categories.map(choice)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-rule`}>Regel</label>
          <select id={`${id}-rule`} value={filter.rule} onChange={(e) => set({ rule: e.target.value })}>
            <option value="">Alle</option>
            {options.rules.map(choice)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-currency`}>Valuta</label>
          <select id={`${id}-currency`} value={filter.currency} onChange={(e) => set({ currency: e.target.value })}>
            <option value="">Alle</option>
            {options.currencies.map(choice)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-from`}>Fra dato</label>
          <input id={`${id}-from`} type="date" value={filter.from} max={filter.to || undefined} onChange={(e) => set({ from: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-to`}>Til dato</label>
          <input id={`${id}-to`} type="date" value={filter.to} min={filter.from || undefined} onChange={(e) => set({ to: e.target.value })} />
        </div>
        <div className="field end">
          <button type="button" className="secondary" disabled={!isFiltered(filter)} onClick={() => { setFilter(emptyPostingFilter); document.getElementById(`${id}-search`)?.focus() }}>Nulstil filtre</button>
        </div>
      </div>
      <p className="muted" role="status">
        {isFiltered(filter) ? `${formatNumber(shown.length, 0)} af ${formatNumber(classified.length, 0)} posteringer passer på filtrene.` : `${formatNumber(classified.length, 0)} posteringer.`}
      </p>
      <div className="table-wrap">
        <table>
          <caption className="visually-hidden">Posteringer</caption>
          <thead>
            <tr>
              <th scope="col">Dato</th>
              <th scope="col">Konto</th>
              <th scope="col">Leverandør og tekst</th>
              <th scope="col" className="num">Beløb</th>
              <th scope="col">Status</th>
              <th scope="col">Manuel handling</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, PAGE).map((c) => {
              const p = c.posting
              return (
                <tr key={p.id}>
                  <td>{p.date ? formatDate(p.date) : <span className="pending">Mangler</span>}</td>
                  <td>{p.account}<span className="sub">{p.accountName}</span></td>
                  <td>{p.supplier}<span className="sub">{p.text}</span></td>
                  <td className="num">{p.amount === null ? '—' : `${formatNumber(p.amount, 2)} ${p.currency}`}</td>
                  <td>
                    <span className={c.status === 'review' ? 'warning-text' : c.status === 'pending' || c.status === 'untagged' ? 'pending' : undefined}>{postingStatusLabels[c.status]}</span>
                    <span className="sub">
                      {[
                        hitLabel(c.hit),
                        c.category ? `kategori ${c.category}` : '',
                        c.status !== 'excluded' && c.status !== 'untagged' ? (spendFactors.find((f) => f.id === c.factorId)?.name ?? 'ingen faktor') : '',
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td>
                    <label className="visually-hidden" htmlFor={`${id}-${p.id}-m`}>Manuel handling for postering {p.account}, {p.date}</label>
                    <select
                      id={`${id}-${p.id}-m`}
                      value={c.hit.kind === 'manual' ? (c.status === 'excluded' ? 'exclude' : c.factorId ?? '') : 'rules'}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === 'rules') setManual(p.id, null)
                        else if (v === 'exclude') setManual(p.id, { postingId: p.id, type: 'exclude', factorId: null, category: null, reason: 'Manuelt ekskluderet' })
                        else setManual(p.id, { postingId: p.id, type: 'tag', factorId: v, category: c.category ?? 1, reason: 'Manuelt tagget' })
                      }}
                    >
                      <option value="rules">Følg reglerne</option>
                      <option value="exclude">Ekskluder</option>
                      {spendFactors.map((f) => <option key={f.id} value={f.id}>Tag: {f.name}, {f.region}</option>)}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {shown.length > PAGE && <p className="muted">Viser de første {PAGE} af {formatNumber(shown.length, 0)} posteringer. Brug filtrene for at indsnævre.</p>}
    </section>
  )
}
