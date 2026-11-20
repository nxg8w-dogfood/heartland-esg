import { Fragment, useEffect, useId, useState } from 'react'
import type { Factor } from '../data/factors'
import { derivedFactors } from '../data/derivedFactors'
import { isMunicipalityGrid } from '../data/municipalityGridFactors'
import type { FactorPublication } from '../data/factorPublications'
import { apiProviders, sourceOptions, type FactorSourceChoice, type FactorSources } from '../calc/factorSources'
import { parseNumber } from '../calc/parseNumber'
import { formatDate, formatFactor } from '../format'
import { InfoTip } from '../ui'

type Props = {
  /** The factor table as shipped */
  base: readonly Factor[]
  /** The factor table with each factor's chosen source applied */
  factors: readonly Factor[]
  publications: readonly FactorPublication[]
  sources: FactorSources
  onChoose: (id: string, choice: FactorSourceChoice) => void
}

export function FactorsPage({ base, factors, publications, sources, onChoose }: Props) {
  const pending = factors.filter((f) => f.value === null)
  const pendingIds = new Set(pending.map((f) => f.id))
  const scopes = ['Scope 1', 'Scope 2', 'Scope 3'] as const
  // The open folds. A fold's table, with a source picker on every row, is drawn only once it's
  // opened: the factors per municipality alone are hundreds of rows.
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const toggle = (key: string, isOpen: boolean) =>
    setOpen((o) => (o.has(key) === isOpen ? o : isOpen ? new Set(o).add(key) : new Set([...o].filter((k) => k !== key))))
  // The factors whose details are unfolded below their row.
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set())
  const [jumpTo, setJumpTo] = useState<string | null>(null)
  useEffect(() => {
    if (!jumpTo) return
    document.getElementById(`factor-${jumpTo}`)?.scrollIntoView()
    setJumpTo(null)
  }, [jumpTo])
  const groupKey = (f: Factor) => (isMunicipalityGrid(f) ? `${f.scope}|kommune` : `${f.scope}|${f.category}`)

  const table = (list: readonly Factor[]) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Faktor</th>
            <th scope="col" className="num">Værdi</th>
            <th scope="col">Enhed</th>
            <th scope="col">Kilde</th>
            <th scope="col">Gyldig</th>
            <th scope="col" className="num">Faktorår</th>
          </tr>
        </thead>
        <tbody>
          {list.map((f) => {
            const applied = factors.find((x) => x.id === f.id) ?? f
            const expanded = shown.has(f.id)
            return (
              <Fragment key={f.id}>
                <tr id={`factor-${f.id}`} className={expanded ? 'factor-row expanded' : 'factor-row'}>
                  <th scope="row">
                    <button
                      type="button"
                      className="row-toggle"
                      aria-expanded={expanded}
                      aria-controls={`factor-${f.id}-details`}
                      onClick={() => setShown((o) => { const n = new Set(o); if (expanded) n.delete(f.id); else n.add(f.id); return n })}
                    >
                      <span className="visually-hidden">{expanded ? 'Skjul detaljer for ' : 'Vis detaljer for '}</span>
                      {f.name}
                    </button>
                    {f.note && <> <InfoTip label={`Note om ${f.name}, ${f.region}`}>{f.note}</InfoTip></>}
                    <span className="sub">{f.region}</span>
                  </th>
                  <td className="num">
                    {applied.value === null ? <span className="pending">Afventer</span> : formatFactor(applied.value)}
                  </td>
                  <td>{f.unit}</td>
                  <td>
                    <SourcePicker key={optionKey(sources[f.id])} factor={f} publications={publications} choice={sources[f.id]} onChoose={(c) => onChoose(f.id, c)} />
                  </td>
                  <td>{validity(f)}</td>
                  <td className="num">{f.priceYear ?? '—'}</td>
                </tr>
                {expanded && (
                  <tr id={`factor-${f.id}-details`} className="factor-details">
                    <td colSpan={6}>
                      <FactorDetails factor={f} applied={applied} base={base} publications={publications} choice={sources[f.id]} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  // A fold of factors: its name and counts on one line, the table once opened.
  const fold = (key: string, title: string, list: readonly Factor[], note?: string) => {
    const waiting = list.filter((f) => pendingIds.has(f.id)).length
    return (
      <details key={key} className="fold" open={open.has(key)} onToggle={(e) => toggle(key, e.currentTarget.open)}>
        <summary>
          <span className="fold-title">{title}</span>
          {note && <> <InfoTip label={`Om ${title}`}>{note}</InfoTip></>}
          <span className="fold-count">
            {list.length} {list.length === 1 ? 'faktor' : 'faktorer'}
            {waiting > 0 && <span className="pending">{waiting} afventer</span>}
          </span>
        </summary>
        {open.has(key) && table(list)}
      </details>
    )
  }

  return (
    <>
      <p className="lead">
        {base.length} emissionsfaktorer. Vælg for hver faktor, hvor værdien kommer fra.{' '}
        <InfoTip label="Om faktortabellen">
          Faktortabellen fra det oprindelige klimaregnskab, med kilde, enhed og gyldighed. Værdien kan
          komme fra den indbyggede tabel, en officiel publikation, et API eller en anden kilde, du
          angiver selv. Valget gemmes med kilde og dato. Faktorer uden værdi må ikke gættes.
        </InfoTip>
      </p>

      <div className="folds">
        <details className="fold" open={open.has('pending')} onToggle={(e) => toggle('pending', e.currentTarget.open)}>
          <summary>
            <span className="fold-title">Afventer en kilde</span>
            <span className="fold-count">{pending.length === 0 ? 'Alle faktorer har en værdi' : <span className="pending">{pending.length} faktorer</span>}</span>
          </summary>
          {pending.length > 0 && (
            <ul className="plain pending-list">
              {pending.map((f) => (
                <li key={f.id}>
                  <a href={`#factor-${f.id}`} onClick={(e) => { e.preventDefault(); toggle(groupKey(f), true); setJumpTo(f.id) }}>
                    {f.name}
                  </a>{' '}
                  <span className="muted">{f.region}</span>
                  {f.note && <> <InfoTip label={`Note om ${f.name}, ${f.region}`}>{f.note}</InfoTip></>}
                </li>
              ))}
            </ul>
          )}
        </details>

        <details className="fold" open={open.has('publications')} onToggle={(e) => toggle('publications', e.currentTarget.open)}>
          <summary>
            <span className="fold-title">Publikationer</span>{' '}
            <InfoTip label="Om publikationer">Vælg en publikation for den enkelte faktor nedenfor, eller for alle de faktorer, den indeholder.</InfoTip>
            <span className="fold-count">{publications.length}</span>
          </summary>
          <ul className="plain publications">
            {publications.map((p) => {
              const ids = Object.keys(p.values)
              const using = ids.filter((id) => { const c = sources[id]; return c?.kind === 'publication' && c.publicationId === p.id }).length
              return (
                <li key={p.id}>
                  <strong>{p.name}</strong>{' '}
                  <InfoTip label={`Om ${p.name}`}>
                    {p.publisher}, udgivet {formatDate(p.published)}, kontrolleret {formatDate(p.checked)}. {p.note}
                  </InfoTip>
                  {p.url && <> <a href={p.url} target="_blank" rel="noreferrer">Kilde</a></>}
                  <div className="publication-use">
                    <span className="muted" role="status">Bruges for {using} af {ids.length} faktorer.</span>
                    <button type="button" className="secondary" disabled={using === ids.length} onClick={() => ids.forEach((id) => onChoose(id, { kind: 'publication', publicationId: p.id }))}>
                      Brug for alle {ids.length}
                    </button>
                    <button type="button" className="secondary" disabled={using === 0} onClick={() => ids.forEach((id) => { const c = sources[id]; if (c?.kind === 'publication' && c.publicationId === p.id) onChoose(id, { kind: 'builtin' }) })}>
                      Tilbage til indbygget tabel
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </details>

        <details className="fold" open={open.has('api')} onToggle={(e) => toggle('api', e.currentTarget.open)}>
          <summary>
            <span className="fold-title">API-kilder</span>
            <span className="fold-count">{apiProviders.filter((a) => !a.unavailable).length} af {apiProviders.length} tilgængelige</span>
          </summary>
          <ul className="plain pending-list">
            {apiProviders.map((a) => (
              <li key={a.id}>
                <strong>{a.name}</strong>{' '}
                {a.unavailable ? <><span className="muted">ikke tilgængelig endnu</span> <InfoTip label={`Om ${a.name}`}>{a.unavailable}</InfoTip></> : <span className="muted">tilgængelig</span>}
              </li>
            ))}
          </ul>
        </details>
      </div>

      {scopes.map((scope) => {
        const own = base.filter((f) => f.scope === scope && !isMunicipalityGrid(f))
        const perMunicipality = base.filter((f) => f.scope === scope && isMunicipalityGrid(f))
        const categories = [...new Set(own.map((f) => f.category))]
        return (
          <section key={scope} aria-labelledby={`factors-${scope}`}>
            <h2 id={`factors-${scope}`}>{scope}</h2>
            <div className="folds">
              {categories.map((c) => fold(`${scope}|${c}`, c, own.filter((f) => f.category === c)))}
              {perMunicipality.length > 0 && fold(
                `${scope}|kommune`,
                'Elmiks pr. kommune',
                perMunicipality,
                'Energinets lokationsbaserede deklaration for hver kommune og hvert år. En lokation med en kommune bruger kommunens faktor; år uden den bruger prisområdets.',
              )}
            </div>
          </section>
        )
      })}
    </>
  )
}

/** Everything known about a factor: the built-in figures, what each source offers, and the family's other years. */
export function FactorDetails({ factor: f, applied, base, publications, choice }: {
  factor: Factor
  applied: Factor
  base: readonly Factor[]
  publications: readonly FactorPublication[]
  choice: FactorSourceChoice | undefined
}) {
  const value = (v: number | null) => (v === null ? <span className="pending">ingen værdi</span> : <>{formatFactor(v)} {f.unit}</>)
  const derived = derivedFactors.find((d) => d.id === f.id)
  const family = f.family ? base.filter((x) => x.family === f.family && x.id !== f.id) : []
  const offered = publications.filter((p) => f.id in p.values)
  return (
    <div className="factor-detail-grid">
      <dl className="facts">
        <dt>Indbygget værdi</dt><dd>{value(f.value)}</dd>
        <dt>Indbygget kilde</dt><dd>{f.source}</dd>
        {f.reference && f.reference !== f.source && <><dt>Reference</dt><dd>{f.reference}</dd></>}
        {derived && <><dt>Beregnet</dt><dd>{formatFactor(derived.kWhPerKm)} kWh/km ({derived.basis}) × elfaktoren {derived.gridId}</dd></>}
        <dt>Bruges nu</dt>
        <dd>
          {value(applied.value)}, {choice?.kind === 'manual' ? `indtastet: ${choice.source}${choice.date ? `, ${formatDate(choice.date)}` : ''}` : applied.source}
          {applied.reference && applied.reference !== applied.source && choice?.kind !== 'manual' && <span className="sub">{applied.reference}</span>}
        </dd>
        <dt>Metode</dt><dd>{f.method === 'spend' ? 'Spendbaseret' : 'Aktivitetsbaseret'}</dd>
        <dt>Gyldig</dt><dd>{validity(f)}</dd>
        {f.priceYear && <><dt>Faktorår</dt><dd>{f.priceYear}</dd></>}
        {f.note && <><dt>Note</dt><dd>{f.note}</dd></>}
        <dt>Faktor-ID</dt><dd><code>{f.id}</code></dd>
      </dl>
      {offered.length > 0 && (
        <div>
          <p className="strong">Publikationer med en værdi</p>
          <ul className="plain">
            {offered.map((p) => <li key={p.id}>{value(p.values[f.id])} <span className="muted">{p.name}{p.rows?.[f.id] ? `, ${p.rows[f.id]}` : ''}</span></li>)}
          </ul>
        </div>
      )}
      {family.length > 0 && (
        <div>
          <p className="strong">Andre år</p>
          <ul className="plain">
            {family.map((x) => <li key={x.id}>{validity(x)}: {value(x.value)}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

function validity(f: Factor): string {
  if (f.validFrom && f.validTo) return `${formatDate(f.validFrom)} – ${formatDate(f.validTo)}`
  if (f.validFrom) return `fra ${formatDate(f.validFrom)}`
  if (f.validTo) return `til ${formatDate(f.validTo)}`
  return '—'
}

const optionKey = (c: FactorSourceChoice | undefined): string =>
  !c || c.kind === 'builtin' ? 'builtin'
    : c.kind === 'publication' ? `publication:${c.publicationId}`
      : c.kind === 'api' ? `api:${c.providerId}`
        : 'manual'

function SourcePicker({ factor, publications, choice, onChoose }: {
  factor: Factor
  publications: readonly FactorPublication[]
  choice: FactorSourceChoice | undefined
  onChoose: (c: FactorSourceChoice) => void
}) {
  const id = useId()
  const [selected, setSelected] = useState(optionKey(choice))
  const options = sourceOptions(factor, publications)

  function change(key: string) {
    setSelected(key)
    if (key === 'builtin') onChoose({ kind: 'builtin' })
    else if (key.startsWith('publication:')) onChoose({ kind: 'publication', publicationId: key.slice('publication:'.length) })
    // Manual needs a value first; API providers can't be chosen yet.
  }

  return (
    <div className="source-picker">
      <label htmlFor={id} className="visually-hidden">Kilde for {factor.name}</label>
      <select id={id} value={selected} onChange={(e) => change(e.target.value)}>
        {options.map((o) => {
          if (o.kind === 'builtin') return <option key="builtin" value="builtin">{o.value === null ? 'Indbygget tabel (ingen værdi)' : 'Indbygget tabel'}</option>
          if (o.kind === 'publication') return <option key={o.publication.id} value={`publication:${o.publication.id}`}>{o.label}</option>
          if (o.kind === 'manual') return <option key="manual" value="manual">{o.label}</option>
          return <option key={o.provider.id} value={`api:${o.provider.id}`} disabled={!!o.provider.unavailable}>{o.label}{o.provider.unavailable ? ' (ikke tilgængelig)' : ''}</option>
        })}
      </select>
      {selected === 'manual' && (
        <ManualEntry factor={factor} initial={choice?.kind === 'manual' ? choice : undefined} onSave={onChoose} />
      )}
    </div>
  )
}

function ManualEntry({ factor, initial, onSave }: {
  factor: Factor
  initial: Extract<FactorSourceChoice, { kind: 'manual' }> | undefined
  onSave: (c: FactorSourceChoice) => void
}) {
  const id = useId()
  const [value, setValue] = useState(initial ? formatFactor(initial.value) : '')
  const [source, setSource] = useState(initial?.source ?? '')
  const [date, setDate] = useState(initial?.date ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(!!initial)

  function save(e: React.FormEvent) {
    e.preventDefault()
    const v = parseNumber(value)
    if (v === null || Number.isNaN(v)) return setError('Angiv værdien som et tal.')
    if (!source.trim()) return setError('Angiv, hvor værdien kommer fra.')
    setError(null)
    setSaved(true)
    onSave({ kind: 'manual', value: v, source: source.trim(), date })
  }

  const edited = () => setSaved(false)

  return (
    <form className="manual-entry" onSubmit={save} aria-label={`Anden kilde for ${factor.name}`}>
      <label htmlFor={`${id}-v`}>Værdi ({factor.unit})</label>
      <input id={`${id}-v`} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => { setValue(e.target.value); edited() }} />
      <label htmlFor={`${id}-s`}>Kilde</label>
      <input id={`${id}-s`} autoComplete="off" placeholder="Fx leverandørens deklaration 2025" value={source} onChange={(e) => { setSource(e.target.value); edited() }} />
      <label htmlFor={`${id}-d`}>Kildens dato</label>
      <input id={`${id}-d`} type="date" value={date} onChange={(e) => { setDate(e.target.value); edited() }} />
      <button type="submit" className="secondary">Gem</button>
      {saved && !error && <span className="muted" role="status">Gemt</span>}
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  )
}
