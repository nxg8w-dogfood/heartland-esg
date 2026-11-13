import { useConfirm } from '../confirm'
import { formatNumber } from '../format'

export type SaveStatus =
  | { state: 'idle' }
  /** done and total: how many of a long save's changes are sent */
  | { state: 'pending'; done?: number; total?: number }
  | { state: 'saved'; at: Date }
  | { state: 'failed'; reason?: string }

type Props = {
  storeLabel: string
  central: boolean
  status: SaveStatus
  message: string | null
  /** Missing when the store can't be cleared from the app (shared data in Dataverse) */
  onClear?: () => void
}

/** From how many changes a save shows its progress (an import is thousands). */
const LONG_SAVE = 50

/** Where the data lives, whether it's saved, and clearing a browser draft. */
export function DataBar({ storeLabel, central, status, message, onClear }: Props) {
  const { confirm, dialog } = useConfirm()
  const statusText =
    status.state === 'pending'
      ? status.total && status.total > LONG_SAVE
        ? `Gemmer ${formatNumber(status.done ?? 0, 0)} af ${formatNumber(status.total, 0)} ændringer … Luk ikke appen, før det er gemt.`
        : 'Gemmer …'
      : status.state === 'saved' ? `Gemt kl. ${status.at.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
        : status.state === 'failed' ? `Kunne ikke gemme${status.reason ? `: ${status.reason}` : ''}`
          : ''

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
