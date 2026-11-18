// Category 15 from the group's consolidation system (docs/adr/0017). The ESG owner exports one
// sheet per measure — ownership percentage, net turnover, investment amount — and drops them in
// here, as separate files or as sheets of one workbook, or the cube's company table with every
// measure by OrganizationID (docs/adr/0025). Nothing changes until the preview is accepted.

import { useId, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  CONSOLIDATED_ABOVE_PCT, GroupExportError, IMPORT_SOURCE_PREFIX, importedAccountingMethod, importedBasis, measureLabels, parseGroupExports,
  periodEndDate, planInvestments,
  planStatusLabels, type GroupExport, type PlanRow,
} from '../calc/groupExport'
import { ImportFileError, readSheets } from '../calc/importFile'
import type { Investment } from '../calc/investments'
import { formatNumber } from '../format'
import { newId } from '../newId'

/** One measure, from a file or from one sheet of a workbook */
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
  const withoutBasis = importable.filter((r) => r.revenueDKK === null && importedBasis(r) === 'Revenue').length
  // Year to date at July is the group's whole fiscal year (August–July), so only other months
  // are short of a year.
  const isYtd = files.some((f) => f.export.settings.some((s) => /time calculations/i.test(s.label) && /ytd/i.test(s.value)))
  const chosen = exports.flatMap((e) => e.periods).find((p) => p.label === periodLabel)
  const shortYtd = isYtd && chosen !== undefined && chosen.month !== 7

  async function add(file: File) {
    setReading(true)
    setDone(null)
    try {
      // A workbook can hold every measure, one per sheet, next to sheets that are no export at
      // all (the Excel add-in's own formats, notes). Those are passed over; the file fails only
      // when no sheet is an export, with the reason the first sheet gave. A measure found on two
      // sheets (a summary that looks up the others) is read from the one with more companies, in
      // case the summary's lookups weren't calculated.
      const sheets = await readSheets(file)
      const loaded: Loaded[] = []
      let firstError: unknown = null
      for (const sheet of sheets) {
        try {
          for (const parsed of parseGroupExports(sheet.grid)) {
            const i = loaded.findIndex((l) => l.export.measureText === parsed.measureText)
            const next = { fileName: sheets.length > 1 ? `${file.name} › ${sheet.name}` : file.name, export: parsed }
            if (i === -1) loaded.push(next)
            else if (parsed.rows.length > loaded[i].export.rows.length) loaded[i] = next
          }
        } catch (err) {
          if (!(err instanceof GroupExportError)) throw err
          firstError ??= err
        }
      }
      if (loaded.length === 0) throw firstError ?? new GroupExportError('Filen indeholder ingen ark.')
      setError(null)
      setFiles((fs) => [...fs.filter((f) => !loaded.some((l) => l.export.measureText === f.export.measureText)), ...loaded])
      setPeriodLabel((p) => p || loaded[0].export.periods[0]?.label || '')
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
    const source = `${IMPORT_SOURCE_PREFIX}${periodLabel}`
    setInvestments((current) => {
      const updates = new Map(importable.filter((r) => r.existingId).map((r) => [r.existingId!, r]))
      const kept = current.map((inv) => {
        const r = updates.get(inv.id)
        return r
          ? {
              ...inv, ownershipPct: r.ownershipPct, revenueDKK: r.revenueDKK ?? inv.revenueDKK, investmentDKK: r.investmentDKK ?? inv.investmentDKK, dataSource: source,
              ...(r.organizationId ? { organizationId: r.organizationId } : {}), ...(r.businessArea ? { businessArea: r.businessArea } : {}),
            }
          : inv
      })
      const created: Investment[] = importable.filter((r) => !r.existingId).map((r) => ({
        id: newId(), date, company: r.name, ownershipPct: r.ownershipPct,
        accountingMethod: importedAccountingMethod(r), climateMethod: 'Investment-specific method', dataSource: source,
        basis: importedBasis(r), totalKgCO2e: null, revenueDKK: r.revenueDKK, investmentDKK: r.investmentDKK, revenueLocal: null, localCurrency: 'DKK',
        rateLocalToDKK: null, factorKgPerEUR: null, factorSource: '', country: '',
        ...(r.organizationId ? { organizationId: r.organizationId } : {}), ...(r.businessArea ? { businessArea: r.businessArea } : {}),
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
        perioder som kolonner. Læg filerne ind her én ad gangen, eller én projektmappe med et ark pr. nøgletal; de
        samles på selskabsnavnet. En tabel med ét selskab pr. række og kolonnen <strong>OrganizationID</strong> samles
        i stedet på OrganizationID. Kun ejerandele på højst{' '}
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

          {shortYtd && (
            <p className="warning">
              Eksporten er år til dato (YTD), og {periodLabel} er ikke regnskabsårets sidste måned (juli). Hver investering
              regnes som 12 måneder, så vælg juli, eller ret tallene bagefter.
            </p>
          )}
          {withoutBasis > 0 && (
            <p className="warning">
              {formatNumber(withoutBasis, 0)} {withoutBasis === 1 ? 'selskab har' : 'selskaber har'} hverken investeringsbeløb eller omsætning for {periodLabel} og
              tæller først med, når et af dem eller udledningen er udfyldt. Mangler du <strong>Investment Amount</strong>- eller{' '}
              <strong>Net Turnover</strong>-filen?
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
  // Only a company table says how the cube classes each holding.
  const typed = shown.some((r) => r.ownershipType !== '')
  return (
    <>
      <div className="table-wrap">
        <table>
          <caption className="muted">Bliver importeret for {periodLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Selskab</th>
              {typed && <th scope="col">Type i koncernsystemet</th>}
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
                {typed && <td>{r.ownershipType || '—'}</td>}
                <td className="num">{r.ownershipPct === null ? '—' : `${formatNumber(r.ownershipPct, 2)} %`}</td>
                <td className="num">{r.revenueDKK === null ? <span className="pending">Mangler</span> : formatNumber(r.revenueDKK, 2)}</td>
                <td className="num">{r.investmentDKK === null ? '—' : formatNumber(r.investmentDKK, 2)}</td>
                <td>{planStatusLabels[r.status]}{r.status === 'new' && (importedBasis(r) === 'Investment' ? ' · investeringsbeløb' : ' · omsætning')}</td>
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
