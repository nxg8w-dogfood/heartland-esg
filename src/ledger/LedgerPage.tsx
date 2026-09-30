import { useId, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { Factor } from '../data/factors'
import {
  classify, guessMapping, ledgerFieldLabels, ledgerSummary, parseCsv, rowsToPostings,
  type ClassifiedPosting, type ColumnMapping, type Condition, type ConditionField, type ConditionOperator,
  type LedgerField, type ManualAction, type Posting, type Rule,
} from '../calc/ledger'
import type { LedgerState } from './state'
import { formatDate, formatNumber } from '../format'
import { newId } from '../newId'
import { Tile } from '../ui'

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
  const manual = useMemo(() => new Map(Object.entries(ledger.manual)), [ledger.manual])
  const classified = useMemo(() => ledger.postings.map((p) => classify(p, ledger.rules, manual)), [ledger.postings, ledger.rules, manual])
  const summary = ledgerSummary(classified)
  const spendFactors = factors.filter((f) => f.method === 'spend')

  return (
    <>
      <h1>Kontoplan</h1>
      <p className="lead">
        Importer posteringer fra finanssystemet og hent dem til klimaregnskabet med regler: en regel
        tagger posteringer til kategori 1 med en EXIOBASE-faktor, eller ekskluderer dem. Reglerne
        bruges i rækkefølge, og den første, der passer, vinder. En manuel handling på en postering går
        forud for reglerne. Taggede posteringer indgår i Scope 3, kategori 1.
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
                  onClick={() => {
                    if (!window.confirm(`Slet importen ${b.fileName} og dens ${b.count} posteringer?`)) return
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
          <Tile label="Taggede" value={summary.tagged} unit="" decimals={0} accent />
          <Tile label="Ekskluderede" value={summary.excluded} unit="" decimals={0} />
          <Tile label="Utaggede" value={summary.untagged} unit="" decimals={0} note={summary.manual ? `${summary.manual} håndteret manuelt` : undefined} />
        </dl>
      )}

      <RulesSection rules={ledger.rules} setLedger={setLedger} classified={classified} spendFactors={spendFactors} />

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

function ImportSection({ onImport }: { onImport: (fileName: string, rows: Omit<Posting, 'id' | 'importId'>[]) => void }) {
  const id = useId()
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: Record<string, string>[] } | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = (name: string, text: string) => {
    const parsed = parseCsv(text)
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

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Importer posteringer</h2>
      <div className="add-line">
        <div className="field wide">
          <label htmlFor={`${id}-file`}>CSV-fil fra finanssystemet</label>
          <input
            id={`${id}-file`}
            type="file"
            accept=".csv,text/csv"
            aria-describedby={`${id}-hint`}
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') {
                setError('Kun CSV understøttes endnu. Gem Excel-filen som CSV (semikolon-separeret) og prøv igen.')
                return
              }
              load(f.name, await readText(f))
            }}
          />
          <p id={`${id}-hint`} className="muted">
            Semikolon-, komma- eller tabulatorsepareret. Kolonnerne genkendes automatisk og kan rettes
            før import. Filen læses kun i browseren. Excel (XLS/XLSX) kommer senere: gem som CSV indtil
            da.{' '}
            <button type="button" className="link" onClick={() => load('eksempel.csv', exampleCsv)}>Prøv med eksempelfil</button>
          </p>
          {error && <p className="error">{error}</p>}
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
          <div className="actions">
            <button type="button" onClick={() => { onImport(file.name, postings); setFile(null); setMapping(null) }}>
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
  const matchCount = (ruleId: string) => classified.filter((c) => c.rule?.id === ruleId).length

  return (
    <section aria-labelledby="rules-heading">
      <div className="section-head">
        <h2 id="rules-heading">Regler</h2>
        <button
          type="button"
          onClick={() =>
            setRules((rs) => [...rs, { id: newId(), name: `Regel ${rs.length + 1}`, type: 'tag', active: true, conditions: [{ id: newId(), field: 'account', operator: 'is', value: '' }], factorId: null, category: 1, reason: '' }])
          }
        >
          Ny regel
        </button>
      </div>
      {rules.length === 0 && <p className="muted">Ingen regler endnu. Opret fx en regel, der tagger konto 6100 (Revision) med faktoren for rådgivning.</p>}
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
          onDelete={() => { if (window.confirm(`Slet reglen ${r.name}?`)) setRules((rs) => rs.filter((x) => x.id !== r.id)) }}
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
          <label id={`${id}-name-label`} htmlFor={`${id}-name`}>Regel {index + 1}</label>
          <input id={`${id}-name`} value={rule.name} onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-type`}>Handling</label>
          <select id={`${id}-type`} value={rule.type} onChange={(e) => onChange({ type: e.target.value as Rule['type'] })}>
            <option value="tag">Tag til kategori 1</option>
            <option value="exclude">Ekskluder</option>
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
  const [filter, setFilter] = useState<'all' | 'tagged' | 'excluded' | 'untagged'>('all')
  const shown = classified.filter((c) => filter === 'all' || c.status === filter)
  const setManual = (postingId: string, action: ManualAction | null) =>
    setLedger((l) => {
      const manual = { ...l.manual }
      if (action) manual[postingId] = action
      else delete manual[postingId]
      return { ...l, manual }
    })

  return (
    <section aria-labelledby={`${id}-heading`}>
      <div className="section-head">
        <h2 id={`${id}-heading`}>Posteringer</h2>
        <div className="field">
          <label htmlFor={`${id}-filter`} className="visually-hidden">Vis</label>
          <select id={`${id}-filter`} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">Alle</option>
            <option value="tagged">Taggede</option>
            <option value="excluded">Ekskluderede</option>
            <option value="untagged">Utaggede</option>
          </select>
        </div>
      </div>
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
                    {c.status === 'tagged' ? 'Tagget' : c.status === 'excluded' ? 'Ekskluderet' : <span className="pending">Utagget</span>}
                    <span className="sub">
                      {[
                        c.source === 'manual' ? 'Manuelt' : c.source === 'rule' ? `Regel: ${c.rule?.name}` : '',
                        c.status === 'tagged' ? (spendFactors.find((f) => f.id === c.factorId)?.name ?? 'ingen faktor') : '',
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td>
                    <label className="visually-hidden" htmlFor={`${id}-${p.id}-m`}>Manuel handling for postering {p.account}, {p.date}</label>
                    <select
                      id={`${id}-${p.id}-m`}
                      value={c.source === 'manual' ? (c.status === 'excluded' ? 'exclude' : c.factorId ?? '') : 'rules'}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === 'rules') setManual(p.id, null)
                        else if (v === 'exclude') setManual(p.id, { postingId: p.id, type: 'exclude', factorId: null, category: null, reason: 'Manuelt ekskluderet' })
                        else setManual(p.id, { postingId: p.id, type: 'tag', factorId: v, category: 1, reason: 'Manuelt tagget' })
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
      {shown.length > PAGE && <p className="muted">Viser de første {PAGE} af {shown.length} posteringer. Brug filteret for at indsnævre.</p>}
    </section>
  )
}
