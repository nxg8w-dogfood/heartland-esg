import { describe, expect, it } from 'vitest'
import { textRule } from './textRule'

describe('textRule', () => {
  it('makes a rule with the condition "Posteringstekst indeholder <text>"', () => {
    const r = textRule('  Microsoft 365, år ', 4)
    expect(r.conditions).toEqual([{ id: expect.any(String), field: 'text', operator: 'contains', value: 'Microsoft 365, år' }])
    expect(r.name).toBe('Posteringstekst: Microsoft 365, år')
    expect(r).toMatchObject({ type: 'tag', active: true, factorId: null, category: 4, reason: '' })
  })

  it('falls back to category 1 when the posting has none', () => {
    expect(textRule('Husleje', null).category).toBe(1)
  })

  it('gives every rule and condition its own id', () => {
    const a = textRule('x', 1)
    const b = textRule('x', 1)
    expect(a.id).not.toBe(b.id)
    expect(a.conditions[0].id).not.toBe(b.conditions[0].id)
  })
})
