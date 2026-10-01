// Where each factor's value comes from: the built-in table, an official publication, an API, or
// a value entered by hand. The choice and the value it gave are stored together, so a locked
// report can always be reproduced, whatever the source later says.

import type { Factor } from '../data/factors'
import type { FactorPublication } from '../data/factorPublications'
import { derivedFactors, roundDerived } from '../data/derivedFactors'

export type FactorSourceChoice =
  | { kind: 'builtin' }
  | { kind: 'publication'; publicationId: string }
  | { kind: 'manual'; value: number; source: string; date: string }
  | { kind: 'api'; providerId: string; value: number; fetchedAt: string; request: string }

/** Factor id → choice. Factors without an entry use the built-in table. */
export type FactorSources = Record<string, FactorSourceChoice>

export type ApiProvider = {
  id: string
  name: string
  /** Why it can't be used yet, when it can't */
  unavailable?: string
  supports: (factor: Factor) => boolean
}

/** API providers the app knows about. None can be called yet; each says why. */
export const apiProviders: readonly ApiProvider[] = [
  {
    id: 'energinet-eds',
    name: 'Energinet – Energi Data Service (API)',
    unavailable: 'Energinet leverer timeværdier. Et årstal skal beregnes forbrugsvægtet og kontrolleres mod Energinets officielle deklaration, før det kan bruges.',
    supports: (f) => f.family === 'el-dk-location',
  },
  {
    id: 'climatiq',
    name: 'Climatiq (API)',
    unavailable: 'Kræver en kommerciel licens (Data Pro, fra €3.000/år), en API-nøgle i Key Vault og en server-side connector.',
    supports: (f) => f.method === 'spend' || f.category.startsWith('Kat 6') || f.category.startsWith('Kat 5') || f.scope === 'Scope 1' || f.category.includes('market-based'),
  },
]

export type SourceOption =
  | { kind: 'builtin'; label: string; value: number | null }
  | { kind: 'publication'; label: string; value: number; publication: FactorPublication }
  | { kind: 'manual'; label: string }
  | { kind: 'api'; label: string; provider: ApiProvider }

export function sourceOptions(factor: Factor, publications: readonly FactorPublication[]): SourceOption[] {
  return [
    { kind: 'builtin', label: `Indbygget tabel: ${factor.source}`, value: factor.value },
    ...publications
      .filter((p) => factor.id in p.values)
      .map((p): SourceOption => ({ kind: 'publication', label: `${p.name} (${p.published})`, value: p.values[factor.id], publication: p })),
    { kind: 'manual', label: 'Anden kilde (indtast værdi)' },
    ...apiProviders.filter((a) => a.supports(factor)).map((provider): SourceOption => ({ kind: 'api', label: provider.name, provider })),
  ]
}

/**
 * The factor table with each factor's value and source taken from its chosen source. Derived
 * factors (src/data/derivedFactors.ts) are then recalculated from the chosen values, unless a
 * source was chosen for the derived factor itself.
 */
export function applyFactorSources(
  base: readonly Factor[],
  sources: FactorSources,
  publications: readonly FactorPublication[],
): Factor[] {
  const chosen = chooseSources(base, sources, publications)
  return chosen.map((f) => {
    const d = derivedFactors.find((x) => x.id === f.id)
    const own = sources[f.id]
    if (!d || (own && own.kind !== 'builtin')) return f
    const grid = chosen.find((x) => x.id === d.gridId)
    if (!grid) return f
    return {
      ...f,
      value: grid.value === null ? null : roundDerived(d.kWhPerKm * grid.value),
      source: `Afledt: ${d.basis} × ${grid.source}`,
      reference: `${d.kWhPerKm.toFixed(4).replace('.', ',')} kWh/km × ${grid.name} ${grid.validFrom?.slice(0, 4) ?? ''}`.trim(),
    }
  })
}

function chooseSources(
  base: readonly Factor[],
  sources: FactorSources,
  publications: readonly FactorPublication[],
): Factor[] {
  return base.map((f) => {
    const choice = sources[f.id]
    if (!choice || choice.kind === 'builtin') return f
    if (choice.kind === 'publication') {
      const p = publications.find((x) => x.id === choice.publicationId)
      if (!p || !(f.id in p.values)) return f
      return { ...f, value: p.values[f.id], source: p.name, reference: p.rows?.[f.id] ? `${p.rows[f.id]} (${p.url})` : p.url }
    }
    if (choice.kind === 'manual') return { ...f, value: choice.value, source: choice.source || 'Indtastet', reference: choice.date ? `Indtastet, kildens dato ${choice.date}` : 'Indtastet' }
    return { ...f, value: choice.value, source: apiProviders.find((a) => a.id === choice.providerId)?.name ?? choice.providerId, reference: `${choice.request}, hentet ${choice.fetchedAt}` }
  })
}
