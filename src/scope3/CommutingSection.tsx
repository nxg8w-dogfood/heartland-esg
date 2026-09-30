import { useId, useState, type Dispatch, type SetStateAction } from 'react'
import type { Factor } from '../data/factors'
import type { Period } from '../calc/dates'
import { surveyResult, type Category7, type CommutingModeId, type ModeAnswers, type Survey, type SurveyResult } from '../calc/commuting'
import { parseNumber } from '../calc/parseNumber'
import { formatFactor, formatNumber } from '../format'
import { newId } from '../newId'

type Props = {
  cat7: Category7
  surveys: Survey[]
  setSurveys: Dispatch<SetStateAction<Survey[]>>
  factors: readonly Factor[]
  period: Period
}

const exampleSurvey = (date: string): Survey => ({
  id: newId(),
  label: 'Pendlingsundersøgelse',
  date,
  employees: 85,
  responses: 52,
  workWeeksPerYear: 46,
  modes: {
    'k7-benzin': { respondents: 14, distanceKm: 22, officeDaysPerWeek: 3.5 },
    'k7-diesel': { respondents: 6, distanceKm: 35, officeDaysPerWeek: 3 },
    'k7-el': { respondents: 9, distanceKm: 28, officeDaysPerWeek: 3.5, factorId: 'f-c-el-dk' },
    'k7-tog': { respondents: 11, distanceKm: 40, officeDaysPerWeek: 3 },
    'k7-cykel': { respondents: 10, distanceKm: 6, officeDaysPerWeek: 4.5 },
    'k7-gaaende': { respondents: 2, distanceKm: 1.5, officeDaysPerWeek: 5 },
  },
})

export function CommutingSection({ cat7, surveys, setSurveys, factors, period }: Props) {
  const defaultDate = period.start
  const id = useId()
  const update = (surveyId: string, patch: Partial<Survey>) =>
    setSurveys((ss) => ss.map((s) => (s.id === surveyId ? { ...s, ...patch } : s)))
  const updateMode = (surveyId: string, modeId: CommutingModeId, patch: Partial<ModeAnswers>) =>
    setSurveys((ss) =>
      ss.map((s) => {
        if (s.id !== surveyId) return s
        const current = s.modes[modeId] ?? { respondents: null, distanceKm: null, officeDaysPerWeek: null }
        return { ...s, modes: { ...s.modes, [modeId]: { ...current, ...patch } } }
      }),
    )
  const counted = new Set(cat7.surveys.map((r) => r.survey.id))

  return (
    <section aria-labelledby={`${id}-heading`}>
      <div className="section-head">
        <h2 id={`${id}-heading`}>Kategori 7 — medarbejderpendling</h2>
        <button type="button" onClick={() => setSurveys((ss) => [...ss, { id: newId(), label: 'Pendlingsundersøgelse', date: defaultDate, employees: null, responses: null, workWeeksPerYear: 46, modes: {} }])}>
          Ny undersøgelse
        </button>
      </div>
      <p className="muted">
        Opgøres ud fra en pendlingsundersøgelse, der skaleres op til hele medarbejderstaben: for
        hvert transportmiddel er km pr. år = afstand én vej × 2 × kontordage pr. uge × arbejdsuger
        × andel af besvarelserne × antal medarbejdere. Hver undersøgelse gælder for det kalenderår,
        den er dateret i, og tæller med for den del af året, der ligger i perioden. Et regnskabsår fra
        juli til juni bruger altså halvdelen af hvert års undersøgelse.
      </p>

      {cat7.duplicateYears.length > 0 && (
        <p className="warning">
          <strong>Flere undersøgelser for samme år ({cat7.duplicateYears.join(', ')}).</strong> Hver
          tæller med for hele året, så pendlingen tælles dobbelt. Behold én undersøgelse pr. år.
        </p>
      )}
      {surveys.length > 0 && cat7.yearsWithoutSurvey.length > 0 && (
        <p className="warning">
          <strong>Ingen undersøgelse for {cat7.yearsWithoutSurvey.join(', ')}.</strong> Pendlingen i
          den del af perioden tæller ikke med. Tilføj en undersøgelse dateret i det år.
        </p>
      )}

      {surveys.length === 0 && (
        <div className="empty">
          <p>Ingen pendlingsundersøgelser.</p>
          <button type="button" className="secondary" onClick={() => setSurveys([exampleSurvey(defaultDate)])}>
            Indsæt eksempelundersøgelse
          </button>
        </div>
      )}

      {surveys.map((s) => (
        <SurveyCard
          key={s.id}
          result={surveyResult(s, factors, period)}
          counted={counted.has(s.id)}
          factors={factors}
          onChange={(patch) => update(s.id, patch)}
          onModeChange={(modeId, patch) => updateMode(s.id, modeId, patch)}
          onDelete={() => {
            if (window.confirm(`Slet ${s.label}?`)) setSurveys((ss) => ss.filter((x) => x.id !== s.id))
          }}
        />
      ))}
    </section>
  )
}

function SurveyCard({ result, counted, factors, onChange, onModeChange, onDelete }: {
  result: SurveyResult
  counted: boolean
  factors: readonly Factor[]
  onChange: (patch: Partial<Survey>) => void
  onModeChange: (modeId: CommutingModeId, patch: Partial<ModeAnswers>) => void
  onDelete: () => void
}) {
  const id = useId()
  const { survey } = result
  const pendingModes = result.modes.filter((m) => m.pending)
  return (
    <article className="card" aria-labelledby={`${id}-label`}>
      <div className="location-settings">
        <div className="field">
          <label id={`${id}-label`} htmlFor={`${id}-name`}>Undersøgelse</label>
          <input id={`${id}-name`} value={survey.label} onChange={(e) => onChange({ label: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-date`}>Dato</label>
          <input id={`${id}-date`} type="date" value={survey.date} onChange={(e) => onChange({ date: e.target.value })} />
        </div>
        <NumberField label="Antal medarbejdere" value={survey.employees} onCommit={(v) => onChange({ employees: v })} />
        <NumberField
          label="Besvarelser"
          hint={result.responseRate === null ? undefined : `svarprocent ${formatNumber(result.responseRate, 0)} %`}
          value={survey.responses}
          onCommit={(v) => onChange({ responses: v })}
        />
        <NumberField label="Arbejdsuger pr. år" value={survey.workWeeksPerYear} onCommit={(v) => onChange({ workWeeksPerYear: v })} />
        <div className="field end">
          <button type="button" className="link" onClick={onDelete}>
            Slet undersøgelse<span className="visually-hidden">: {survey.label}</span>
          </button>
        </div>
      </div>
      {!counted && (
        <p className="warning">
          Undersøgelsen gælder for {result.year ?? 'et ukendt år'}, som ligger uden for perioden, så den
          tæller ikke med. Tallene herunder viser kun hele året.
        </p>
      )}
      {!survey.employees && <p className="warning">Angiv antal medarbejdere — ellers kan besvarelserne ikke skaleres op.</p>}

      <div className="table-wrap">
        <table>
          <caption className="visually-hidden">Transportmidler i {survey.label}</caption>
          <thead>
            <tr>
              <th scope="col">Transportmiddel</th>
              <th scope="col">Besvarelser</th>
              <th scope="col">Afstand én vej (km)</th>
              <th scope="col">Kontordage pr. uge</th>
              <th scope="col" className="num">Andel</th>
              <th scope="col" className="num">km pr. år</th>
              <th scope="col" className="num">Faktor</th>
              <th scope="col" className="num">tCO2e i perioden</th>
            </tr>
          </thead>
          <tbody>
            {result.modes.map((m) => {
              const a = m.answers
              const alternatives = 'alternatives' in m.mode ? m.mode.alternatives : []
              return (
                <tr key={m.mode.id}>
                  <th scope="row">{m.mode.label}</th>
                  <td><NumberField label={`Besvarelser, ${m.mode.label}`} hideLabel value={a?.respondents ?? null} onCommit={(v) => onModeChange(m.mode.id, { respondents: v })} /></td>
                  <td><NumberField label={`Afstand én vej, ${m.mode.label}`} hideLabel value={a?.distanceKm ?? null} onCommit={(v) => onModeChange(m.mode.id, { distanceKm: v })} /></td>
                  <td><NumberField label={`Kontordage pr. uge, ${m.mode.label}`} hideLabel value={a?.officeDaysPerWeek ?? null} onCommit={(v) => onModeChange(m.mode.id, { officeDaysPerWeek: v })} /></td>
                  <td className="num">{formatNumber(m.share * 100, 0)} %</td>
                  <td className="num">{formatNumber(m.kmPerYear, 0)}</td>
                  <td className="num">
                    {alternatives.length > 0 ? (
                      <>
                        <label className="visually-hidden" htmlFor={`${id}-${m.mode.id}-factor`}>Faktor for {m.mode.label}</label>
                        <select id={`${id}-${m.mode.id}-factor`} value={a?.factorId ?? m.mode.factorId} onChange={(e) => onModeChange(m.mode.id, { factorId: e.target.value === m.mode.factorId ? null : e.target.value })}>
                          {[m.mode.factorId, ...alternatives].map((fid) => {
                            const f = factors.find((x) => x.id === fid)
                            return <option key={fid} value={fid}>{f ? `${f.name}: ${formatFactor(f.value ?? 0)}` : fid}</option>
                          })}
                        </select>
                      </>
                    ) : m.mode.id === 'k7-andet' ? (
                      <NumberField label="Egen faktor for andet transportmiddel (kg CO2e/km)" hideLabel placeholder="Faktor mangler" value={a?.customFactor ?? null} onCommit={(v) => onModeChange(m.mode.id, { customFactor: v })} />
                    ) : m.factorValue === null ? (
                      <span className="pending">Faktor mangler</span>
                    ) : (
                      formatFactor(m.factorValue)
                    )}
                  </td>
                  <td className="num strong">{m.pending ? <span className="pending">Afventer</span> : formatNumber(m.tCO2e, 3)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">I alt</th>
              <td className="num strong">{formatNumber(result.totalRespondents, 0)}</td>
              <td colSpan={5} className="muted">
                Hele {result.year ?? 'året'}: {formatNumber(result.annualT, 3)} tCO2e · perioden dækker {formatNumber(result.yearShare * 100, 1)} % af året
              </td>
              <td className="num strong">{formatNumber(result.total, 3)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {pendingModes.length > 0 && (
        <p className="warning">
          {pendingModes.map((m) => m.mode.label).join(', ')} mangler en faktor og tæller ikke med endnu.
        </p>
      )}
    </article>
  )
}

/** A number input that reads Danish formats and commits on blur or Enter. */
function NumberField({ label, hint, value, onCommit, hideLabel, placeholder }: {
  label: string
  hint?: string
  value: number | null
  onCommit: (v: number | null) => void
  hideLabel?: boolean
  placeholder?: string
}) {
  const id = useId()
  const [text, setText] = useState(value === null ? '' : formatFactor(value))
  const [error, setError] = useState<string | null>(null)
  function commit() {
    const v = parseNumber(text)
    if (v !== null && (Number.isNaN(v) || v < 0)) {
      setError(Number.isNaN(v) ? 'Ikke et gyldigt tal.' : 'Kan ikke være negativ.')
      return
    }
    setError(null)
    onCommit(v)
  }
  return (
    <div className={hideLabel ? 'value-input' : 'field'}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : undefined}>
        {label}{hint && <span className="optional"> ({hint})</span>}
      </label>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      {error && <p id={`${id}-err`} className="error">{error}</p>}
    </div>
  )
}
