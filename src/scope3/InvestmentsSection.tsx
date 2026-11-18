import { useId, useState, type Dispatch, type SetStateAction } from 'react'
import { currencyRates } from '../data/currencies'
import type { Factor } from '../data/factors'
import type { Period } from '../calc/dates'
import { appRates, type DkkRate } from '../calc/exchangeRates'
import { importedBatches, type ImportedBatch } from '../calc/groupExport'
import { coverLabel, investmentFactors, investmentResult, type Category15, type Investment, type InvestmentBasis, type InvestmentResult } from '../calc/investments'
import { factorLabel } from '../factors/label'
import { formatDate, formatFactor, formatNumber } from '../format'
import { newId } from '../newId'
import { NumberField } from '../ui'
import { useConfirm } from '../confirm'
import { InvestmentsImport } from './InvestmentsImport'

const blank = (date: string): Investment => ({
  id: newId(), date, company: '', ownershipPct: null, accountingMethod: 'Other investments', climateMethod: 'Investment-specific method',
  dataSource: '', basis: 'CO2e', totalKgCO2e: null, revenueDKK: null, revenueLocal: null, localCurrency: 'DKK', rateLocalToDKK: null,
  investmentDKK: null, factorKgPerEUR: null, factorSource: '', country: '',
})

type Props = {
  cat15: Category15
  investments: Investment[]
  setInvestments: Dispatch<SetStateAction<Investment[]>>
  period: Period
  /** The company's factor table: the spend factors per EUR are offered for revenue */
  factors: readonly Factor[]
}

/** "Other business services (Sverige) · 0,0768" — what a factor is and its value, in a list. */
const optionLabel = (f: Factor) => `${factorLabel(f)} · ${f.value === null ? 'værdi mangler' : formatFactor(f.value)}`

/** A holding estimated with a factor that has none of any kind: what the bulk choice fills in. */
const withoutFactor = (i: Investment) => i.basis !== 'CO2e' && !i.factorId && i.factorKgPerEUR === null

export function InvestmentsSection({ cat15, investments, setInvestments, period, factors }: Props) {
  const defaultDate = period.end
  const id = useId()
  const options = investmentFactors(factors)
  const counted = new Set(cat15.rows.map((r) => r.investment.id))
  const update = (invId: string, patch: Partial<Investment>) =>
    setInvestments((is) => is.map((i) => (i.id === invId ? { ...i, ...patch } : i)))
  const { confirm, dialog } = useConfirm()

  return (
    <section aria-labelledby={`${id}-heading`}>
      {dialog}
      <div className="section-head">
        <h2 id={`${id}-heading`}>Kategori 15 — investeringer</h2>
        <button type="button" onClick={() => setInvestments((is) => [...is, blank(defaultDate)])}>Ny investering</button>
      </div>
      <InvestmentsImport investments={investments} setInvestments={setInvestments} />
      <ImportedList
        investments={investments}
        onDelete={async (batch) => {
          const n = batch.ids.length
          const what = `${formatNumber(n, 0)} ${n === 1 ? 'investering' : 'investeringer'} fra importen ${batch.periodLabel}`
          if (!(await confirm(`Slet ${what}? Det gælder også investeringer, importen opdaterede, og eventuelle ændringer du har lavet i dem. Det kan ikke fortrydes.`, 'Slet import'))) return
          const ids = new Set(batch.ids)
          setInvestments((is) => is.filter((i) => !ids.has(i.id)))
        }}
      />
      <BulkFactor
        count={investments.filter(withoutFactor).length}
        options={options}
        onApply={(factorId) => setInvestments((is) => is.map((i) => (withoutFactor(i) ? { ...i, factorId } : i)))}
      />
      <p className="muted">
        Den forholdsmæssige andel af investeringernes udledninger. Kun ejerandele på højst 50 % tæller med;
        større ejerandele er konsolideret i Scope 1 og 2. Har selskabet et klimaregnskab, bruges dets
        udledning i kg CO2e × ejerandel. Ellers skønnes udledningen som investeringsbeløbet i EUR × en
        branchefaktor pr. EUR, som datamanualen foreskriver — eller, som i den oprindelige app, omsætning i
        EUR × faktor × ejerandel. Beløb i DKK omregnes til EUR med ECB's referencekurs på investeringens
        dato. Tallene er årstal: hver investering dækker de 12 måneder til og med dens
        dato — 31. juli for regnskabsåret august–juli, 31. december for et kalenderår — og tæller med for
        den del, der ligger i perioden. Er selskabet købt eller solgt i løbet af de 12 måneder, angives
        datoen, så kun dagene med ejerskab tæller.
      </p>

      {cat15.duplicates.length > 0 && (
        <p className="warning">
          <strong>Samme selskab flere gange for de samme måneder:</strong>{' '}
          {cat15.duplicates.map((d) => `${d.company} (${d.covers})`).join(', ')}. Hver linje tæller med, så
          de måneder, der overlapper, tælles dobbelt.
        </p>
      )}
      {cat15.pendingCount > 0 && (
        <p className="warning">
          {cat15.pendingCount === 1 ? '1 investering mangler' : `${cat15.pendingCount} investeringer mangler`} data
          og tæller ikke med endnu.
        </p>
      )}

      {investments.length === 0 && (
        <div className="empty">
          <p>Ingen investeringer.</p>
        </div>
      )}

      {investments.map((inv) => (
        <InvestmentCard
          key={inv.id}
          result={investmentResult(inv, appRates, period, factors)}
          options={options}
          counted={counted.has(inv.id)}
          onChange={(patch) => update(inv.id, patch)}
          onDelete={async () => {
            if (await confirm(`Slet ${inv.company || 'investeringen'}?`)) setInvestments((is) => is.filter((i) => i.id !== inv.id))
          }}
        />
      ))}

      {cat15.rows.length > 0 && (
        <p className="strong">
          Kategori 15 i alt: {formatNumber(cat15.total, 3)} tCO2e
          {cat15.consolidatedCount > 0 && (
            <span className="muted"> · {cat15.consolidatedCount === 1 ? '1 ejerandel' : `${cat15.consolidatedCount} ejerandele`} over 50 % er udeladt (konsolideret)</span>
          )}
        </p>
      )}
    </section>
  )
}

/**
 * One factor for every holding on revenue that has none: an import brings in dozens at once, and
 * most get the same EXIOBASE sector. Each can be changed on its own afterwards.
 */
function BulkFactor({ count, options, onApply }: { count: number; options: readonly Factor[]; onApply: (factorId: string) => void }) {
  const id = useId()
  const [factorId, setFactorId] = useState('')
  if (count === 0 || options.length === 0) return null
  return (
    <div className="bulk-factor">
      <div className="field">
        <label htmlFor={`${id}-factor`}>Faktor til investeringer uden faktor</label>
        <select id={`${id}-factor`} value={factorId} onChange={(e) => setFactorId(e.target.value)}>
          <option value="">Vælg faktor …</option>
          {options.map((f) => <option key={f.id} value={f.id}>{optionLabel(f)}</option>)}
        </select>
      </div>
      <button type="button" disabled={!factorId} onClick={() => { onApply(factorId); setFactorId('') }}>
        Brug på {formatNumber(count, 0)} {count === 1 ? 'investering' : 'investeringer'}
      </button>
    </div>
  )
}

function InvestmentCard({ result, options, counted, onChange, onDelete }: {
  result: InvestmentResult
  options: readonly Factor[]
  counted: boolean
  onChange: (patch: Partial<Investment>) => void
  onDelete: () => void
}) {
  const id = useId()
  const inv = result.investment
  const trimmed = result.owned && result.covers && (result.owned.start !== result.covers.start || result.owned.end !== result.covers.end)
  const status = result.covers && !result.owned
    ? 'Ejet fra/til passer ikke med de 12 måneder — tæller ikke med'
    : !counted
      ? `${trimmed ? `Ejet ${ownedLabel(result.owned!)}` : coverLabel(result.covers)} ligger uden for perioden — tæller ikke med`
    : inv.ownershipPct === null
      ? 'Angiv ejerandel'
      : !result.included
        ? '> 50 % — konsolideret i Scope 1 og 2, tæller ikke med her'
        : result.pending
          ? inv.basis === 'Investment' && inv.investmentDKK === null ? 'Investeringsbeløb mangler'
            : inv.basis === 'Investment' && inv.investmentDKK! < 0 ? 'Investeringsbeløbet er negativt — tæller ikke med'
              : inv.basis !== 'CO2e' && result.factorKgPerEUR === null
                ? (result.factor && result.factor.value === null ? 'Faktorens værdi mangler' : 'Faktor mangler')
                : 'Mangler data'
          : null

  // Folded to one line, so an import of a hundred holdings stays readable. A new, empty one
  // opens, since it has to be filled in.
  const [open, setOpen] = useState(inv.company === '')

  return (
    <details className="card investment-details" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="investment-name">{inv.company || 'Ny investering'}</span>
        <span className="muted">
          {' '}· {coverLabel(result.covers)}
          {inv.ownedFrom && ` · købt ${formatDate(inv.ownedFrom)}`}
          {inv.ownedTo && ` · solgt ${formatDate(inv.ownedTo)}`}
          {' '}· {inv.ownershipPct === null ? 'ejerandel mangler' : `${formatNumber(inv.ownershipPct, 2)} %`}
          {' '}· {formatNumber(result.kgCO2e / 1000, 3)} tCO2e
        </span>
        {status && <span className="pending"> · {status}</span>}
      </summary>
      <div className="location-settings">
        <div className="field">
          <label id={`${id}-name-label`} htmlFor={`${id}-name`}>Selskab</label>
          <input id={`${id}-name`} value={inv.company} onChange={(e) => onChange({ company: e.target.value })} />
          {(inv.organizationId || inv.businessArea) && (
            <p className="muted">
              {[inv.organizationId && `OrganizationID ${inv.organizationId}`, inv.businessArea && `Forretningsområde: ${inv.businessArea}`].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor={`${id}-date`}>Opgjort til og med<span className="optional"> (dækker 12 mdr.)</span></label>
          <input id={`${id}-date`} type="date" value={inv.date} onChange={(e) => onChange({ date: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-from`}>Ejet fra<span className="optional"> (hvis købt i de 12 mdr.)</span></label>
          <input
            id={`${id}-from`} type="date" value={inv.ownedFrom ?? ''} min={result.covers?.start} max={result.covers?.end}
            onChange={(e) => onChange({ ownedFrom: e.target.value || undefined })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-to`}>Ejet til<span className="optional"> (hvis solgt i de 12 mdr.)</span></label>
          <input
            id={`${id}-to`} type="date" value={inv.ownedTo ?? ''} min={result.covers?.start} max={result.covers?.end}
            onChange={(e) => onChange({ ownedTo: e.target.value || undefined })}
          />
        </div>
        <NumberField label="Ejerandel (%)" value={inv.ownershipPct} onCommit={(v) => onChange({ ownershipPct: v })} />
        <div className="field">
          <label htmlFor={`${id}-acc`}>Regnskabsmetode</label>
          <select id={`${id}-acc`} value={inv.accountingMethod} onChange={(e) => onChange({ accountingMethod: e.target.value as Investment['accountingMethod'] })}>
            <option value="Ass.">Ass. (associeret)</option>
            <option value="Other investments">Other investments</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-basis`}>Datagrundlag</label>
          <select id={`${id}-basis`} value={inv.basis} onChange={(e) => onChange({ basis: e.target.value as InvestmentBasis })}>
            <option value="CO2e">Rapporteret CO2e</option>
            <option value="Revenue">Omsætning × faktor</option>
            <option value="Investment">Investeringsbeløb × faktor</option>
          </select>
        </div>
        <div className="field end">
          <button type="button" className="link" onClick={onDelete}>
            Slet investering<span className="visually-hidden">: {inv.company}</span>
          </button>
        </div>
      </div>

      <div className="location-settings">
        {inv.basis === 'CO2e' && (
          <NumberField label="Selskabets udledning (kg CO2e)" value={inv.totalKgCO2e} onCommit={(v) => onChange({ totalKgCO2e: v })} />
        )}
        {inv.basis === 'Revenue' && (
          <>
            <NumberField label="Omsætning (DKK)" hint="eller angiv beløb og kurs" value={inv.revenueDKK} onCommit={(v) => onChange({ revenueDKK: v })} />
            <NumberField label="Omsætning i lokal valuta" value={inv.revenueLocal} onCommit={(v) => onChange({ revenueLocal: v })} />
            <div className="field">
              <label htmlFor={`${id}-cur`}>Valuta</label>
              <select id={`${id}-cur`} value={inv.localCurrency} onChange={(e) => onChange({ localCurrency: e.target.value })}>
                {currencyRates.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
            <NumberField label="Kurs (DKK pr. enhed)" value={inv.rateLocalToDKK} onCommit={(v) => onChange({ rateLocalToDKK: v })} />
          </>
        )}
        {inv.basis === 'Investment' && (
          <NumberField label="Investeringsbeløb (DKK)" value={inv.investmentDKK} onCommit={(v) => onChange({ investmentDKK: v })} />
        )}
        {inv.basis !== 'CO2e' && (
          <>
            <div className="field">
              <label htmlFor={`${id}-factor`}>Faktor</label>
              <select id={`${id}-factor`} value={inv.factorId ?? ''} onChange={(e) => onChange({ factorId: e.target.value || null })}>
                <option value="">Egen faktor</option>
                {/* A factor that is no longer offered stays chosen, so nothing changes silently. */}
                {inv.factorId && !options.some((f) => f.id === inv.factorId) && <option value={inv.factorId}>{factorLabel(result.factor) || inv.factorId}</option>}
                {options.map((f) => <option key={f.id} value={f.id}>{optionLabel(f)}</option>)}
              </select>
            </div>
            {inv.factorId ? (
              <p className="field">
                {result.factorKgPerEUR === null
                  ? <span className="pending">Faktorens værdi mangler — angiv den på Faktorer-siden</span>
                  : <>{formatFactor(result.factorKgPerEUR)} kg CO2e pr. EUR</>}
                {result.factor && <span className="sub">{result.factor.source}</span>}
              </p>
            ) : (
              <>
                <NumberField label="Egen faktor (kg CO2e pr. EUR)" value={inv.factorKgPerEUR} onCommit={(v) => onChange({ factorKgPerEUR: v })} />
                <div className="field">
                  <label htmlFor={`${id}-fsrc`}>Faktorkilde</label>
                  <input id={`${id}-fsrc`} value={inv.factorSource} onChange={(e) => onChange({ factorSource: e.target.value })} />
                </div>
              </>
            )}
          </>
        )}
        <div className="field">
          <label htmlFor={`${id}-src`}>Datakilde</label>
          <input id={`${id}-src`} value={inv.dataSource} onChange={(e) => onChange({ dataSource: e.target.value })} />
        </div>
      </div>

      <p className={status ? 'warning' : 'muted'}>
        {inv.basis === 'Revenue' && result.revenueEUR !== null && <>Omsætning {formatNumber(result.revenueEUR, 0)} EUR · </>}
        {inv.basis === 'Investment' && result.investmentEUR !== null && <>Investeret {formatNumber(result.investmentEUR, 0)} EUR · </>}
        {inv.basis !== 'CO2e' && <>{rateLabel(result.eurRate, inv.date)} · </>}
        Ejerandel {formatNumber(result.share * 100, 1)} % · hele {coverLabel(result.covers)}: {formatNumber(result.annualKgCO2e / 1000, 3)} tCO2e
        {trimmed && <> · ejet {ownedLabel(result.owned!)}</>}
        {' '}· {formatNumber(result.shareInPeriod * 100, 1)} % af de 12 måneder {trimmed ? 'ejet og ' : ''}i perioden: <strong>{formatNumber(result.kgCO2e / 1000, 3)} tCO2e</strong>
        {status && <> — <strong>{status}</strong></>}
      </p>
    </details>
  )
}

/** The DKK→EUR rate used, and where it's from, so the holding documents its own conversion. */
function rateLabel({ value, rateDate }: DkkRate, date: string): string {
  if (value === null) return 'Ingen kurs til EUR'
  const rate = `Kurs ${formatNumber(value, 4)} DKK pr. EUR`
  return rateDate
    ? `${rate} (ECB-referencekurs ${formatDate(rateDate)})`
    : `${rate} (fast kurs; ingen ECB-kurs ${formatDate(date)})`
}

const ownedLabel = (owned: Period) => `${formatDate(owned.start)}–${formatDate(owned.end)}`

/** Each import's holdings, with a button that deletes them all */
function ImportedList({ investments, onDelete }: { investments: readonly Investment[]; onDelete: (batch: ImportedBatch) => void }) {
  const id = useId()
  const batches = importedBatches(investments)
  if (batches.length === 0) return null
  return (
    <section aria-labelledby={`${id}-heading`} className="imported-list">
      <h3 id={`${id}-heading`}>Importerede data</h3>
      <ul className="plain">
        {batches.map((b) => (
          <li key={b.source}>
            <strong>{b.periodLabel}</strong> fra koncernsystemet · {formatNumber(b.ids.length, 0)} {b.ids.length === 1 ? 'investering' : 'investeringer'}{' '}
            <button type="button" className="link" onClick={() => onDelete(b)}>
              Slet<span className="visually-hidden"> importen {b.periodLabel}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
