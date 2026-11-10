import { useEffect, useId, useRef, useState } from 'react'
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

/**
 * A "Data" menu in the header: where the data lives, whether it's saved, and backup export,
 * import and clear. The save status stays visible next to the button; a failed save also
 * opens the menu, so the backup button is in reach.
 */
export function DataBar({ storeLabel, central, status, message, group, onReplace, onClear }: Props) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [open, setOpen] = useState(() => message !== null)
  const failed = status.state === 'failed'
  // A new message (a backup loaded, data cleared) opens the menu so it's seen.
  const [shownMessage, setShownMessage] = useState(message)
  if (message !== shownMessage) {
    setShownMessage(message)
    if (message) setOpen(true)
  }

  // Close on a click outside, but not while the file picker is open.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

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
    <div
      ref={root}
      className="data-menu"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          setOpen(false)
          button.current?.focus()
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className="secondary data-menu-button"
        aria-expanded={open || failed}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((o) => !o)}
      >
        Data
      </button>
      <span className={failed ? 'error data-menu-status' : 'muted data-menu-status'} role="status">{statusText}</span>
      <div id={`${id}-panel`} className={central ? 'data-menu-panel' : 'data-menu-panel notice'} role="region" aria-label="Data og lagring" hidden={!(open || failed)}>
      <p>
        {central ? (
          <>Data gemmes i {storeLabel}.</>
        ) : (
          <>
            <strong>Kladde:</strong> data gemmes kun i {storeLabel}, ikke centralt, og deles ikke med
            andre. Lagring i Dataverse kommer. Eksportér en backup jævnligt.
          </>
        )}
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
    </div>
  )
}
