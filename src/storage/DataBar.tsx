import { useRef, useState } from 'react'
import { parseGroup, type GroupData } from './group'

export type SaveStatus =
  | { state: 'idle' }
  | { state: 'pending' }
  | { state: 'saved'; at: Date }
  | { state: 'failed' }

type Props = {
  storeLabel: string
  central: boolean
  status: SaveStatus
  message: string | null
  group: GroupData
  onReplace: (group: GroupData, message: string | null) => void
  onClear: () => void
}

/** Where the data lives, whether it's saved, and backup export, import and clear. */
export function DataBar({ storeLabel, central, status, message, group, onReplace, onClear }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(group, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `klimaregnskab-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importBackup = async (file: File) => {
    let parsed
    try {
      parsed = parseGroup(JSON.parse(await file.text()))
    } catch {
      setImportError('Filen kunne ikke læses som en backup.')
      return
    }
    if (!parsed.ok) {
      setImportError(parsed.error)
      return
    }
    if (!window.confirm(`Erstat alle nuværende data for alle virksomheder med indholdet af ${file.name}? Det kan ikke fortrydes — eksportér en backup først, hvis du er i tvivl.`)) return
    setImportError(null)
    onReplace(parsed.group, `Backup indlæst fra ${file.name}.${parsed.dropped ? ` ${parsed.dropped} poster kunne ikke bruges og er udeladt.` : ''}${parsed.notes.map((n) => ` ${n}`).join('')}`)
  }

  const statusText =
    status.state === 'pending' ? 'Gemmer …'
      : status.state === 'saved' ? `Gemt kl. ${status.at.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
        : status.state === 'failed' ? 'Kunne ikke gemme — eksportér en backup for ikke at miste data'
          : ''

  return (
    <div className={central ? 'databar' : 'databar notice'} role="region" aria-label="Data og lagring">
      <p>
        {central ? (
          <>Data gemmes i {storeLabel}.</>
        ) : (
          <>
            <strong>Kladde:</strong> data gemmes kun i {storeLabel}, ikke centralt, og deles ikke med
            andre. Lagring i Dataverse kommer. Eksportér en backup jævnligt.
          </>
        )}{' '}
        <span className={status.state === 'failed' ? 'error' : 'muted'} role="status">{statusText}</span>
      </p>
      {message && <p className="muted" role="status">{message}</p>}
      <div className="databar-actions">
        <button type="button" className="secondary" onClick={exportBackup}>Eksportér backup</button>
        <button type="button" className="secondary" onClick={() => fileInput.current?.click()}>Indlæs backup</button>
        <input
          ref={fileInput}
          hidden
          tabIndex={-1}
          aria-hidden="true"
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void importBackup(f)
          }}
        />
        <button
          type="button"
          className="link"
          onClick={() => {
            if (window.confirm('Slet alle data for alle virksomheder i denne browser? Det kan ikke fortrydes — eksportér en backup først, hvis du er i tvivl.')) onClear()
          }}
        >
          Ryd alt
        </button>
      </div>
      {importError && <p className="error" role="alert">{importError}</p>}
    </div>
  )
}
