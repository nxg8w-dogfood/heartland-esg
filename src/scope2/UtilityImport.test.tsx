import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { UtilityImport } from './UtilityImport'

const location = { id: 'hq', name: 'Hovedkontor', gridFamily: 'el-dk-location', marketInstrument: 'residualmiks' as const, heatingFactorId: 'f-s2-fjernvarme-beis' as const }

describe('UtilityImport', () => {
  it('offers two labelled token fields that the browser will not save', () => {
    const html = renderToStaticMarkup(<UtilityImport period={{ start: '2025-01-01', end: '2025-12-31' }} locations={[location]} lines={[]} setLines={() => {}} />)
    expect(html).toContain('Hent forbrug fra Eloverblik og Varmeoverblik')
    expect(html).toContain('januar 2025 – december 2025')
    expect(html.match(/type="password" autoComplete="off"/g)).toHaveLength(2)
    expect(html).toMatch(/<label for="[^"]+">Eloverblik-token/)
    expect(html).toMatch(/<label for="[^"]+">Varmeoverblik-token/)
  })

  it('says so when no month of the period has ended', () => {
    const html = renderToStaticMarkup(<UtilityImport period={{ start: '2099-01-01', end: '2099-12-31' }} locations={[location]} lines={[]} setLines={() => {}} />)
    expect(html).toContain('ingen afsluttede måneder')
    expect(html).not.toContain('type="password"')
  })
})
