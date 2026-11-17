// Category 5 from the waste hauler's quantity report (src/calc/wasteReport.ts). Nothing changes
// until the preview is accepted. The lines go to the address the user picks, and a new report for
// the same months and address replaces the earlier import. Each imported file is listed with its
// lines, and deleting the file deletes them.

import { useId, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { ActivityGroup, ActivityLine } from '../calc/activity'
import type { ImportBatch } from '../calc/ledger'
import type { Location } from '../calc/scope2'
import { ImportFileError, readGrid } from '../calc/importFile'
import {
  importsInUse, monthLabel, parseWasteReport, planWasteLines, wasteFiles, wasteGroupFor, WasteReportError, type WasteFile, type WasteReport,
} from '../calc/wasteReport'
import { useConfirm } from '../confirm'
import { formatDate, formatNumber } from '../format'
import { newId } from '../newId'

type Loaded = { fileName: string; report: WasteReport }

export function WasteImport({ groups, locations, lines, setLines, imports, setImports }: {
  groups: readonly ActivityGroup[]
  /** The company's addresses (Scope 2 locations); the import asks which one the report is for */
  locations: readonly Location[]
  lines: ActivityLine[]
  setLines: Dispatch<SetStateAction<ActivityLine[]>>
  /** The reports imported so far */
  imports: ImportBatch[]
  setImports: Dispatch<SetStateAction<ImportBatch[]>>
}) {
  const id = useId()
  const { confirm, dialog } = useConfirm()
  const files = useMemo(() => wasteFiles(imports, lines), [imports, lines])
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [chosen, setChosen] = useState<(string | null)[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [picked, setPicked] = useState('')

  // With one address it's preselected; with several the user must pick; with none the lines have none.
  const locationId = locations.some((l) => l.id === picked) ? picked : locations.length === 1 ? locations[0].id : ''
  const needsLocation = locations.length > 0 && !locationId
  const location = locations.find((l) => l.id === locationId)

  const plan = useMemo(
    () => (loaded ? planWasteLines(loaded.report, chosen, locationId || null, lines, groups) : null),
    [loaded, chosen, locationId, lines, groups],
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
    const batch: ImportBatch = { id: newId(), fileName: loaded.fileName, importedAt: new Date().toISOString(), count: plan.lines.length }
    const added = plan.lines.map((l) => ({ ...l, id: newId(), importId: batch.id }))
    const next = [...lines.filter((l) => !replaced.has(l.id)), ...added]
    setLines(next)
    // A file whose lines were all replaced by this report has nothing left to delete: it goes.
    setImports(importsInUse([...imports, batch], next))
    const tonnes = added.reduce((s, l) => s + (l.quantity ?? 0), 0)
    setDone(
      `${formatNumber(added.length, 0)} linjer (${formatNumber(tonnes, 3)} tons) importeret for ${loaded.report.periodLabel}` +
      (location ? ` til ${location.name}` : '') +
      (replaced.size > 0 ? `; ${formatNumber(replaced.size, 0)} linjer fra en tidligere import er erstattet.` : '.'),
    )
    cancel()
  }

  const report = loaded?.report
  const unassigned = plan?.unassigned.length ?? 0

  return (
    <>
      {dialog}
      <details className="import-details">
        <summary>
          Importér mængderapport fra affaldsleverandøren
          {files.length > 0 && <span className="muted"> · {formatNumber(files.length, 0)} {files.length === 1 ? 'fil' : 'filer'} importeret</span>}
        </summary>
        <p className="muted">
          Læg mængderapporten pr. affaldstype ind (fx fra Marius Pedersen) — én række pr. affaldstype og
          behandlingsform, én kolonne pr. måned, i kg. Hver måned bliver en linje, så en rapport, der går over et årsskifte,
          fordeles på de rigtige år. En ny rapport for de samme måneder og den samme adresse erstatter den forrige import.
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
        {files.length > 0 && (
          <FileList files={files} locations={locations} onDelete={async (f) => {
            const count = f.lineIds.length
            const lineText = count === 1 ? 'den ene linje' : `de ${formatNumber(count, 0)} linjer`
            const name = f.batch?.fileName ?? 'Linjerne importeret før filoversigten'
            const question = f.batch ? `Slet ${f.batch.fileName} og ${lineText}, der kom med?` : `Slet ${lineText}, der blev importeret før filoversigten?`
            if (!(await confirm(question, 'Slet fil og linjer'))) return
            const gone = new Set(f.lineIds)
            setLines((ls) => ls.filter((l) => !gone.has(l.id)))
            if (f.batch) setImports((bs) => bs.filter((b) => b.id !== f.batch!.id))
            setDone(`${name} er slettet med ${formatNumber(count, 0)} ${count === 1 ? 'linje' : 'linjer'}.`)
          }} />
        )}
        {reading && <p className="muted" role="status">Læser filen …</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {done && <p className="muted" role="status">{done}</p>}

        {loaded && report && plan && (
          <>
            <p>
              <strong>{loaded.fileName}</strong> · {report.periodLabel} · {formatNumber(report.months.length, 0)} måneder ·{' '}
              {formatNumber(report.rows.length, 0)} affaldstyper
            </p>

            {locations.length > 0 && (
              <div className="field">
                <label htmlFor={`${id}-location`}>Adresse (lokation)</label>
                <select id={`${id}-location`} value={locationId} onChange={(e) => setPicked(e.target.value)}>
                  {!locationId && <option value="">Vælg adresse …</option>}
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}
            {locations.length === 0 && (
              <p className="muted">Virksomheden har ingen lokationer endnu, så linjerne får ingen adresse. Lokationer oprettes under Scope 2.</p>
            )}

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
                {formatNumber(plan.replaces.length, 0)} linjer fra en tidligere import i de samme måneder{location ? ` til ${location.name}` : ''} bliver erstattet.
              </p>
            )}

            <div className="actions">
              <button type="button" disabled={plan.lines.length === 0 || needsLocation} onClick={apply}>
                Importér {formatNumber(plan.lines.length, 0)} linjer
              </button>{' '}
              <button type="button" className="secondary" onClick={cancel}>Annullér</button>
            </div>
          </>
        )}
      </details>
    </>
  )
}

function FileList({ files, locations, onDelete }: {
  files: readonly WasteFile[]
  locations: readonly Location[]
  onDelete: (file: WasteFile) => void
}) {
  const where = (f: WasteFile) => f.locationIds.map((id) => locations.find((l) => l.id === id)?.name ?? 'Slettet lokation').join(', ') || '—'
  return (
    <div className="table-wrap">
      <table>
        <caption className="muted">Importerede filer</caption>
        <thead>
          <tr>
            <th scope="col">Fil</th>
            <th scope="col">Importeret</th>
            <th scope="col">Periode</th>
            <th scope="col">Adresse</th>
            <th scope="col" className="num">Linjer</th>
            <th scope="col" className="num">Tons</th>
            <th scope="col"><span className="visually-hidden">Handlinger</span></th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => {
            const name = f.batch?.fileName ?? 'Importeret før filoversigten'
            return (
              <tr key={f.batch?.id ?? 'legacy'}>
                <td>{name}</td>
                <td>{f.batch ? new Date(f.batch.importedAt).toLocaleString('da-DK') : '—'}</td>
                <td>{f.from ? `${formatDate(f.from)} – ${formatDate(f.to)}` : '—'}</td>
                <td>{where(f)}</td>
                <td className="num">{formatNumber(f.lineIds.length, 0)}</td>
                <td className="num">{formatNumber(f.tonnes, 3)}</td>
                <td>
                  <button type="button" className="link" onClick={() => onDelete(f)} aria-label={`Slet ${name} og dens linjer`}>
                    Slet
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
