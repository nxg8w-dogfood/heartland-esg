// The rules on Kontoplan: the user's exceptions (Undtagelser) and the ESG owner's posting rules,
// account rules and factor register (Regler), each as a table that can be filtered. An exception
// or a posting rule is edited from its row and saved with Gem (docs/adr/0015, 0018).

import { useEffect, useId, useMemo, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react'
import type { Factor } from '../data/factors'
import { accountRules } from '../data/scope3Rules'
import { spendFactorRegister } from '../data/spendFactorRegister'
import { handlingLabels, type PostingHandling } from '../calc/spendRules'
import { scope3Categories } from '../calc/scope3'
import {
  builtinRuleBook, ruleMatches, withRuleEdits,
  type ClassifiedPosting, type Condition, type ConditionField, type ConditionOperator, type EffectivePostingRule, type Posting, type PostingRuleEdit, type Rule,
} from '../calc/ledger'
import { emptyRuleFilter, filterAccountRules, filterExceptions, filterPostingRules, isRuleFiltered, type RuleFilter } from '../calc/ruleFilter'
import type { LedgerState } from './state'
import { formatDate, formatNumber } from '../format'
import { newId } from '../newId'
import { useConfirm } from '../confirm'
import { blankException } from './textRule'
import { FactorSearchSelect } from '../factors/FactorSearch'
import { fitsAmount } from '../calc/factorSearch'

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

const category = (n: number | null) => (n === null ? '' : `3.${n}`)
const today = () => new Date().toISOString().slice(0, 10)

/**
 * Which row's editor is open, and focus back on its Rediger button when it closes, however it was
 * closed. Rows mark their button with `data-rule-edit`.
 */
function useOpenRow() {
  const [open, setOpen] = useState<string | null>(null)
  const returnTo = useRef<string | null>(null)
  const close = () => {
    returnTo.current = open
    setOpen(null)
  }
  useEffect(() => {
    if (open || !returnTo.current) return
    document.querySelector<HTMLElement>(`[data-rule-edit="${CSS.escape(returnTo.current)}"]`)?.focus()
    returnTo.current = null
  }, [open])
  return { open, setOpen, close, toggle: (key: string) => (open === key ? close() : setOpen(key)) }
}

/** The filters above a rule table. `handling` names the two handlings; `state` is the fourth filter, if any. */
function RuleFilterBar({ label, filter, setFilter, shown, total, noun, state }: {
  label: string; filter: RuleFilter; setFilter: Dispatch<SetStateAction<RuleFilter>>; shown: number; total: number
  /** One and several, e.g. ['undtagelse', 'undtagelser'] */
  noun: readonly [string, string]
  state?: { label: string; options: { value: string; label: string }[] }
}) {
  const id = useId()
  const set = (patch: Partial<RuleFilter>) => setFilter((f) => ({ ...f, ...patch }))
  return (
    <>
      <div className="location-settings" role="search" aria-label={label}>
        <div className="field wide">
          <label htmlFor={`${id}-search`}>Søg</label>
          <input id={`${id}-search`} type="search" value={filter.search} onChange={(e) => set({ search: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-handling`}>Handling</label>
          <select id={`${id}-handling`} value={filter.handling} onChange={(e) => set({ handling: e.target.value })}>
            <option value="">Alle</option>
            <option value="include">Medtag</option>
            <option value="exclude">Udelad</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-category`}>Kategori</label>
          <select id={`${id}-category`} value={filter.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">Alle</option>
            {scope3Categories.map((c) => <option key={c.nr} value={String(c.nr)}>{c.nr}. {c.name}</option>)}
          </select>
        </div>
        {state && (
          <div className="field">
            <label htmlFor={`${id}-state`}>{state.label}</label>
            <select id={`${id}-state`} value={filter.state} onChange={(e) => set({ state: e.target.value })}>
              <option value="">Alle</option>
              {state.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
        <div className="field end">
          <button type="button" className="secondary" disabled={!isRuleFiltered(filter)} onClick={() => { setFilter(emptyRuleFilter); document.getElementById(`${id}-search`)?.focus() }}>Nulstil filtre</button>
        </div>
      </div>
      <p className="muted" role="status">
        {isRuleFiltered(filter) ? `${formatNumber(shown, 0)} af ${formatNumber(total, 0)} ${noun[1]} passer på filtrene.` : `${formatNumber(total, 0)} ${noun[total === 1 ? 0 : 1]}.`}
      </p>
    </>
  )
}

type ExceptionsProps = { ledger: LedgerState; setLedger: Dispatch<SetStateAction<LedgerState>>; classified: ClassifiedPosting[]; factors: readonly Factor[] }

/** Kontoplan → Undtagelser: the user's own rules for this company, in order, filtered. */
export function ExceptionsSection({ ledger, setLedger, classified, factors }: ExceptionsProps) {
  const rules = ledger.rules
  const { open, setOpen, close, toggle } = useOpenRow()
  const [draft, setDraft] = useState<Rule | null>(null)
  const [filter, setFilter] = useState<RuleFilter>(emptyRuleFilter)
  const setRules = (f: (rs: Rule[]) => Rule[]) => setLedger((l) => ({ ...l, rules: f(l.rules) }))
  const move = (from: number, to: number) =>
    setRules((rs) => {
      if (to < 0 || to >= rs.length) return rs
      const next = [...rs]
      const [r] = next.splice(from, 1)
      next.splice(to, 0, r)
      return next
    })
  const hits = (ruleId: string) => classified.filter((c) => c.hit.kind === 'exception' && c.hit.rule.id === ruleId).length
  const factorName = (id: string | null) => (id ? (factors.find((f) => f.id === id)?.name ?? id) : '')
  const shown = filterExceptions(rules, filter, factorName)
  const { confirm, dialog } = useConfirm()

  return (
    <section aria-labelledby="exceptions-heading">
      {dialog}
      <h2 id="exceptions-heading">Undtagelser</h2>
      <p className="muted">
        Dine egne regler for denne virksomhed. Den første, der passer, vinder, og de går forud for
        ESG-ansvarliges regler; kun en manuel handling på en postering går forud for dem.
        Betingelserne skelner ikke mellem store og små bogstaver. Undtagelser kan også oprettes fra
        en postering og på kategorisiderne under Scope 3.
      </p>
      <p>
        <button type="button" disabled={draft !== null} onClick={() => { close(); setDraft(blankException(rules.length + 1)) }}>Ny undtagelse</button>
      </p>
      {draft && (
        <RuleEditor
          rule={draft}
          title="Ny undtagelse"
          postings={ledger.postings}
          factors={factors}
          onSave={(r) => { setRules((rs) => [...rs, r]); setDraft(null) }}
          onCancel={() => setDraft(null)}
        />
      )}
      {rules.length === 0 ? (
        <p className="muted">Ingen undtagelser endnu.</p>
      ) : (
        <>
          <RuleFilterBar
            label="Filtrer undtagelser" filter={filter} setFilter={setFilter} shown={shown.length} total={rules.length} noun={['undtagelse', 'undtagelser']}
            state={{ label: 'Status', options: [{ value: 'active', label: 'Aktive' }, { value: 'inactive', label: 'Inaktive' }] }}
          />
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">Undtagelser i rækkefølge</caption>
              <thead>
                <tr>
                  <th scope="col">Undtagelse</th>
                  <th scope="col">Betingelser</th>
                  <th scope="col">Handling</th>
                  <th scope="col">Kategori</th>
                  <th scope="col">Faktor</th>
                  <th scope="col">Begrundelse</th>
                  <th scope="col" className="num">Rammer</th>
                  <th scope="col"><span className="visually-hidden">Handlinger</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const i = rules.indexOf(r)
                  const filled = r.conditions.filter((c) => c.value.trim() !== '')
                  return [
                    <tr key={r.id}>
                      <th scope="row">{r.name}<span className="sub">{r.active ? `Nr. ${i + 1}` : `Nr. ${i + 1} · inaktiv`}</span></th>
                      <td>
                        {filled.length === 0
                          ? <span className="pending">Ingen betingelser</span>
                          : filled.map((c) => `${fieldOptions.find((o) => o.value === c.field)?.label} ${operatorOptions.find((o) => o.value === c.operator)?.label} «${c.value}»`).join(' og ')}
                      </td>
                      <td>{r.type === 'tag' ? 'Medtag' : 'Udelad'}</td>
                      <td>{r.type === 'tag' ? category(r.category) : '—'}</td>
                      <td>{r.type === 'tag' ? (factorName(r.factorId) || <span className="pending">Vælg faktor</span>) : '—'}</td>
                      <td>{r.reason}</td>
                      <td className="num">{hits(r.id)}</td>
                      <td>
                        <button type="button" className="link" data-rule-edit={r.id} aria-expanded={open === r.id} onClick={() => toggle(r.id)}>
                          {open === r.id ? 'Luk' : 'Rediger'}<span className="visually-hidden"> {r.name}</span>
                        </button>
                      </td>
                    </tr>,
                    open === r.id && (
                      <tr key={`${r.id}-edit`} className="rule-edit-row">
                        <td colSpan={8}>
                          <RuleEditor
                            rule={r}
                            title={`Undtagelse ${i + 1}`}
                            postings={ledger.postings}
                            factors={factors}
                            onSave={(saved) => { setRules((rs) => rs.map((x) => (x.id === r.id ? saved : x))); close() }}
                            onCancel={close}
                            extra={
                              <>
                                <button type="button" className="link" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Flyt ${r.name} op`}>Op</button>
                                <button type="button" className="link" disabled={i === rules.length - 1} onClick={() => move(i, i + 1)} aria-label={`Flyt ${r.name} ned`}>Ned</button>
                                <button
                                  type="button"
                                  className="link"
                                  onClick={async () => {
                                    if (!(await confirm(`Slet undtagelsen ${r.name}?`))) return
                                    setRules((rs) => rs.filter((x) => x.id !== r.id))
                                    setOpen(null)
                                  }}
                                >
                                  Slet<span className="visually-hidden"> {r.name}</span>
                                </button>
                              </>
                            }
                          />
                        </td>
                      </tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

/**
 * An exception's settings, edited on a copy: nothing changes until Gem, and Annullér leaves the
 * rule as it was. Used for a new exception, one made from a posting, and an existing one.
 */
export function RuleEditor({ rule, title, postings, factors, onSave, onCancel, extra }: {
  rule: Rule; title: string; postings: readonly Posting[]; factors: readonly Factor[]
  onSave: (rule: Rule) => void; onCancel: () => void
  /** More actions next to Gem and Annullér, such as moving or deleting the rule */
  extra?: ReactNode
}) {
  const id = useId()
  const card = useRef<HTMLFormElement>(null)
  // Braces matter: scrollIntoView returns a Promise in newer browsers, and an effect may only return a cleanup.
  useEffect(() => { card.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [])
  const [r, setR] = useState(rule)
  const [error, setError] = useState<string | null>(null)
  const change = (patch: Partial<Rule>) => setR((x) => ({ ...x, ...patch }))
  const setCondition = (cid: string, patch: Partial<Condition>) => change({ conditions: r.conditions.map((c) => (c.id === cid ? { ...c, ...patch } : c)) })
  const matches = useMemo(() => postings.filter((p) => ruleMatches(r, p)).length, [postings, r])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!r.name.trim()) return setError('Giv undtagelsen et navn.')
    if (r.conditions.every((c) => !c.value.trim())) return setError('Angiv mindst én betingelse med en værdi.')
    onSave({ ...r, name: r.name.trim(), reason: r.reason.trim() })
  }

  return (
    <form className="card" aria-labelledby={`${id}-title`} ref={card} onSubmit={submit} onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}>
      <p id={`${id}-title`} className="strong">{title}</p>
      <div className="location-settings">
        <div className="field">
          <label htmlFor={`${id}-name`}>Navn</label>
          <input id={`${id}-name`} value={r.name} autoFocus onChange={(e) => change({ name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-type`}>Handling</label>
          <select id={`${id}-type`} value={r.type} onChange={(e) => change({ type: e.target.value as Rule['type'] })}>
            <option value="tag">Medtag med faktor</option>
            <option value="exclude">Udelad</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-cat`}>Kategori</label>
          <select id={`${id}-cat`} value={r.category} onChange={(e) => change({ category: Number(e.target.value) })}>
            {scope3Categories.map((c) => <option key={c.nr} value={c.nr}>{c.nr}. {c.name}</option>)}
          </select>
        </div>
        {r.type === 'tag' && (
          <FactorSearchSelect id={`${id}-factor`} label="Faktor" value={r.factorId ?? ''} factors={factors} fits={fitsAmount} misfit="Ikke pr. beløb" emptyLabel="Vælg faktor" onChange={(factorId) => change({ factorId: factorId || null })} />
        )}
        <div className="field">
          <label htmlFor={`${id}-reason`}>Begrundelse</label>
          <input id={`${id}-reason`} value={r.reason} onChange={(e) => change({ reason: e.target.value })} />
        </div>
      </div>
      <fieldset className="conditions">
        <legend>Betingelser (alle skal være opfyldt)</legend>
        {r.conditions.map((c, ci) => (
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
            {r.conditions.length > 1 && (
              <button type="button" className="link" onClick={() => change({ conditions: r.conditions.filter((x) => x.id !== c.id) })} aria-label={`Fjern betingelse ${ci + 1}`}>Fjern</button>
            )}
          </div>
        ))}
        <button type="button" className="link" onClick={() => change({ conditions: [...r.conditions, { id: newId(), field: 'account', operator: 'is', value: '' }] })}>Tilføj betingelse</button>
      </fieldset>
      <div className="rule-footer">
        <label className="check">
          <input type="checkbox" checked={r.active} onChange={(e) => change({ active: e.target.checked })} />
          Aktiv
        </label>
        <span className={matches ? 'strong' : 'muted'}>{formatNumber(matches, 0)} {matches === 1 ? 'postering passer' : 'posteringer passer'}</span>
        {r.type === 'tag' && !r.factorId && <span className="warning-text">Vælg en faktor — ellers afventer posteringerne</span>}
        <span className="spacer" />
        {extra}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="submit">Gem</button>{' '}
        <button type="button" className="secondary" onClick={onCancel}>Annullér</button>
      </div>
    </form>
  )
}

type StandardProps = { ledger: LedgerState; setLedger: Dispatch<SetStateAction<LedgerState>>; classified: ClassifiedPosting[]; factors: readonly Factor[] }

/** Kontoplan → Regler: the ESG owner's posting rules (with this company's changes), account rules and factor register. */
export function StandardRulesSection({ ledger, setLedger, classified, factors }: StandardProps) {
  return (
    <>
      <p className="lead">
        Den første regel, der passer, vinder: først dine undtagelser, så ESG-ansvarliges
        posteringsregler, og til sidst kontoreglen. En manuel handling på en postering går forud for
        alle regler. En regel medtager eller udelader.
      </p>
      <PostingRulesTable edits={ledger.ruleEdits} setLedger={setLedger} classified={classified} factors={factors} />
      <AccountRulesTable />
      <FactorRegisterTable />
    </>
  )
}

/** The ESG owner's posting rules, with this company's changes; each can be changed or restored. */
function PostingRulesTable({ edits, setLedger, classified, factors }: {
  edits: PostingRuleEdit[]; setLedger: Dispatch<SetStateAction<LedgerState>>; classified: ClassifiedPosting[]; factors: readonly Factor[]
}) {
  const { open, close, toggle } = useOpenRow()
  const [filter, setFilter] = useState<RuleFilter>(emptyRuleFilter)
  const rules = withRuleEdits(builtinRuleBook, edits).postingRules
  const hits = (id: string) => classified.filter((c) => c.hit.kind === 'posting' && c.hit.rule.id === id).length
  const factorName = (id: string | null) => (id ? (factors.find((f) => f.id === id)?.name ?? id) : '')
  const ruleFactor = (r: EffectivePostingRule) => (r.edit ? (factorName(r.edit.factorId) || 'Kontoens') : (r.factorCode ?? ''))
  const shown = filterPostingRules(rules, filter, ruleFactor)
  const setEdits = (f: (es: PostingRuleEdit[]) => PostingRuleEdit[]) => setLedger((l) => ({ ...l, ruleEdits: f(l.ruleEdits) }))
  const changed = edits.length

  return (
    <section aria-labelledby="posting-rules-heading">
      <h2 id="posting-rules-heading">Posteringsregler ({rules.length}{changed ? `, ${changed} ændret` : ''})</h2>
      <p className="muted">
        ESG-ansvarliges godkendte regler. Søgeordet matcher præcis som skrevet, med store og små
        bogstaver og mellemrum, i posteringstekst og leverandør, og reglerne gælder kun posteringer
        på konti, der medtages. Du kan ændre en regels handling, faktor og kategori for denne
        virksomhed; den godkendte regel kan altid gendannes.
      </p>
      <RuleFilterBar
        label="Filtrer posteringsregler" filter={filter} setFilter={setFilter} shown={shown.length} total={rules.length} noun={['posteringsregel', 'posteringsregler']}
        state={{ label: 'Ændret', options: [{ value: 'changed', label: 'Ændret for virksomheden' }, { value: 'approved', label: 'Som godkendt' }] }}
      />
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
              <th scope="col"><span className="visually-hidden">Handlinger</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => [
              <tr key={r.id}>
                <th scope="row">{r.id}<span className="sub">Prioritet {r.priority}</span></th>
                <td><code>{`«${r.searchWord}»`}</code></td>
                <td>{category(r.appliesTo) || 'Alle'}</td>
                <td>{handlingLabels[r.handling]}</td>
                <td>{ruleFactor(r) || '—'}</td>
                <td>{category(r.moveTo) || '—'}</td>
                <td>
                  {r.reason}
                  <span className="sub">
                    {r.edit
                      ? <>Ændret {r.edit.editedOn ? formatDate(r.edit.editedOn) : ''} · godkendt: {handlingLabels[postingRuleById(r.id)?.handling ?? r.handling]}</>
                      : <>Godkendt {r.approvedOn ? formatDate(r.approvedOn) : '—'}</>}
                  </span>
                </td>
                <td className="num">{hits(r.id)}</td>
                <td>
                  <button type="button" className="link" data-rule-edit={r.id} aria-expanded={open === r.id} onClick={() => toggle(r.id)}>
                    {open === r.id ? 'Luk' : 'Rediger'}<span className="visually-hidden"> {r.id}</span>
                  </button>
                </td>
              </tr>,
              open === r.id && (
                <tr key={`${r.id}-edit`} className="rule-edit-row">
                  <td colSpan={9}>
                    <PostingRuleEditor
                      rule={r}
                      factors={factors}
                      onSave={(edit) => { setEdits((es) => [...es.filter((e) => e.ruleId !== r.id), edit]); close() }}
                      onRestore={() => { setEdits((es) => es.filter((e) => e.ruleId !== r.id)); close() }}
                      onCancel={close}
                    />
                  </td>
                </tr>
              ),
            ])}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const postingRuleById = (id: string) => builtinRuleBook.postingRules.find((r) => r.id === id)

function PostingRuleEditor({ rule, factors, onSave, onRestore, onCancel }: {
  rule: EffectivePostingRule; factors: readonly Factor[]
  onSave: (edit: PostingRuleEdit) => void; onRestore: () => void; onCancel: () => void
}) {
  const id = useId()
  // An unchanged rule starts from its approved factor, resolved to the factor table.
  const [handling, setHandling] = useState<PostingHandling>(rule.handling)
  const [factorId, setFactorId] = useState<string | null>(rule.edit ? rule.edit.factorId : builtinRuleBook.factorFor(rule.factorCode))
  const [moveTo, setMoveTo] = useState<number | null>(rule.moveTo)
  const [reason, setReason] = useState(rule.reason)
  const chosen = factors.find((f) => f.id === factorId)

  return (
    <form
      className="card"
      aria-labelledby={`${id}-title`}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ id: rule.edit?.id ?? newId(), ruleId: rule.id, handling, factorId, moveTo, reason: reason.trim(), editedOn: today() })
      }}
    >
      <p id={`${id}-title`} className="strong">Ret {rule.id} «{rule.searchWord}» for denne virksomhed</p>
      <div className="location-settings">
        <div className="field">
          <label htmlFor={`${id}-handling`}>Handling</label>
          <select id={`${id}-handling`} value={handling} autoFocus onChange={(e) => setHandling(e.target.value as PostingHandling)}>
            {(Object.keys(handlingLabels) as PostingHandling[]).map((h) => <option key={h} value={h}>{handlingLabels[h]}</option>)}
          </select>
        </div>
        {handling !== 'exclude' && (
          <>
            <FactorSearchSelect id={`${id}-factor`} label="Faktor" value={factorId ?? ''} factors={factors} fits={fitsAmount} misfit="Ikke pr. beløb" emptyLabel="Kontoens faktor" allowEmpty onChange={(v) => setFactorId(v || null)} />
            <div className="field">
              <label htmlFor={`${id}-move`}>Flyt til kategori</label>
              <select id={`${id}-move`} value={moveTo ?? ''} onChange={(e) => setMoveTo(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Kontoens kategori</option>
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
      {handling === 'include' && chosen?.value === null && (
        <p className="warning-text">{chosen.name} har endnu ingen værdi; posteringerne afventer, til den er udfyldt under Faktorer.</p>
      )}
      <div className="actions">
        <button type="submit">Gem</button>{' '}
        {rule.edit && <><button type="button" className="secondary" onClick={onRestore}>Gendan godkendt regel</button>{' '}</>}
        <button type="button" className="secondary" onClick={onCancel}>Annullér</button>
      </div>
    </form>
  )
}

function AccountRulesTable() {
  const [filter, setFilter] = useState<RuleFilter>(emptyRuleFilter)
  const shown = filterAccountRules(accountRules, filter)
  return (
    <section aria-labelledby="account-rules-heading">
      <h2 id="account-rules-heading">Kontoregler ({accountRules.length})</h2>
      <p className="muted">ESG-ansvarliges godkendte kontoregler. De ændres i koden, så hver ændring bliver gennemgået.</p>
      <RuleFilterBar label="Filtrer kontoregler" filter={filter} setFilter={setFilter} shown={shown.length} total={accountRules.length} noun={['kontoregel', 'kontoregler']} />
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
            {shown.map((r) => (
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
    </section>
  )
}

function FactorRegisterTable() {
  return (
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
  )
}
