import { describe, expect, it } from 'vitest'
import { factorPublications } from '../data/factorPublications'
import { factors } from '../data/factors'
import { applyFactorSources, sourceOptions } from './factorSources'

const byId = <T extends { id: string }>(fs: readonly T[], id: string): T => fs.find((f) => f.id === id)!
const ens = 'ens-el-emissionsfaktoren-2025-2035'
const energinet = 'energinet-generel-eldeklaration-2025'

describe('sourceOptions', () => {
  it('offers the built-in table, publications with the factor, manual entry and matching APIs, in that order', () => {
    const opts = sourceOptions(byId(factors, 'f-s2-el-dk-2025'), factorPublications)
    expect(opts.map((o) => o.kind)).toEqual(['builtin', 'publication', 'manual', 'api'])
    expect(opts[1]).toMatchObject({ kind: 'publication', value: 0.0747 })
  })

  it('leaves out publications that do not contain the factor', () => {
    const opts = sourceOptions(byId(factors, 'f-s2-el-dk-2024'), factorPublications)
    expect(opts.some((o) => o.kind === 'publication')).toBe(false)
  })

  it('shows every API provider as unavailable, with a reason', () => {
    for (const o of sourceOptions(byId(factors, 'f-s2-el-dk-2025'), factorPublications)) {
      if (o.kind === 'api') expect(o.provider.unavailable).toBeTruthy()
    }
  })
})

describe('applyFactorSources', () => {
  it('leaves the table as shipped without choices', () => {
    expect(applyFactorSources(factors, {}, factorPublications)).toEqual(factors)
  })

  it('takes value, source and reference from a chosen publication', () => {
    const out = applyFactorSources(factors, { 'f-s2-el-residual-2025': { kind: 'publication', publicationId: energinet } }, factorPublications)
    expect(byId(out, 'f-s2-el-residual-2025')).toMatchObject({ value: 0.34807, source: expect.stringContaining('Energinet'), reference: expect.stringContaining('energinet.dk') })
  })

  it('lets a publication revise a built-in value (ENS 2025 edition)', () => {
    const out = applyFactorSources(factors, { 'f-s2-el-dk-2025': { kind: 'publication', publicationId: ens } }, factorPublications)
    expect(byId(factors, 'f-s2-el-dk-2025')).toMatchObject({ value: 0.05892 })
    expect(byId(out, 'f-s2-el-dk-2025')).toMatchObject({ value: 0.0747 })
  })

  it('records a manual value with its source and date', () => {
    const out = applyFactorSources(factors, { 'f-s2-fjernvarme-lokal': { kind: 'manual', value: 0.08, source: 'HOFOR deklaration 2025', date: '2026-03-01' } }, factorPublications)
    expect(byId(out, 'f-s2-fjernvarme-lokal')).toMatchObject({ value: 0.08, source: 'HOFOR deklaration 2025', reference: 'Indtastet, kildens dato 2026-03-01' })
  })

  it('ignores a publication that no longer has the factor, instead of guessing', () => {
    const out = applyFactorSources(factors, { 'f-s2-el-residual-2026': { kind: 'publication', publicationId: energinet } }, factorPublications)
    expect(byId(out, 'f-s2-el-residual-2026')).toEqual(byId(factors, 'f-s2-el-residual-2026'))
  })

  it('changes nothing else', () => {
    const out = applyFactorSources(factors, { 'f-s2-el-dk-2025': { kind: 'publication', publicationId: ens } }, factorPublications)
    out.forEach((f, i) => { if (f.id !== 'f-s2-el-dk-2025') expect(f).toBe(factors[i]) })
  })
})
