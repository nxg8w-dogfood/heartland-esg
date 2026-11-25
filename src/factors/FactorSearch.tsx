// Choosing an emission factor, the same way everywhere: search every factor in the table by name,
// source or country, narrow by country, and see each one's source, name, value, unit and year.
// Factors of any scope can be chosen. Only a factor whose unit fits what it's used on can be
// picked: a ledger posting is an amount, so it takes a factor per unit of money.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { factorRegions, factorYear, factorsInRegion, oneOfEachFamily, searchFactors } from '../calc/factorSearch'
import type { Factor } from '../data/factors'
import { formatFactor, formatNumber } from '../format'
import { factorLabel } from './label'

const LIMIT = 50

type ListProps = {
  /** Every factor in the table; a family of dated versions is offered once */
  factors: readonly Factor[]
  /** Whether a factor's unit fits where it's used */
  fits: (f: Factor) => boolean
  /** Why the others can't be chosen here, e.g. "Kan ikke bruges på et beløb" */
  misfit: string
  selectedId: string
  onPick: (factorId: string) => void
}

/** The search and the factors that match it, each chosen with its own button. */
export function FactorSearchList({ factors, fits, misfit, selectedId, onPick }: ListProps) {
  const id = useId()
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => search.current?.focus(), [])
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('')
  const offered = useMemo(() => oneOfEachFamily(factors), [factors])
  const regions = useMemo(() => factorRegions(offered), [offered])
  const found = useMemo(() => {
    const hits = searchFactors(factorsInRegion(offered, region), query)
    return [...hits.filter(fits), ...hits.filter((f) => !fits(f))]
  }, [offered, region, query, fits])
  const usable = found.filter(fits).length

  return (
    <div className="factor-search-list">
      <div className="location-settings">
        <div className="field wide">
          <label htmlFor={`${id}-q`}>Søg faktor</label>
          <input id={`${id}-q`} ref={search} type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-describedby={`${id}-hint ${id}-count`} />
          <span id={`${id}-hint`} className="muted">Navn, kilde eller land. Flere ord skal alle passe.</span>
        </div>
        <div className="field">
          <label htmlFor={`${id}-region`}>Land/område</label>
          <select id={`${id}-region`} value={region} onChange={(e) => setRegion(e.target.value)} aria-describedby={`${id}-count`}>
            <option value="">Alle lande og områder</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <p id={`${id}-count`} className="muted" role="status">
        {usable === 0 ? 'Ingen faktorer, der kan bruges her, passer.' : `${formatNumber(usable, 0)} ${usable === 1 ? 'faktor kan' : 'faktorer kan'} bruges her.`}
        {found.length > usable && ` ${formatNumber(found.length - usable, 0)} i andre enheder passer på søgningen, men kan ikke vælges.`}
        {found.length > LIMIT && ` Viser de første ${LIMIT}; søg for at indsnævre.`}
      </p>
      {found.length > 0 && (
        <div className="table-wrap">
          <table className="factor-search-table">
            <caption className="visually-hidden">Faktorer, der passer på søgningen</caption>
            <thead>
              <tr>
                <th scope="col">Kilde</th>
                <th scope="col">Navn</th>
                <th scope="col" className="num">Faktor</th>
                <th scope="col">Enhed</th>
                <th scope="col">Faktorår</th>
                <th scope="col"><span className="visually-hidden">Vælg</span></th>
              </tr>
            </thead>
            <tbody>
              {found.slice(0, LIMIT).map((f) => {
                const ok = fits(f)
                return (
                  <tr key={f.id} className={ok ? undefined : 'muted'}>
                    <td>{f.source}</td>
                    <th scope="row">{factorLabel(f)}</th>
                    <td className="num">{f.value === null ? <span className="pending">Mangler</span> : formatFactor(f.value)}</td>
                    <td>{f.unit}</td>
                    <td>{factorYear(f, factors) ?? '—'}</td>
                    <td>
                      {ok ? (
                        <button type="button" className="link" onClick={() => onPick(f.id)} aria-current={selectedId === f.id || undefined}>
                          {selectedId === f.id ? 'Valgt' : 'Vælg'}<span className="visually-hidden"> {factorLabel(f)}, {f.source}</span>
                        </button>
                      ) : (
                        <span className="sub">{misfit}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

type SelectProps = Omit<ListProps, 'selectedId' | 'onPick'> & {
  id: string
  label: string
  /** Shown to screen readers only, e.g. in a table cell */
  hideLabel?: boolean
  /** The chosen factor's id, or '' for none */
  value: string
  /** What '' means here, e.g. "Vælg faktor", "Kontoens faktor" or "Egen faktor" */
  emptyLabel: string
  /** Offer '' as a choice too, e.g. to go back to the account's factor */
  allowEmpty?: boolean
  onChange: (factorId: string) => void
  /** The label of a chosen factor that is no longer in the table */
  keptLabel?: string
  /** Show the chosen factor's value and unit on the button; off where they are shown next to it */
  showValue?: boolean
}

/**
 * A factor field: a button naming the chosen factor that opens the search in a dialog, so it
 * works the same in a form and in a table cell. Choosing a factor, Annullér or Escape closes it,
 * and focus goes back to the button.
 */
export function FactorSearchSelect({ id, label, hideLabel, value, emptyLabel, allowEmpty, onChange, keptLabel, showValue = true, ...list }: SelectProps) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialog.current
    if (open && d && !d.open) d.showModal()
  }, [open])
  const chosen = list.factors.find((f) => f.id === value)
  const close = () => {
    dialog.current?.close()
    setOpen(false)
    button.current?.focus()
  }
  const pick = (factorId: string) => {
    onChange(factorId)
    close()
  }
  const name = chosen
    ? `${factorLabel(chosen)}${chosen.value === null ? ' (faktor mangler)' : showValue ? ` · ${formatFactor(chosen.value)} ${chosen.unit}` : ''}`
    : value ? (keptLabel || value) : emptyLabel

  return (
    <div className="field factor-search">
      <label id={`${id}-label`} htmlFor={id} className={hideLabel ? 'visually-hidden' : undefined}>{label}</label>
      <button
        type="button"
        id={id}
        ref={button}
        className="factor-search-button"
        aria-labelledby={`${id}-label ${id}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {name}
      </button>
      <dialog ref={dialog} className="context-dialog factor-search-dialog" aria-labelledby={`${id}-title`} onCancel={(e) => { e.preventDefault(); close() }}>
        {open && (
          <>
            <h2 id={`${id}-title`}>{label}</h2>
            <FactorSearchList {...list} selectedId={value} onPick={pick} />
            <div className="dialog-actions">
              {allowEmpty && <><button type="button" className="secondary" onClick={() => pick('')}>{emptyLabel}</button>{' '}</>}
              <button type="button" className="secondary" onClick={close}>Annullér</button>
            </div>
          </>
        )}
      </dialog>
    </div>
  )
}
