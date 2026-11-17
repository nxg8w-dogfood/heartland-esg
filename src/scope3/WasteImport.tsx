// Category 5 from the waste hauler's quantity report (src/calc/wasteReport.ts). Nothing changes
// until the preview is accepted; a new report for the same months replaces the earlier import.

import { useId, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { ActivityGroup, ActivityLine } from '../calc/activity'
import { ImportFileError, readGrid } from '../calc/importFile'
import {
  monthLabel, parseWasteReport, planWasteLines, wasteGroupFor, WasteReportError, type WasteReport,
} from '../calc/wasteReport'
import { formatNumber } from '../format'
import { newId } from '../newId'

type Loaded = { fileName: string; report: WasteReport }

export function WasteImport({ groups, lines, setLines }: {
  groups: readonly ActivityGroup[]
  lines: ActivityLine[]
  setLines: Dispatch<SetStateAction<ActivityLine[]>>
}) {
  const id = useId()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [chosen, setChosen] = useState<(string | null)[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const plan = useMemo(
    () => (loaded ? planWasteLines(loaded.report, chosen, lines, groups) : null),
    [loaded, chosen, lines, groups],
  )

  async function read(file: File) {
    setReading(true)
    setDone(null)
    try {
      const report = parseWasteReport(await readGrid(file))
      setError(null)
      setLoaded({ fileName: file.name, report })
      setChosen(report.rows.map((r) => wasteGroupFor(r.wasteType, r.treatment)))
    } catch (err) {
      setLoaded(null)
      setError(
        err instanceof WasteReportError || err instanceof ImportFileError
          ? err.message
          : 'Filen kunne ikke læses. Er det en gyldig CSV- eller XLSX-fil?',
      )
    } finally {
      setReading(false)
    }
  }

  function cancel() {
    setLoaded(null)
    setChosen([])
    setError(null)
  }

  function apply() {
    if (!loaded || !plan) return
    const replaced = new Set(plan.replaces)
    const added = plan.lines.map((l) => ({ ...l, id: newId() }))
    setLines((current) => [...current.filter((l) => !replaced.has(l.id)), ...added])
    const tonnes = added.reduce((s, l) => s + (l.quantity ?? 0), 0)
    setDone(
      `${formatNumber(added.length, 0)} linjer (${formatNumber(tonnes, 3)} tons) importeret for ${loaded.report.periodLabel}` +
      (replaced.size > 0 ? `; ${formatNumber(replaced.size, 0)} linjer fra en tidligere import er erstattet.` : '.'),
    )
    cancel()
  }

  const report = loaded?.report
  const unassigned = plan?.unassigned.length ?? 0

  return (
    <details className="import-details">
      <summary>Importér mængderapport fra affaldsleverandøren</summary>
      <p className="muted">
        Læg mængderapporten pr. affaldstype ind (fx fra Marius Pedersen) — én række pr. affaldstype og
        behandlingsform, én kolonne pr. måned, i kg. Hver måned bliver en linje, så en rapport, der går over et årsskifte,
        fordeles på de rigtige år. En ny rapport for de samme måneder erstatter den forrige import.
      </p>

      <div className="field wide">
        <label htmlFor={`${id}-file`}>Mængderapport (CSV eller Excel)</label>
        <input
          id={`${id}-file`}
          type="file"
          accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={reading}
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) await read(f)
          }}
        />
      </div>
      {reading && <p className="muted" role="status">Læser filen …</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {done && <p className="muted" role="status">{done}</p>}

      {loaded && report && plan && (
        <>
          <p>
            <strong>{loaded.fileName}</strong> · {report.periodLabel} · {formatNumber(report.months.length, 0)} måneder ·{' '}
            {formatNumber(report.rows.length, 0)} affaldstyper
          </p>


          {report.totalMismatches.length > 0 && (
            <p className="warning">
              Rapportens total stemmer ikke med summen af affaldstyperne i{' '}
              {report.totalMismatches.map((m) => monthLabel(report.months[m - 1])).join(', ')}. Tjek filen.
            </p>
          )}
          {unassigned > 0 && (
            <p className="warning">
              {formatNumber(unassigned, 0)} {unassigned === 1 ? 'affaldstype har' : 'affaldstyper har'} ingen type i
              kategori 5 og importeres ikke, før du vælger en.
            </p>
          )}

          <div className="table-wrap">
            <table>
              <caption className="muted">Affaldstyper i rapporten</caption>
              <thead>
                <tr>
                  <th scope="col">Affaldstype</th>
                  <th scope="col">Behandlingsform</th>
                  <th scope="col" className="num">I alt (kg)</th>
                  <th scope="col">Type i kategori 5</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r, i) => (
                  <tr key={`${r.wasteType}|${r.treatment}|${i}`}>
                    <td>{r.wasteType}</td>
                    <td>{r.treatment}</td>
                    <td className="num">{formatNumber(r.values.reduce<number>((s, v) => s + (v ?? 0), 0), 0)}</td>
                    <td>
                      <label className="visually-hidden" htmlFor={`${id}-g${i}`}>Type for {r.wasteType}</label>
                      <select
                        id={`${id}-g${i}`}
                        value={chosen[i] ?? ''}
                        onChange={(e) => setChosen((c) => c.map((g, j) => (j === i ? e.target.value || null : g)))}
                      >
                        <option value="">Importér ikke</option>
                        {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {plan.replaces.length > 0 && (
            <p className="muted">
              {formatNumber(plan.replaces.length, 0)} linjer fra en tidligere import i de samme måneder bliver erstattet.
            </p>
          )}

          <div className="actions">
            <button type="button" disabled={plan.lines.length === 0} onClick={apply}>
              Importér {formatNumber(plan.lines.length, 0)} linjer
            </button>{' '}
            <button type="button" className="secondary" onClick={cancel}>Annullér</button>
          </div>
        </>
      )}
    </details>
  )
}
