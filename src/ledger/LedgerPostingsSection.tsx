// The ledger postings a Scope 3 category gets from the rules (docs/adr/0009): each posting's
// status, the rule that hit it and its emissions, with a way to add an exception for one.

import { useEffect, useId, useMemo, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { hitLabel, postingStatusLabels, type ClassifiedPosting, type ConditionField, type PostingStatus, type Rule } from '../calc/ledger'
import type { Period } from '../calc/dates'
import type { SpendResult } from '../calc/spend'
import { scope3Categories } from '../calc/scope3'
import type { Factor } from '../data/factors'
import { formatDate, formatNumber } from '../format'
import { newId } from '../newId'
import { Tile } from '../ui'
import type { LedgerState } from './state'

type Props = {
  category: number
  classified: readonly ClassifiedPosting[]
  /** Spend results for the postings that count, by line id (kp-<posting id>) */
  results: readonly SpendResult[]
  period: Period
  factors: readonly Factor[]
  setLedger: Dispatch<SetStateAction<LedgerState>>
}

const statusClass = (s: PostingStatus) => (s === 'review' ? 'warning-text' : s === 'pending' || s === 'untagged' ? 'pending' : undefined)
const inPeriod = (date: string, period: Period) => date !== '' && date >= period.start && date <= period.end

const PAGE = 200

export function LedgerPostingsSection({ category, classified, results, period, factors, setLedger }: Props) {
  const id = useId()
  const [filter, setFilter] = useState<PostingStatus | 'all'>('all')
  const [editing, setEditing] = useState<ClassifiedPosting | null>(null)
  const table = useRef<HTMLDivElement>(null)
  /** Back to the row's button when the form closes, so keyboard users keep their place */
  const returnTo = useRef<string | null>(null)
  const close = () => {
    returnTo.current = editing?.posting.id ?? null
    setEditing(null)
  }
  useEffect(() => {
    if (editing || !returnTo.current) return
    table.current?.querySelector<HTMLButtonElement>(`[data-posting="${returnTo.current}"]`)?.focus()
    returnTo.current = null
  }, [editing])
  const mine = useMemo(() => classified.filter((c) => c.category === category && inPeriod(c.posting.date, period)), [classified, category, period])
  const byLine = useMemo(() => new Map(results.map((r) => [r.line.id, r])), [results])
  const count = (s: PostingStatus) => mine.filter((c) => c.status === s).length
  const shown = mine.filter((c) => filter === 'all' || c.status === filter)
  const factorName = (fid: string | null) => {
    const f = factors.find((x) => x.id === fid)
    return f ? `${f.name}${f.value === null ? ' (faktor mangler)' : ''}` : 'ingen faktor'
  }

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Posteringer fra kontoplanen</h2>
      <p className="muted">
        Posteringer importeret på <a href="#/kontoplan">Kontoplan</a> tagges hertil af kontoreglerne
        og posteringsreglerne. Medtaget og til review tæller med; afventer og udeladt gør ikke. En
        undtagelse, du opretter her, går forud for reglerne og kan ses og rettes på Kontoplan.
      </p>
      {mine.length === 0 ? (
        <p className="muted">Ingen posteringer i perioden er tagget til kategori {category}.</p>
      ) : (
        <>
          <dl className="tiles" aria-live="polite">
            <Tile label="Medtaget" value={count('included')} unit="" decimals={0} />
            <Tile label="Til review" value={count('review')} unit="" decimals={0} />
            <Tile label="Afventer" value={count('pending')} unit="" decimals={0} />
            <Tile label="Udeladt" value={count('excluded')} unit="" decimals={0} />
          </dl>
          <div className="field">
            <label htmlFor={`${id}-filter`}>Vis</label>
            <select id={`${id}-filter`} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="all">Alle ({mine.length})</option>
              {(['included', 'review', 'pending', 'excluded'] as const).map((s) => <option key={s} value={s}>{postingStatusLabels[s]} ({count(s)})</option>)}
            </select>
          </div>
          <div className="table-wrap" ref={table}>
            <table>
              <caption className="visually-hidden">Posteringer i kategori {category}</caption>
              <thead>
                <tr>
                  <th scope="col">Dato</th>
                  <th scope="col">Konto</th>
                  <th scope="col">Leverandør og tekst</th>
                  <th scope="col" className="num">Beløb</th>
                  <th scope="col">Status og regel</th>
                  <th scope="col">Faktor</th>
                  <th scope="col" className="num">tCO2e</th>
                  <th scope="col"><span className="visually-hidden">Handling</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, PAGE).map((c) => {
                  const p = c.posting
                  const r = byLine.get(`kp-${p.id}`)
                  return (
                    <tr key={p.id}>
                      <td>{formatDate(p.date)}</td>
                      <td>{p.account}<span className="sub">{p.accountName}</span></td>
                      <td>{p.supplier}<span className="sub">{p.text}</span></td>
                      <td className="num">{p.amount === null ? '—' : `${formatNumber(p.amount, 2)} ${p.currency}`}</td>
                      <td>
                        <span className={statusClass(c.status)}>{postingStatusLabels[c.status]}</span>
                        <span className="sub">{hitLabel(c.hit)}{c.reason ? ` — ${c.reason}` : ''}</span>
                      </td>
                      <td>{c.status === 'excluded' ? '—' : factorName(c.factorId)}</td>
                      <td className="num">{r ? (r.pending ? <span className="pending">Afventer faktor</span> : formatNumber(r.tCO2e, 3)) : '—'}</td>
                      <td>
                        <button type="button" className="link" data-posting={p.id} onClick={() => setEditing(c)}>
                          Undtagelse<span className="visually-hidden"> for postering {p.account}, {formatDate(p.date)}, {p.text}</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {shown.length > PAGE && <p className="muted">Viser de første {PAGE} af {shown.length} posteringer. Brug filteret for at indsnævre.</p>}
        </>
      )}
      {editing && (
        <ExceptionForm
          key={editing.posting.id}
          posting={editing}
          category={category}
          factors={factors}
          onCancel={close}
          onSave={(rule) => { setLedger((l) => ({ ...l, rules: [...l.rules, rule] })); close() }}
        />
      )}
    </section>
  )
}

const fieldLabels: Record<Exclude<ConditionField, 'accountName'>, string> = { text: 'Posteringstekst', supplier: 'Leverandør', account: 'Kontonummer' }

/** A new exception: exclude postings that match, or give them a specific factor and category. */
export function ExceptionForm({ posting, category, factors, onSave, onCancel }: {
  posting: ClassifiedPosting; category: number; factors: readonly Factor[]; onSave: (rule: Rule) => void; onCancel: () => void
}) {
  const id = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const p = posting.posting
  const [field, setField] = useState<keyof typeof fieldLabels>(p.text ? 'text' : 'supplier')
  const [value, setValue] = useState(p.text || p.supplier)
  const [type, setType] = useState<Rule['type']>('exclude')
  const [factorId, setFactorId] = useState(posting.factorId ?? '')
  const [cat, setCat] = useState(category)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const spendFactors = factors.filter((f) => f.method === 'spend')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!value.trim()) return setError('Angiv, hvad undtagelsen skal matche.')
    if (type === 'tag' && !factorId) return setError('Vælg en faktor.')
    if (!reason.trim()) return setError('Angiv en begrundelse.')
    onSave({
      id: newId(),
      name: `${type === 'exclude' ? 'Udelad' : 'Faktor'}: ${value.trim()}`,
      type,
      active: true,
      conditions: [{ id: newId(), field, operator: field === 'account' ? 'is' : 'contains', value: value.trim() }],
      factorId: type === 'tag' ? factorId : null,
      category: cat,
      reason: reason.trim(),
    })
  }

  return (
    <form className="card" onSubmit={submit} aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} ref={heading} tabIndex={-1}>Ny undtagelse</h3>
      <p className="muted">
        Ud fra postering {p.account}, {formatDate(p.date)}. Undtagelsen gælder alle posteringer, der matcher (uanset store og små bogstaver).
      </p>
      <div className="location-settings">
        <div className="field">
          <label htmlFor={`${id}-field`}>Match på</label>
          <select id={`${id}-field`} value={field} onChange={(e) => { const f = e.target.value as typeof field; setField(f); setValue(f === 'account' ? p.account : f === 'supplier' ? p.supplier : p.text) }}>
            {Object.entries(fieldLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-value`}>{field === 'account' ? 'Er' : 'Indeholder'}</label>
          <input id={`${id}-value`} value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-type`}>Handling</label>
          <select id={`${id}-type`} value={type} onChange={(e) => setType(e.target.value as Rule['type'])}>
            <option value="exclude">Udelad</option>
            <option value="tag">Medtag med en bestemt faktor</option>
          </select>
        </div>
        {type === 'tag' && (
          <>
            <div className="field">
              <label htmlFor={`${id}-factor`}>Faktor</label>
              <select id={`${id}-factor`} value={factorId} onChange={(e) => setFactorId(e.target.value)}>
                <option value="">Vælg faktor</option>
                {spendFactors.map((f) => <option key={f.id} value={f.id}>{f.name}, {f.region}{f.value === null ? ' (faktor mangler)' : ''}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-cat`}>Kategori</label>
              <select id={`${id}-cat`} value={cat} onChange={(e) => setCat(Number(e.target.value))}>
                {scope3Categories.map((c) => <option key={c.nr} value={c.nr}>{c.nr}. {c.name}</option>)}
              </select>
            </div>
          </>
        )}
        <div className="field wide">
          <label htmlFor={`${id}-reason`}>Begrundelse</label>
          <input id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="submit">Opret undtagelse</button>{' '}
        <button type="button" className="secondary" onClick={onCancel}>Annullér</button>
      </div>
    </form>
  )
}
