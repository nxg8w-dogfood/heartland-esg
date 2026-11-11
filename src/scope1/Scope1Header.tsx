import { scope1Href, scope1Subpages, type Scope1SubpageId } from './subpages'

/** Scope 1's heading and the links between its pages, shown at the top of each of them. */
export function Scope1Header({ subpage }: { subpage: Scope1SubpageId }) {
  return (
    <>
      <h1>Scope 1 — direkte udledninger</h1>
      <nav aria-label="Scope 1" className="subnav">
        <ul>
          {scope1Subpages.map((p) => (
            <li key={p.id}>
              <a href={scope1Href(p.id)} aria-current={p.id === subpage ? 'page' : undefined}>{p.label}</a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
