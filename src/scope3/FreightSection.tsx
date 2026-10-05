import { useId, type Dispatch, type SetStateAction } from 'react'
import { ActivityLinesSection } from '../activity/ActivityLinesSection'
import type { ActivityLine } from '../calc/activity'
import { category4Groups, category4SpendGroups, type Category4 } from '../calc/scope3'
import type { SpendLine } from '../calc/spend'
import type { Factor } from '../data/factors'
import { formatDate, formatFactor, formatNumber } from '../format'
import { newId } from '../newId'
import { AddSpendForm } from './PurchasesSection'

type Props = {
  cat4: Category4
  lines: ActivityLine[]
  setLines: Dispatch<SetStateAction<ActivityLine[]>>
  spendLines: SpendLine[]
  setSpendLines: Dispatch<SetStateAction<SpendLine[]>>
  factors: readonly Factor[]
  defaultDate: string
  /** Shown when category 4 is marked not relevant */
  excludedNote?: string
}

const examples = (year: string): Omit<ActivityLine, 'id'>[] => [
  { group: 'k4-lastbil', date: `${year}-01-01`, dateTo: `${year}-12-31`, quantity: 18_000, description: 'Varer fra leverandør, 60 leverancer × 1 t × 300 km' },
  { group: 'k4-fragt-skib', date: `${year}-04-10`, quantity: 160_000, description: 'Container Shanghai–Aarhus, 8 t × 20.000 km' },
  { group: 'k4-fragt-fly', date: `${year}-09-02`, quantity: 1_400, description: 'Hasteforsendelse, 0,2 t × 7.000 km' },
]

/** Category 4: inbound freight by tonne-km, and courier and parcels by spend. */
export function FreightSection({ cat4, lines, setLines, spendLines, setSpendLines, factors, defaultDate, excludedNote }: Props) {
  const id = useId()
  const hidden = spendLines.length - cat4.courier.length
  return (
    <>
      <ActivityLinesSection
        title="Kategori 4 — upstream transport og distribution"
        intro="Transport af indkøbte varer til virksomheden i køretøjer, I ikke selv ejer eller driver. Angiv mængden i tonkm: vægt i tons × transporteret afstand i km. Faktorerne er DESNZ' gennemsnit for hver transportform, fordi køretøj, lastgrad og rute ikke registreres; vælg en anden kilde under Faktorer, hvis transportøren oplyser sin egen. Kurér og pakker opgøres efter beløb nedenfor."
        groups={category4Groups}
        factors={factors}
        summary={cat4.freight}
        lines={lines}
        setLines={setLines}
        defaultDate={defaultDate}
        emptyText="Ingen fragt i perioden."
        examples={examples(defaultDate.slice(0, 4))}
      />
      {excludedNote && <p className="muted">{excludedNote}</p>}

      <section aria-labelledby={`${id}-courier`}>
        <h3 id={`${id}-courier`}>Kurér og pakkelevering</h3>
        <p className="muted">
          Spendbaseret som kategori 1: beløbet omregnes til EUR og ganges med EXIOBASE-faktoren for
          sektoren &quot;Post and Telecommunication&quot;. Den faktor har ingen værdi i den indbyggede
          tabel, så linjerne afventer, til en kilde er valgt under Faktorer.
        </p>
        {cat4.courier.length > 0 && (
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">Kurér og pakkelevering i perioden</caption>
              <thead>
                <tr>
                  <th scope="col">Dato</th>
                  <th scope="col">Beskrivelse</th>
                  <th scope="col" className="num">Beløb i perioden</th>
                  <th scope="col" className="num">Faktor</th>
                  <th scope="col" className="num">tCO2e</th>
                  <th scope="col"><span className="visually-hidden">Handlinger</span></th>
                </tr>
              </thead>
              <tbody>
                {cat4.courier.map((r) => (
                  <tr key={r.line.id}>
                    <td>
                      {formatDate(r.line.date)}
                      {r.line.dateTo && r.line.dateTo > r.line.date && <> – {formatDate(r.line.dateTo)}</>}
                    </td>
                    <td>{r.line.description}</td>
                    <td className="num">{r.line.amount === null ? '—' : `${formatNumber(r.line.amount * r.share, 0)} ${r.line.currency}`}</td>
                    <td className="num">{r.factorValue === null ? <span className="pending">Faktor mangler</span> : <>{formatFactor(r.factorValue)}<span className="sub">{r.factor?.unit}</span></>}</td>
                    <td className="num strong">
                      {r.pending ? <span className="pending">Afventer</span> : formatNumber(r.tCO2e, 3)}
                      {r.warning && <span className="sub warning-text">{r.warning}</span>}
                    </td>
                    <td>
                      <button type="button" className="link" onClick={() => setSpendLines((ls) => ls.filter((l) => l.id !== r.line.id))} aria-label={`Slet kurérlinje, ${formatDate(r.line.date)}`}>
                        Slet
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={4}>Kategori 4 i alt (fragt og kurér)</th>
                  <td className="num strong">{formatNumber(cat4.total, 3)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {hidden > 0 && <p className="muted">{hidden === 1 ? '1 linje ligger' : `${hidden} linjer ligger`} uden for perioden og vises ikke, men er ikke slettet.</p>}
        <AddSpendForm
          defaultDate={defaultDate}
          groups={category4SpendGroups}
          label="Tilføj kurér og pakker"
          groupLabel="Type"
          onAdd={(line) => setSpendLines((ls) => [...ls, { ...line, id: newId() }])}
        />
      </section>
    </>
  )
}
