import { scope3Categories } from '../calc/scope3'

/** Per category: whether it's relevant, and why. Starts from the original app's defaults. */
export type Relevance = Record<number, { relevant: boolean; reason: string }>

export const defaultRelevance = (): Relevance =>
  Object.fromEntries(scope3Categories.map((c) => [c.nr, { relevant: c.relevantByDefault, reason: c.reason }]))
