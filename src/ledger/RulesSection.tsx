// The rules on Kontoplan, shown the same way: the user's exceptions, the ESG owner's posting
// rules and account rules, and the factor register, each as a table that's folded until opened.
// An exception or a posting rule is edited in place from its row (docs/adr/0015, 0018).

import { useId, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Factor } from '../data/factors'
import { accountRules } from '../data/scope3Rules'
import { spendFactorRegister } from '../data/spendFactorRegister'
import { handlingLabels, type PostingHandling } from '../calc/spendRules'
import { scope3Categories } from '../calc/scope3'
import {
  builtinRuleBook, withRuleEdits,
  type ClassifiedPosting, type Condition, type ConditionField, type ConditionOperator, type EffectivePostingRule, type PostingRuleEdit, type Rule,
} from '../calc/ledger'
import type { LedgerState } from './state'
import { formatDate } from '../format'
import { newId } from '../newId'
import { useConfirm } from '../confirm'

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

type Props = { ledger: LedgerState; setLedger: Dispatch<SetStateAction<LedgerState>>; classified: ClassifiedPosting[]; spendFactors: Factor[] }

export function RulesSection({ ledger, setLedger, classified, spendFactors }: Props) {
  // Which row's editor is open: an exception's id, or a posting rule's RegelID.
  const [open, setOpen] = useState<string | null>(null)
  const [exceptionsOpen, setExceptionsOpen] = useState(false)
  // The button that opened an editor gets focus back when it closes.
  const opener = useRef<HTMLElement | null>(null)
  const close = () => {
    setOpen(null)
    const el = opener.current
    requestAnimationFrame(() => el?.focus())
  }
  const toggle = (key: string, button: HTMLElement) => {
    if (open === key) return close()
    opener.current = button
    setOpen(key)
  }

  return (
    <section aria-labelledby="rules-heading">
      <h2 id="rules-heading">Regler</h2>
      <p className="muted">
        Den første regel, der passer, vinder: først dine undtagelser, så ESG-ansvarliges
        posteringsregler, og til sidst kontoreglen. En manuel handling på en postering går forud for
        alle regler. Undtagelser kan også oprettes fra en postering på kategorisiderne under Scope 3.
      </p>
      <ExceptionsTable
        rules={ledger.rules}
        setLedger={setLedger}
        classified={classified}
        spendFactors={spendFactors}
        open={open}
        detailsOpen={exceptionsOpen}
        setDetailsOpen={setExceptionsOpen}
        onToggle={toggle}
        onCreated={(id) => { opener.current = null; setExceptionsOpen(true); setOpen(id) }}
        onClose={close}
      />
      <PostingRulesTable
        edits={ledger.ruleEdits}
        setLedger={setLedger}
        classified={classified}
        spendFactors={spendFactors}
        open={open}
        onToggle={toggle}
        onClose={close}
      />
      <AccountRulesTable />
      <FactorRegisterTable />
    </section>
  )
}

function ExceptionsTable({ rules, setLedger, classified, spendFactors, open, detailsOpen, setDetailsOpen, onToggle, onCreated, onClose }: {
  rules: Rule[]; setLedger: Dispatch<SetStateAction<LedgerState>>; classified: ClassifiedPosting[]; spendFactors: Factor[]
  open: string | null; detailsOpen: boolean; setDetailsOpen: (open: boolean) => void
  onToggle: (key: string, button: HTMLElement) => void; onCreated: (id: string) => void; onClose: () => void
}) {
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
  const hits = (ruleId: string) => classified.filter((c) => c.hit.kind === 'exception' && c.hit.rule.id === ruleId).length
  const factorName = (id: string | null) => (id ? (spendFactors.find((f) => f.id === id)?.name ?? id) : '')
  const { confirm, dialog } = useConfirm()

  return (
    <details open={detailsOpen} onToggle={(e) => setDetailsOpen(e.currentTarget.open)}>
      {dialog}
      <summary>Undtagelser ({rules.length})</summary>
      <p className="muted">
        Dine egne regler for denne virksomhed. De går forud for standardreglerne, og betingelserne
        skelner ikke mellem store og små bogstaver.
      </p>
      <p>
        <button
          type="button"
          onClick={() => {
            const id = newId()
            setRules((rs) => [...rs, { id, name: `Undtagelse ${rs.length + 1}`, type: 'tag', active: true, conditions: [{ id: newId(), field: 'account', operator: 'is', value: '' }], factorId: null, category: 1, reason: '' }])
            onCreated(id)
          }}
        >
          Ny undtagelse
        </button>
      </p>
      {rules.length === 0 ? (
        <p className="muted">Ingen undtagelser endnu.</p>
      ) : (
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
              {rules.map((r, i) => {
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
                      <button type="button" className="link" aria-expanded={open === r.id} onClick={(e) => onToggle(r.id, e.currentTarget)}>
                        {open === r.id ? 'Luk' : 'Rediger'}<span className="visually-hidden"> {r.name}</span>
                      </button>
                    </td>
                  </tr>,
                  open === r.id && (
                    <tr key={`${r.id}-edit`} className="rule-edit-row">
                      <td colSpan={8}>
                        <RuleCard
                          rule={r}
                          index={i}
                          count={rules.length}
                          matches={hits(r.id)}
                          spendFactors={spendFactors}
                          onChange={(patch) => update(r.id, patch)}
                          onMove={(to) => move(i, to)}
                          onDelete={async () => {
                            if (!(await confirm(`Slet undtagelsen ${r.name}?`))) return
                            setRules((rs) => rs.filter((x) => x.id !== r.id))
                            onClose()
                          }}
                          onClose={onClose}
                        />
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>
      )}
    </details>
  )
}

function RuleCard({ rule, index, count, matches, spendFactors, onChange, onMove, onDelete, onClose }: {
  rule: Rule; index: number; count: number; matches: number; spendFactors: Factor[]
  onChange: (patch: Partial<Rule>) => void; onMove: (to: number) => void; onDelete: () => void; onClose: () => void
}) {
  const id = useId()
  const setCondition = (cid: string, patch: Partial<Condition>) => onChange({ conditions: rule.conditions.map((c) => (c.id === cid ? { ...c, ...patch } : c)) })
  return (
    <div className="card" role="group" aria-labelledby={`${id}-name-label`}>
      <div className="location-settings">
        <div className="field">
          <label id={`${id}-name-label`} htmlFor={`${id}-name`}>Undtagelse {index + 1}</label>
          <input id={`${id}-name`} value={rule.name} autoFocus onChange={(e) => onChange({ name: e.target.value })} />
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
            <FactorSelect id={`${id}-factor`} value={rule.factorId} factors={spendFactors} emptyLabel="Vælg faktor" onChange={(factorId) => onChange({ factorId })} />
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
        <button type="button" className="secondary" onClick={onClose}>Luk</button>
      </div>
    </div>
  )
}

function FactorSelect({ id, value, factors, emptyLabel, onChange }: { id: string; value: string | null; factors: Factor[]; emptyLabel: string; onChange: (id: string | null) => void }) {
  return (
    <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{emptyLabel}</option>
      {factors.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}, {f.region}{f.value === null ? ' (faktor mangler)' : ''}
        </option>
      ))}
    </select>
  )
}

/** The ESG owner's posting rules, with this company's changes; each can be changed or restored. */
function PostingRulesTable({ edits, setLedger, classified, spendFactors, open, onToggle, onClose }: {
  edits: PostingRuleEdit[]; setLedger: Dispatch<SetStateAction<LedgerState>>; classified: ClassifiedPosting[]; spendFactors: Factor[]
  open: string | null; onToggle: (key: string, button: HTMLElement) => void; onClose: () => void
}) {
  const rules = withRuleEdits(builtinRuleBook, edits).postingRules
  const hits = (id: string) => classified.filter((c) => c.hit.kind === 'posting' && c.hit.rule.id === id).length
  const factorName = (id: string | null) => (id ? (spendFactors.find((f) => f.id === id)?.name ?? id) : '')
  const setEdits = (f: (es: PostingRuleEdit[]) => PostingRuleEdit[]) => setLedger((l) => ({ ...l, ruleEdits: f(l.ruleEdits) }))
  const changed = edits.length

  return (
    <details>
      <summary>Posteringsregler ({rules.length}{changed ? `, ${changed} ændret` : ''})</summary>
      <p className="muted">
        ESG-ansvarliges godkendte regler. Søgeordet matcher præcis som skrevet, med store og små
        bogstaver og mellemrum, i posteringstekst og leverandør, og reglerne gælder kun posteringer
        på konti, der medtages. Du kan ændre en regels handling, faktor og kategori for denne
        virksomhed; den godkendte regel kan altid gendannes.
      </p>
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
            {rules.map((r) => [
              <tr key={r.id}>
                <th scope="row">{r.id}<span className="sub">Prioritet {r.priority}</span></th>
                <td><code>{`«${r.searchWord}»`}</code></td>
                <td>{category(r.appliesTo) || 'Alle'}</td>
                <td>{handlingLabels[r.handling]}</td>
                <td>{r.edit ? (factorName(r.edit.factorId) || 'Kontoens') : (r.factorCode ?? '—')}</td>
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
                  <button type="button" className="link" aria-expanded={open === r.id} onClick={(e) => onToggle(r.id, e.currentTarget)}>
                    {open === r.id ? 'Luk' : 'Rediger'}<span className="visually-hidden"> {r.id}</span>
                  </button>
                </td>
              </tr>,
              open === r.id && (
                <tr key={`${r.id}-edit`} className="rule-edit-row">
                  <td colSpan={9}>
                    <PostingRuleEditor
                      rule={r}
                      spendFactors={spendFactors}
                      onSave={(edit) => { setEdits((es) => [...es.filter((e) => e.ruleId !== r.id), edit]); onClose() }}
                      onRestore={() => { setEdits((es) => es.filter((e) => e.ruleId !== r.id)); onClose() }}
                      onCancel={onClose}
                    />
                  </td>
                </tr>
              ),
            ])}
          </tbody>
        </table>
      </div>
    </details>
  )
}

const postingRuleById = (id: string) => builtinRuleBook.postingRules.find((r) => r.id === id)

function PostingRuleEditor({ rule, spendFactors, onSave, onRestore, onCancel }: {
  rule: EffectivePostingRule; spendFactors: Factor[]
  onSave: (edit: PostingRuleEdit) => void; onRestore: () => void; onCancel: () => void
}) {
  const id = useId()
  // An unchanged rule starts from its approved factor, resolved to the factor table.
  const [handling, setHandling] = useState<PostingHandling>(rule.handling)
  const [factorId, setFactorId] = useState<string | null>(rule.edit ? rule.edit.factorId : builtinRuleBook.factorFor(rule.factorCode))
  const [moveTo, setMoveTo] = useState<number | null>(rule.moveTo)
  const [reason, setReason] = useState(rule.reason)
  const chosen = spendFactors.find((f) => f.id === factorId)

  return (
    <form
      className="card"
      aria-labelledby={`${id}-title`}
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
            <div className="field">
              <label htmlFor={`${id}-factor`}>Faktor</label>
              <FactorSelect id={`${id}-factor`} value={factorId} factors={spendFactors} emptyLabel="Kontoens faktor" onChange={setFactorId} />
            </div>
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
      {handling === 'pending' && <p className="muted">Afventer: posteringerne vises, men tæller ikke med, før reglen er afgjort.</p>}
      {handling !== 'exclude' && handling !== 'pending' && chosen?.value === null && (
        <p className="warning-text">{chosen.name} har endnu ingen værdi; posteringerne afventer, til den er udfyldt under Faktorer.</p>
      )}
      <div className="actions">
        <button type="submit">Gem ændring</button>{' '}
        {rule.edit && <><button type="button" className="secondary" onClick={onRestore}>Gendan godkendt regel</button>{' '}</>}
        <button type="button" className="secondary" onClick={onCancel}>Annullér</button>
      </div>
    </form>
  )
}

function AccountRulesTable() {
  return (
    <details>
      <summary>Kontoregler ({accountRules.length})</summary>
      <p className="muted">ESG-ansvarliges godkendte kontoregler. De ændres i koden, så hver ændring bliver gennemgået.</p>
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
