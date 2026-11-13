import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'

type Pending = { message: string; confirmLabel: string; resolve: (ok: boolean) => void; opener: Element | null }

/**
 * An in-app replacement for window.confirm. The Power Apps host runs the app in a sandboxed
 * frame without `allow-modals`, where window.confirm returns false at once without showing
 * anything, so a delete guarded by it never happened.
 *
 * Render `dialog` once in the component, then `if (!(await confirm('Slet …?'))) return`.
 * Cancel has focus first, Escape cancels, and focus goes back to the button that asked. The
 * dialog is empty while closed, so its heading isn't part of the page.
 */
export function useConfirm(): { confirm: (message: string, confirmLabel?: string) => Promise<boolean>; dialog: ReactNode } {
  const id = useId()
  const ref = useRef<HTMLDialogElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = useCallback(
    (message: string, confirmLabel = 'Slet') =>
      new Promise<boolean>((resolve) => setPending((p) => {
        p?.resolve(false)
        return { message, confirmLabel, resolve, opener: document.activeElement }
      })),
    [],
  )

  useEffect(() => {
    const d = ref.current
    if (pending && d && !d.open) d.showModal()
  }, [pending])

  const settle = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
    ref.current?.close()
    // Back to the button that asked, if it's still there (a confirmed delete removes it).
    const opener = pending?.opener
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
  }

  const dialog = (
    <dialog
      ref={ref}
      className="context-dialog"
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-message`}
      onCancel={(e) => { e.preventDefault(); settle(false) }}
    >
      {pending && (
        <>
          <h2 id={`${id}-title`}>Er du sikker?</h2>
          <p id={`${id}-message`}>{pending.message}</p>
          <div className="dialog-actions">
            <button type="button" className="secondary" autoFocus onClick={() => settle(false)}>Annullér</button>{' '}
            <button type="button" onClick={() => settle(true)}>{pending.confirmLabel}</button>
          </div>
        </>
      )}
    </dialog>
  )

  return { confirm, dialog }
}
