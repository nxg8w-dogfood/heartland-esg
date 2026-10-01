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
  it('leaves the table as shipped without choices, apart from how derived factors are described', () => {
    const out = applyFactorSources(factors, {}, factorPublications)
    out.forEach((f, i) => expect(f.value).toBe(factors[i].value))
    expect(out.filter((f, i) => f !== factors[i]).map((f) => f.id)).toEqual(['f-c-el-dk', 'f-c-el-dk-2026'])
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
    out.forEach((f, i) => { if (!['f-s2-el-dk-2025', 'f-c-el-dk', 'f-c-el-dk-2026'].includes(f.id)) expect(f).toBe(factors[i]) })
  })
})

describe('publications', () => {
  it('only name factors that exist, with finite values', () => {
    for (const p of factorPublications) {
      for (const [id, v] of Object.entries(p.values)) {
        expect(factors.some((f) => f.id === id), `${p.id}: ${id}`).toBe(true)
        expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  it('say where in the publication each value is, when they give rows', () => {
    for (const p of factorPublications) if (p.rows) expect(Object.keys(p.rows).sort()).toEqual(Object.keys(p.values).sort())
  })

  it('DESNZ 2026 changes values from 2025 only where the official file does', () => {
    const desnz = factorPublications.find((p) => p.id === 'desnz-ghg-conversion-factors-2026')!
    expect(desnz.values['f-s1-diesel']).toBe(2.58354)
    expect(desnz.values['f-c-el-beis']).toBe(0.02951)
    expect(desnz.values['f-t-fly-kort']).toBe(byId(factors, 'f-t-fly-kort').value)
    const out = applyFactorSources(factors, { 'f-w-plast-forbr': { kind: 'publication', publicationId: desnz.id } }, factorPublications)
    expect(byId(out, 'f-w-plast-forbr').reference).toContain('Combustion')
  })
})

describe('the DK-adjusted electric car', () => {
  it('keeps the original 2025 value with the built-in table', () => {
    expect(byId(applyFactorSources(factors, {}, factorPublications), 'f-c-el-dk').value).toBe(0.01347)
  })

  it('gives 2026 from DESNZ 2026 and the 2026 Danish grid mix', () => {
    const out = applyFactorSources(factors, {}, factorPublications)
    expect(byId(out, 'f-c-el-dk-2026').value).toBe(0.01145)
    expect(byId(out, 'f-c-el-dk-2026').value).toBe(byId(factors, 'f-c-el-dk-2026').value)
  })

  it('follows the source chosen for the Danish grid mix', () => {
    const out = applyFactorSources(factors, {
      'f-s2-el-dk-2025': { kind: 'publication', publicationId: ens },
      'f-s2-el-dk-2026': { kind: 'publication', publicationId: ens },
    }, factorPublications)
    expect(byId(out, 'f-c-el-dk').value).toBe(0.01708)
    expect(byId(out, 'f-c-el-dk-2026').value).toBe(0.01426)
    expect(byId(out, 'f-c-el-dk-2026').source).toContain('Energistyrelsen')
  })

  it('is pending while its grid factor has no value', () => {
    const out = applyFactorSources(factors.map((f) => (f.id === 'f-s2-el-dk-2026' ? { ...f, value: null } : f)), {}, factorPublications)
    expect(byId(out, 'f-c-el-dk-2026').value).toBeNull()
  })

  it('uses a value chosen for the derived factor itself instead', () => {
    const out = applyFactorSources(factors, { 'f-c-el-dk-2026': { kind: 'manual', value: 0.012, source: 'Egen måling', date: '' } }, factorPublications)
    expect(byId(out, 'f-c-el-dk-2026').value).toBe(0.012)
  })
})
