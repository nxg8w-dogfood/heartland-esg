import { useEffect, useState } from 'react'
import { useConfirm } from '../confirm'
import { saveStatusText, type SaveStatus } from './saveStatus'

export type { SaveStatus } from './saveStatus'

type Props = {
  storeLabel: string
  central: boolean
  status: SaveStatus
  message: string | null
  /** Missing when the store can't be cleared from the app (shared data in Dataverse) */
  onClear?: () => void
}

/** How long "Gemt" stays on screen after a save. */
const SAVED_MS = 5_000

/**
 * Saving, shown wherever the user is on the page. The data bar is at the top, so an import or
 * a delete made further down saved with nothing to see. Stays while saving and after a failure;
 * "Gemt" disappears by itself.
 */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  const [hiddenAt, setHiddenAt] = useState<number | null>(null)
  const at = status.state === 'saved' ? status.at.getTime() : null
  useEffect(() => {
    if (at === null) return
    const timer = setTimeout(() => setHiddenAt(at), SAVED_MS)
    return () => clearTimeout(timer)
  }, [at])

  if (status.state === 'idle' || (at !== null && at === hiddenAt)) return null
  const kind = status.state === 'failed' ? 'failed' : status.state === 'saved' ? 'saved' : 'pending'
  return (
    <output className={`save-indicator ${kind}`} aria-live="polite">
      {status.state === 'pending' && <span className="save-spinner" aria-hidden="true" />}
      {saveStatusText(status)}
    </output>
  )
}

/** Where the data lives, whether it's saved, and clearing a browser draft. */
export function DataBar({ storeLabel, central, status, message, onClear }: Props) {
  const { confirm, dialog } = useConfirm()
  const statusText = saveStatusText(status)

  // In Dataverse the header says where data lives, so the bar only shows saving and messages.
  if (central && !statusText && !message && !onClear) return null

  return (
    <div className={central ? 'databar' : 'databar notice'} role="region" aria-label="Data og lagring">
      {dialog}
      <p>
        {!central && (
          <>
            <strong>Kladde:</strong> data gemmes kun i {storeLabel}, ikke centralt, og deles ikke med
            andre. Inde i Power Apps gemmes data i Dataverse.{' '}
          </>
        )}
        <span className={status.state === 'failed' ? 'error' : 'muted'} role="status">{statusText}</span>
      </p>
      {message && <p className="muted" role="status">{message}</p>}
      {onClear && (
        <div className="databar-actions">
          <button
            type="button"
            className="link"
            onClick={async () => {
              if (await confirm('Slet alle data for alle virksomheder i denne browser? Det kan ikke fortrydes.', 'Ryd alt')) onClear()
            }}
          >
            Ryd alt
          </button>
        </div>
      )}
    </div>
  )
}
