// Category 15 from the group's consolidation system (docs/adr/0017). The ESG owner exports one
// sheet per measure — ownership percentage, net turnover, investment amount — and drops them in
// here. Nothing changes until the preview is accepted.

import { useId, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  CONSOLIDATED_ABOVE_PCT, GroupExportError, measureLabels, parseGroupExport, periodEndDate, planInvestments,
  planStatusLabels, type GroupExport, type PlanRow,
} from '../calc/groupExport'
import { ImportFileError, readGrid } from '../calc/importFile'
import type { Investment } from '../calc/investments'
import { formatNumber } from '../format'
import { newId } from '../newId'

type Loaded = { fileName: string; export: GroupExport }

const PREVIEW = 10

export function InvestmentsImport({ investments, setInvestments }: {
  investments: Investment[]
  setInvestments: Dispatch<SetStateAction<Investment[]>>
}) {
  const id = useId()
  const [files, setFiles] = useState<Loaded[]>([])
  const [periodLabel, setPeriodLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const periods = useMemo(() => {
    const labels: string[] = []
    for (const f of files) for (const p of f.export.periods) if (!labels.includes(p.label)) labels.push(p.label)
    return labels
  }, [files])

  const exports = useMemo(() => files.map((f) => f.export), [files])
  const plan = useMemo(
    () => (periodLabel ? planInvestments(exports, periodLabel, investments) : []),
    [exports, periodLabel, investments],
  )
  const importable = plan.filter((r) => r.status === 'new' || r.status === 'update')
  const withoutRevenue = importable.filter((r) => r.revenueDKK === null).length
  const isYtd = files.some((f) => f.export.settings.some((s) => /time calculations/i.test(s.label) && /ytd/i.test(s.value)))

  async function add(file: File) {
    setReading(true)
    setDone(null)
    try {
      const parsed = parseGroupExport(await readGrid(file))
      setError(null)
      setFiles((fs) => [...fs.filter((f) => f.export.measureText !== parsed.measureText), { fileName: file.name, export: parsed }])
      setPeriodLabel((p) => p || parsed.periods[0]?.label || '')
    } catch (err) {
      setError(
        err instanceof GroupExportError || err instanceof ImportFileError
          ? err.message
          : 'Filen kunne ikke læses. Er det en gyldig CSV- eller XLSX-fil?',
      )
    } finally {
      setReading(false)
    }
  }

  function apply() {
    const period = exports.flatMap((e) => e.periods).find((p) => p.label === periodLabel)
    if (!period) return
    const date = periodEndDate(period)
    const source = `Koncernsystem, ${periodLabel}`
    setInvestments((current) => {
      const updates = new Map(importable.filter((r) => r.existingId).map((r) => [r.existingId!, r]))
      const kept = current.map((inv) => {
        const r = updates.get(inv.id)
        return r ? { ...inv, ownershipPct: r.ownershipPct, revenueDKK: r.revenueDKK ?? inv.revenueDKK, dataSource: source } : inv
      })
      const created: Investment[] = importable.filter((r) => !r.existingId).map((r) => ({
        id: newId(), date, company: r.name, ownershipPct: r.ownershipPct,
        accountingMethod: 'Other investments', climateMethod: 'Investment-specific method', dataSource: source,
        basis: 'Revenue', totalKgCO2e: null, revenueDKK: r.revenueDKK, revenueLocal: null, localCurrency: 'DKK',
        rateLocalToDKK: null, factorKgPerEUR: null, factorSource: '', country: '',
      }))
      return [...kept, ...created]
    })
    const created = importable.filter((r) => !r.existingId).length
    const updated = importable.length - created
    setDone(
      `${formatNumber(created, 0)} nye og ${formatNumber(updated, 0)} opdaterede investeringer fra ${periodLabel}. ` +
      'Udfyld faktor (kg CO2e pr. EUR) på hver investering — først da tæller de med.',
    )
    setFiles([])
    setPeriodLabel('')
  }

  return (
    <details className="import-details">
      <summary>Importér fra koncernsystemet</summary>
      <p className="muted">
        Eksportér ét nøgletal ad gangen fra koncernsystemet — <strong>Ownership Percentage</strong>,{' '}
        <strong>Net Turnover</strong> og eventuelt <strong>Investment Amount</strong> — med selskaberne som rækker og
        perioder som kolonner. Læg filerne ind her én ad gangen; de samles på selskabsnavnet. Kun ejerandele på højst{' '}
        {CONSOLIDATED_ABOVE_PCT} % oprettes som kategori 15.
      </p>

      <div className="field wide">
        <label htmlFor={`${id}-file`}>Eksportfil (CSV eller Excel)</label>
        <input
          id={`${id}-file`}
          type="file"
          accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={reading}
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) await add(f)
          }}
        />
      </div>
      {reading && <p className="muted" role="status">Læser filen …</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {done && <p className="muted" role="status">{done}</p>}

      {files.length > 0 && (
        <>
          <ul className="plain">
            {files.map((f) => (
              <li key={f.export.measureText}>
                <strong>{measureLabels[f.export.measure]}</strong> — {f.fileName} · {f.export.measureText} ·{' '}
                {formatNumber(f.export.rows.length, 0)} selskaber
                {f.export.skipped > 0 && ` · ${formatNumber(f.export.skipped, 0)} ${f.export.skipped === 1 ? 'række' : 'rækker'} uden værdi sprunget over`}
                {' '}
                <button type="button" className="link" onClick={() => setFiles((fs) => fs.filter((x) => x !== f))}>
                  Fjern<span className="visually-hidden"> {f.fileName}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="field">
            <label htmlFor={`${id}-period`}>Periode</label>
            <select id={`${id}-period`} value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)}>
              {periods.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {isYtd && (
            <p className="warning">
              Eksporten er år til dato (YTD). Kategori 15 regner omsætningen som et helt år, så vælg en periode, der
              dækker hele året, eller ret omsætningen bagefter.
            </p>
          )}
          {withoutRevenue > 0 && (
            <p className="warning">
              {formatNumber(withoutRevenue, 0)} {withoutRevenue === 1 ? 'selskab har' : 'selskaber har'} ingen omsætning for {periodLabel} og tæller først med, når
              omsætning eller udledning er udfyldt. Mangler du <strong>Net Turnover</strong>-filen?
            </p>
          )}

          <PlanTable rows={plan} periodLabel={periodLabel} />

          <div className="actions">
            <button type="button" disabled={importable.length === 0} onClick={apply}>
              Importér {formatNumber(importable.length, 0)} investeringer
            </button>{' '}
            <button type="button" className="secondary" onClick={() => { setFiles([]); setPeriodLabel(''); setError(null) }}>
              Annullér
            </button>
          </div>
        </>
      )}
    </details>
  )
}

function PlanTable({ rows, periodLabel }: { rows: PlanRow[]; periodLabel: string }) {
  const shown = rows.filter((r) => r.status === 'new' || r.status === 'update')
  const rest = rows.length - shown.length
  return (
    <>
      <div className="table-wrap">
        <table>
          <caption className="muted">Bliver importeret for {periodLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Selskab</th>
              <th scope="col" className="num">Ejerandel</th>
              <th scope="col" className="num">Omsætning (DKK)</th>
              <th scope="col" className="num">Investeringsbeløb (DKK)</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, PREVIEW).map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="num">{r.ownershipPct === null ? '—' : `${formatNumber(r.ownershipPct, 2)} %`}</td>
                <td className="num">{r.revenueDKK === null ? <span className="pending">Mangler</span> : formatNumber(r.revenueDKK, 2)}</td>
                <td className="num">{r.investmentDKK === null ? '—' : formatNumber(r.investmentDKK, 2)}</td>
                <td>{planStatusLabels[r.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length > PREVIEW && <p className="muted">Viser de første {PREVIEW} af {formatNumber(shown.length, 0)}.</p>}
      {rest > 0 && (
        <p className="muted">
          {formatNumber(rest, 0)} {rest === 1 ? 'selskab importeres' : 'selskaber importeres'} ikke: konsolideret (over{' '}
          {CONSOLIDATED_ABOVE_PCT} %) eller uden ejerandel i eksporten.
        </p>
      )}
    </>
  )
}
