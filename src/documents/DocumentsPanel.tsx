import { useId, useState } from 'react'
import { formatBytes, formatDate } from '../format'
import { MAX_DOCUMENT_BYTES, type DocumentList, type StoredDocument } from '../storage/documents'

/**
 * The documents on one holding (ADR 0029), line or commuting survey (ADR 0035), such as the
 * company's own ESG report or a supplier's invoice: each can be downloaded or deleted, and files
 * are added the moment they're chosen.
 */
export function DocumentsPanel({ parentId, owner, what, example, documents, confirm }: {
  /** The holding, line or survey */
  parentId: string
  /** Names it in the delete question, e.g. the company or "Diesel, 01.03.2025" */
  owner: string
  /** What it is, e.g. "investeringen" or "linjen" */
  what: string
  /** An example of a document, in the file field's label */
  example: string
  documents: DocumentList
  confirm: (message: string, confirmLabel?: string) => Promise<boolean>
}) {
  const list = documents.of(parentId)
  const loadError = documents.error
  const onChange = documents.update
  const id = useId()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!documents.store) {
    return (
      <section className="documents" aria-labelledby={`${id}-h`}>
        <h3 id={`${id}-h`}>Dokumentation</h3>
        <p className="muted">Dokumenter kan kun gemmes, når appen kører i Power Apps.</p>
      </section>
    )
  }
  const store = documents.store
  const saved = documents.saved

  async function add(files: FileList) {
    setError(null)
    for (const file of Array.from(files)) {
      if (file.size > MAX_DOCUMENT_BYTES) { setError(`${file.name} er større end ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB og blev ikke gemt.`); continue }
      setBusy(file.name)
      try {
        const doc = await store.add(parentId, file)
        onChange((ds) => [...ds, doc])
      } catch (e) {
        setError(e instanceof Error ? e.message : `Kunne ikke gemme ${file.name}.`)
      }
    }
    setBusy(null)
  }

  async function download(doc: StoredDocument) {
    setError(null)
    try {
      const url = URL.createObjectURL(await store.download(doc))
      const a = document.createElement('a')
      a.href = url
      a.download = doc.name
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      setError(e instanceof Error ? e.message : `Kunne ikke hente ${doc.name}.`)
    }
  }

  async function remove(doc: StoredDocument) {
    if (!(await confirm(`Slet ${doc.name} fra ${owner || what}? Det kan ikke fortrydes.`))) return
    setError(null)
    try {
      await store.remove(doc.id)
      onChange((ds) => ds.filter((d) => d.id !== doc.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : `Kunne ikke slette ${doc.name}.`)
    }
  }

  return (
    <section className="documents" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`}>Dokumentation</h3>
      {loadError ? <p className="error" role="alert">{loadError}</p>
        : list === null ? <p className="muted">Henter dokumenter …</p>
          : list.length === 0 ? <p className="muted">Ingen dokumenter endnu.</p>
            : (
              <ul className="plain">
                {list.map((d) => (
                  <li key={d.id}>
                    <button type="button" className="link" onClick={() => download(d)}>
                      {d.name}<span className="visually-hidden"> (hent)</span>
                    </button>
                    <span className="sub">{[formatBytes(d.size), d.uploadedOn && `tilføjet ${formatDate(d.uploadedOn)}`].filter(Boolean).join(' · ')}</span>{' '}
                    <button type="button" className="link" onClick={() => remove(d)}>
                      Slet<span className="visually-hidden"> {d.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
      <div className="field wide">
        <label htmlFor={`${id}-file`}>Tilføj dokument<span className="optional"> (fx {example}, højst {MAX_DOCUMENT_BYTES / 1024 / 1024} MB)</span></label>
        <input
          id={`${id}-file`} type="file" multiple disabled={!saved || busy !== null}
          aria-describedby={saved ? undefined : `${id}-wait`}
          onChange={(e) => {
            const input = e.currentTarget
            if (input.files?.length) void add(input.files).then(() => { input.value = '' })
          }}
        />
        {!saved && <p id={`${id}-wait`} className="sub">Gemmer … Dokumenter kan tilføjes, når {what} er gemt.</p>}
      </div>
      {busy && <p className="muted" role="status">Gemmer {busy} …</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}
