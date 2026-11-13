import { useId, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { Factor } from '../data/factors'
import { accountRules, postingRules } from '../data/scope3Rules'
import { spendFactorRegister } from '../data/spendFactorRegister'
import { handlingLabels } from '../calc/spendRules'
import { scope3Categories } from '../calc/scope3'
import {
  classifyLedger, guessMapping, hitLabel, isCurrencyCode, postingStatusLabels, ledgerFieldLabels, ledgerSummary, parseCsv, rowsToPostings, tableToRows,
  type ClassifiedPosting, type ColumnMapping, type PostingStatus, type Condition, type ConditionField, type ConditionOperator,
  type LedgerField, type ManualAction, type Posting, type Rule, type TableRow,
} from '../calc/ledger'
import type { LedgerState } from './state'
import { formatDate, formatNumber } from '../format'
import { newId } from '../newId'
import { Tile } from '../ui'
import { useConfirm } from '../confirm'
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

const fieldOptions: { value: ConditionField; label: string }[] = [
  { value: 'account', label: 'Kontonummer' },
  { value: 'accountName', label: 'Kontonavn' },
  { value: 'supplier', label: 'Leverandør' },
  { value: 'text', label: 'Posteringstekst' },
]
const operatorOptions: { value: ConditionOperator; label: string }[] = [
  { value: 'is', label: 'er' },
  { value: 'startsWith', label: 'starter med' },
  { value: 'contains', label: 'indeholder' },
]

type Props = { ledger: LedgerState; setLedger: Dispatch<SetStateAction<LedgerState>>; factors: readonly Factor[] }

export function LedgerPage({ ledger, setLedger, factors }: Props) {
  const classified = useMemo(() => classifyLedger(ledger), [ledger])
  const summary = ledgerSummary(classified)
  const spendFactors = factors.filter((f) => f.method === 'spend')
  const { confirm, dialog } = useConfirm()

  return (
    <>
      {dialog}
      <h1>Kontoplan</h1>
      <p className="lead">
        Importer posteringer fra finanssystemet. ESG-ansvarliges kontoregler giver hver konto en
        Scope 3-kategori og en EXIOBASE-faktor, og posteringsreglerne finjusterer enkelte posteringer
        ud fra et søgeord. Dine egne undtagelser går forud for begge, og en manuel handling på en
        postering går forud for alt. Medtagne posteringer og posteringer til review indgår i deres
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
                {b.fileName} · {b.count} posteringer · {new Date(b.importedAt).toLocaleString('da-DK')}{' '}
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

      <RulesSection rules={ledger.rules} setLedger={setLedger} classified={classified} spendFactors={spendFactors} />

      <BuiltinRulesSection classified={classified} />

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

function RulesSection({ rules, setLedger, classified, spendFactors }: { rules: Rule[]; setLedger: Dispatch<SetStateAction<LedgerState>>; classified: ClassifiedPosting[]; spendFactors: Factor[] }) {
  const setRules = (f: (rs: Rule[]) => Rule[]) => setLedger((l) => ({ ...l, rules: f(l.rules) }))
  const update = (ruleId: string, patch: Partial<Rule>) => setRules((rs) => rs.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)))
  const move = (from: number, to: number) =>
    setRules((rs) => {
      if (to < 0 || to >= rs.length) return rs
      const next = [...rs]
      const [r] = next.splice(from, 1)
      next.splice(to, 0, r)
      return next
    })
  const matchCount = (ruleId: string) => classified.filter((c) => c.hit.kind === 'exception' && c.hit.rule.id === ruleId).length
  const { confirm, dialog } = useConfirm()

  return (
    <section aria-labelledby="rules-heading">
      {dialog}
      <div className="section-head">
        <h2 id="rules-heading">Undtagelser</h2>
        <button
          type="button"
          onClick={() =>
            setRules((rs) => [...rs, { id: newId(), name: `Undtagelse ${rs.length + 1}`, type: 'tag', active: true, conditions: [{ id: newId(), field: 'account', operator: 'is', value: '' }], factorId: null, category: 1, reason: '' }])
          }
        >
          Ny regel
        </button>
      </div>
      <p className="muted">
        Undtagelser går forud for kontoreglerne og posteringsreglerne: den første, der passer, vinder.
        Betingelserne skelner ikke mellem store og små bogstaver. Undtagelser kan også oprettes fra en
        postering på kategorisiderne under Scope 3.
      </p>
      {rules.length === 0 && <p className="muted">Ingen undtagelser endnu.</p>}
      {rules.map((r, i) => (
        <RuleCard
          key={r.id}
          rule={r}
          index={i}
          count={rules.length}
          matches={matchCount(r.id)}
          spendFactors={spendFactors}
          onChange={(patch) => update(r.id, patch)}
          onMove={(to) => move(i, to)}
          onDelete={async () => { if (await confirm(`Slet reglen ${r.name}?`)) setRules((rs) => rs.filter((x) => x.id !== r.id)) }}
        />
      ))}
    </section>
  )
}

function RuleCard({ rule, index, count, matches, spendFactors, onChange, onMove, onDelete }: {
  rule: Rule; index: number; count: number; matches: number; spendFactors: Factor[]
  onChange: (patch: Partial<Rule>) => void; onMove: (to: number) => void; onDelete: () => void
}) {
  const id = useId()
  const setCondition = (cid: string, patch: Partial<Condition>) => onChange({ conditions: rule.conditions.map((c) => (c.id === cid ? { ...c, ...patch } : c)) })
  return (
    <article className="card" aria-labelledby={`${id}-name-label`}>
      <div className="location-settings">
        <div className="field">
          <label id={`${id}-name-label`} htmlFor={`${id}-name`}>Undtagelse {index + 1}</label>
          <input id={`${id}-name`} value={rule.name} onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-type`}>Handling</label>
          <select id={`${id}-type`} value={rule.type} onChange={(e) => onChange({ type: e.target.value as Rule['type'] })}>
            <option value="tag">Medtag med faktor</option>
            <option value="exclude">Udelad</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-cat`}>Kategori</label>
          <select id={`${id}-cat`} value={rule.category} onChange={(e) => onChange({ category: Number(e.target.value) })}>
            {scope3Categories.map((c) => <option key={c.nr} value={c.nr}>{c.nr}. {c.name}</option>)}
          </select>
        </div>
        {rule.type === 'tag' && (
          <div className="field">
            <label htmlFor={`${id}-factor`}>Faktor</label>
            <FactorSelect id={`${id}-factor`} value={rule.factorId} factors={spendFactors} onChange={(factorId) => onChange({ factorId })} />
          </div>
        )}
        <div className="field">
          <label htmlFor={`${id}-reason`}>Begrundelse</label>
          <input id={`${id}-reason`} value={rule.reason} onChange={(e) => onChange({ reason: e.target.value })} />
        </div>
      </div>
      <fieldset className="conditions">
        <legend>Betingelser (alle skal være opfyldt)</legend>
        {rule.conditions.map((c, ci) => (
          <div className="condition" key={c.id}>
            <label className="visually-hidden" htmlFor={`${id}-${c.id}-f`}>Felt, betingelse {ci + 1}</label>
            <select id={`${id}-${c.id}-f`} value={c.field} onChange={(e) => setCondition(c.id, { field: e.target.value as ConditionField })}>
              {fieldOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label className="visually-hidden" htmlFor={`${id}-${c.id}-o`}>Sammenligning, betingelse {ci + 1}</label>
            <select id={`${id}-${c.id}-o`} value={c.operator} onChange={(e) => setCondition(c.id, { operator: e.target.value as ConditionOperator })}>
              {operatorOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label className="visually-hidden" htmlFor={`${id}-${c.id}-v`}>Værdi, betingelse {ci + 1}</label>
            <input id={`${id}-${c.id}-v`} value={c.value} placeholder="værdi" onChange={(e) => setCondition(c.id, { value: e.target.value })} />
            {rule.conditions.length > 1 && (
              <button type="button" className="link" onClick={() => onChange({ conditions: rule.conditions.filter((x) => x.id !== c.id) })} aria-label={`Fjern betingelse ${ci + 1}`}>Fjern</button>
            )}
          </div>
        ))}
        <button type="button" className="link" onClick={() => onChange({ conditions: [...rule.conditions, { id: newId(), field: 'account', operator: 'is', value: '' }] })}>Tilføj betingelse</button>
      </fieldset>
      <div className="rule-footer">
        <label className="check">
          <input type="checkbox" checked={rule.active} onChange={(e) => onChange({ active: e.target.checked })} />
          Aktiv
        </label>
        <span className={matches ? 'strong' : 'muted'}>{matches} {matches === 1 ? 'postering' : 'posteringer'} rammes</span>
        {rule.type === 'tag' && !rule.factorId && <span className="warning-text">Vælg en faktor — ellers afventer posteringerne</span>}
        <span className="spacer" />
        <button type="button" className="link" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={`Flyt ${rule.name} op`}>Op</button>
        <button type="button" className="link" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={`Flyt ${rule.name} ned`}>Ned</button>
        <button type="button" className="link" onClick={onDelete}>Slet<span className="visually-hidden"> {rule.name}</span></button>
      </div>
    </article>
  )
}

function FactorSelect({ id, value, factors, onChange }: { id: string; value: string | null; factors: Factor[]; onChange: (id: string | null) => void }) {
  return (
    <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Vælg faktor</option>
      {factors.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}, {f.region}{f.value === null ? ' (faktor mangler)' : ''}
        </option>
      ))}
    </select>
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

/** The ESG owner's account and posting rules and the factor register, read-only (ADR 0015). */
function BuiltinRulesSection({ classified }: { classified: ClassifiedPosting[] }) {
  const hits = (id: string) => classified.filter((c) => c.hit.kind === 'posting' && c.hit.rule.id === id).length
  const category = (n: number | null) => (n === null ? '' : `3.${n}`)
  return (
    <section aria-labelledby="builtin-heading">
      <h2 id="builtin-heading">Standardregler</h2>
      <p className="muted">
        ESG-ansvarliges godkendte regler. De ændres i koden, så hver ændring bliver gennemgået; brug en
        undtagelse ovenfor til enkelte posteringer. Posteringsregler matcher søgeordet præcis som skrevet,
        med store og små bogstaver og mellemrum, i posteringstekst og leverandør, og gælder kun
        posteringer på konti, der medtages.
      </p>
      <details>
        <summary>Posteringsregler ({postingRules.length})</summary>
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">Posteringsregler i prioriteret rækkefølge</caption>
            <thead>
              <tr>
                <th scope="col">Regel</th>
                <th scope="col">Søgeord</th>
                <th scope="col">Gælder for</th>
                <th scope="col">Handling</th>
                <th scope="col">Faktor</th>
                <th scope="col">Flyt til</th>
                <th scope="col">Begrundelse</th>
                <th scope="col" className="num">Rammer</th>
              </tr>
            </thead>
            <tbody>
              {postingRules.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.id}<span className="sub">Prioritet {r.priority}</span></th>
                  <td><code>{`«${r.searchWord}»`}</code></td>
                  <td>{category(r.appliesTo) || 'Alle'}</td>
                  <td>{handlingLabels[r.handling]}</td>
                  <td>{r.factorCode ?? '—'}</td>
                  <td>{category(r.moveTo) || '—'}</td>
                  <td>{r.reason}<span className="sub">Godkendt {r.approvedOn ? formatDate(r.approvedOn) : '—'}</span></td>
                  <td className="num">{hits(r.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details>
        <summary>Kontoregler ({accountRules.length})</summary>
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">Kontoregler</caption>
            <thead>
              <tr>
                <th scope="col">Konto</th>
                <th scope="col">Medtages</th>
                <th scope="col">Kategori</th>
                <th scope="col">Faktor</th>
                <th scope="col">Grundlag</th>
                <th scope="col">Begrundelse</th>
              </tr>
            </thead>
            <tbody>
              {accountRules.map((r) => (
                <tr key={r.account}>
                  <th scope="row">{r.account}<span className="sub">{r.name}</span></th>
                  <td>{r.include ? 'Ja' : 'Nej'}</td>
                  <td>{category(r.category)}</td>
                  <td>{r.factorCode ?? ''}</td>
                  <td>{r.basis}</td>
                  <td>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details>
        <summary>Faktorregister ({spendFactorRegister.length})</summary>
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">FaktorID og den sektor, de står for</caption>
            <thead>
              <tr>
                <th scope="col">FaktorID</th>
                <th scope="col">Sektor</th>
                <th scope="col">Datamanualen</th>
              </tr>
            </thead>
            <tbody>
              {spendFactorRegister.map((r) => (
                <tr key={r.code}>
                  <th scope="row">{r.code}</th>
                  <td>{r.database}: {r.sector}</td>
                  <td>{r.dataManual || <span className="muted">Ikke nævnt</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
