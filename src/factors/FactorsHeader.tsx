import { factorsHref, factorsSubpages, type FactorsSubpageId } from './subpages'

/** Faktorer's heading and the links between its pages, shown at the top of each of them. */
export function FactorsHeader({ subpage }: { subpage: FactorsSubpageId }) {
  return (
    <>
      <h1>Faktorer</h1>
      <nav aria-label="Faktorer" className="subnav">
        <ul>
          {factorsSubpages.map((p) => (
            <li key={p.id}>
              <a href={factorsHref(p.id)} aria-current={p.id === subpage ? 'page' : undefined}>{p.label}</a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
