import { useId, useState } from 'react'
import { formatBytes, formatDate } from '../format'
import { MAX_DOCUMENT_BYTES, type Documents, type StoredDocument } from '../storage/documents'

/**
 * The documents on one holding (ADR 0029), such as the company's own ESG report: each can be
 * downloaded or deleted, and files are added the moment they're chosen.
 */
export function InvestmentDocuments({ investmentId, company, documents, list, loadError, onChange, confirm }: {
  investmentId: string
  company: string
  /** null outside Power Apps, where there's nowhere to keep them */
  documents: Documents | null
  /** This holding's documents; null while they load */
  list: readonly StoredDocument[] | null
  loadError: string | null
  onChange: (update: (docs: StoredDocument[]) => StoredDocument[]) => void
  confirm: (message: string, confirmLabel?: string) => Promise<boolean>
}) {
  const id = useId()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!documents) {
    return (
      <section className="documents" aria-labelledby={`${id}-h`}>
        <h3 id={`${id}-h`}>Dokumentation</h3>
        <p className="muted">Dokumenter kan kun gemmes, når appen kører i Power Apps.</p>
      </section>
    )
  }
  const { store, saved } = documents

  async function add(files: FileList) {
    setError(null)
    for (const file of Array.from(files)) {
      if (file.size > MAX_DOCUMENT_BYTES) { setError(`${file.name} er større end ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB og blev ikke gemt.`); continue }
      setBusy(file.name)
      try {
        const doc = await store.add(investmentId, file)
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
    if (!(await confirm(`Slet ${doc.name} fra ${company || 'investeringen'}? Det kan ikke fortrydes.`))) return
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
        <label htmlFor={`${id}-file`}>Tilføj dokument<span className="optional"> (fx selskabets ESG-rapport, højst {MAX_DOCUMENT_BYTES / 1024 / 1024} MB)</span></label>
        <input
          id={`${id}-file`} type="file" multiple disabled={!saved || busy !== null}
          aria-describedby={saved ? undefined : `${id}-wait`}
          onChange={(e) => {
            const input = e.currentTarget
            if (input.files?.length) void add(input.files).then(() => { input.value = '' })
          }}
        />
        {!saved && <p id={`${id}-wait`} className="sub">Gemmer … Dokumenter kan tilføjes, når investeringen er gemt.</p>}
      </div>
      {busy && <p className="muted" role="status">Gemmer {busy} …</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}
