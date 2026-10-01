import { useId, type Dispatch, type SetStateAction } from 'react'
import { currencyRates } from '../data/currencies'
import type { Period } from '../calc/dates'
import { investmentResult, type Category15, type Investment, type InvestmentBasis, type InvestmentResult } from '../calc/investments'
import { formatNumber } from '../format'
import { newId } from '../newId'
import { NumberField } from '../ui'

const blank = (date: string): Investment => ({
  id: newId(), date, company: '', ownershipPct: null, accountingMethod: 'Other investments', climateMethod: 'Investment-specific method',
  dataSource: '', basis: 'CO2e', totalKgCO2e: null, revenueDKK: null, revenueLocal: null, localCurrency: 'DKK', rateLocalToDKK: null,
  factorKgPerEUR: null, factorSource: '', country: '',
})

const examples = (date: string): Investment[] => [
  { ...blank(date), company: 'Nordisk Energi A/S', ownershipPct: 30, accountingMethod: 'Ass.', dataSource: 'Selskabets klimaregnskab 2025', totalKgCO2e: 1_850_000 },
  { ...blank(date), company: 'Svensk Rådgivning AB', ownershipPct: 15, basis: 'Revenue', revenueLocal: 42_000_000, localCurrency: 'SEK', rateLocalToDKK: 0.6688, factorKgPerEUR: 0.0768, factorSource: 'EXIOBASE, Other business services, Sverige', country: 'Sverige' },
  { ...blank(date), company: 'Heartland Datter ApS', ownershipPct: 100, dataSource: 'Konsolideret', totalKgCO2e: 640_000 },
]

type Props = {
  cat15: Category15
  investments: Investment[]
  setInvestments: Dispatch<SetStateAction<Investment[]>>
  period: Period
}

export function InvestmentsSection({ cat15, investments, setInvestments, period }: Props) {
  const defaultDate = period.end
  const id = useId()
  const counted = new Set(cat15.rows.map((r) => r.investment.id))
  const update = (invId: string, patch: Partial<Investment>) =>
    setInvestments((is) => is.map((i) => (i.id === invId ? { ...i, ...patch } : i)))

  return (
    <section aria-labelledby={`${id}-heading`}>
      <div className="section-head">
        <h2 id={`${id}-heading`}>Kategori 15 — investeringer</h2>
        <button type="button" onClick={() => setInvestments((is) => [...is, blank(defaultDate)])}>Ny investering</button>
      </div>
      <p className="muted">
        Den forholdsmæssige andel af investeringernes udledninger: selskabets udledning × ejerandel.
        Kun ejerandele på højst 50 % tæller med; større ejerandele er konsolideret i Scope 1 og 2.
        Udledningen er enten selskabets rapporterede tal i kg CO2e, eller et skøn ud fra omsætning i
        EUR × en faktor pr. EUR. Tallene er årstal: hver investering gælder for det kalenderår, den er
        dateret i, og tæller med for den del af året, der ligger i perioden.
      </p>

      {cat15.duplicates.length > 0 && (
        <p className="warning">
          <strong>Samme selskab flere gange for samme år:</strong>{' '}
          {cat15.duplicates.map((d) => `${d.company} (${d.year})`).join(', ')}. Hver linje tæller med, så
          året tælles dobbelt.
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
          <button type="button" className="secondary" onClick={() => setInvestments(examples(defaultDate))}>Indsæt eksempelinvesteringer</button>
        </div>
      )}

      {investments.map((inv) => (
        <InvestmentCard
          key={inv.id}
          result={investmentResult(inv, currencyRates, period)}
          counted={counted.has(inv.id)}
          onChange={(patch) => update(inv.id, patch)}
          onDelete={() => {
            if (window.confirm(`Slet ${inv.company || 'investeringen'}?`)) setInvestments((is) => is.filter((i) => i.id !== inv.id))
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

function InvestmentCard({ result, counted, onChange, onDelete }: { result: InvestmentResult; counted: boolean; onChange: (patch: Partial<Investment>) => void; onDelete: () => void }) {
  const id = useId()
  const inv = result.investment
  const status = !counted
    ? `${result.year ?? 'Datoens år'} ligger uden for perioden — tæller ikke med`
    : inv.ownershipPct === null
      ? 'Angiv ejerandel'
      : !result.included
        ? '> 50 % — konsolideret i Scope 1 og 2, tæller ikke med her'
        : result.pending
          ? inv.basis === 'Investment' ? 'Datagrundlaget "Investment" beregnes ikke — vælg CO2e eller omsætning' : 'Mangler data'
          : null

  return (
    <article className="card" aria-labelledby={`${id}-name-label`}>
      <div className="location-settings">
        <div className="field">
          <label id={`${id}-name-label`} htmlFor={`${id}-name`}>Selskab</label>
          <input id={`${id}-name`} value={inv.company} onChange={(e) => onChange({ company: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-date`}>Dato</label>
          <input id={`${id}-date`} type="date" value={inv.date} onChange={(e) => onChange({ date: e.target.value })} />
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
            <option value="Investment">Investment (beregnes ikke)</option>
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
            <NumberField label="Faktor (kg CO2e pr. EUR)" value={inv.factorKgPerEUR} onCommit={(v) => onChange({ factorKgPerEUR: v })} />
            <div className="field">
              <label htmlFor={`${id}-fsrc`}>Faktorkilde</label>
              <input id={`${id}-fsrc`} value={inv.factorSource} onChange={(e) => onChange({ factorSource: e.target.value })} />
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor={`${id}-src`}>Datakilde</label>
          <input id={`${id}-src`} value={inv.dataSource} onChange={(e) => onChange({ dataSource: e.target.value })} />
        </div>
      </div>

      <p className={status ? 'warning' : 'muted'}>
        {inv.basis === 'Revenue' && result.revenueEUR !== null && <>Omsætning {formatNumber(result.revenueEUR, 0)} EUR · </>}
        Ejerandel {formatNumber(result.share * 100, 1)} % · hele {result.year ?? 'året'}: {formatNumber(result.annualKgCO2e / 1000, 3)} tCO2e
        {' '}· {formatNumber(result.yearShare * 100, 1)} % af året i perioden: <strong>{formatNumber(result.kgCO2e / 1000, 3)} tCO2e</strong>
        {status && <> — <strong>{status}</strong></>}
      </p>
    </article>
  )
}
