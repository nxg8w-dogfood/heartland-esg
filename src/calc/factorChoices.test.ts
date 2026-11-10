import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { factorChoices } from './factorChoices'

const ids = (defaultId: string) => factorChoices(defaultId, factors).map((f) => f.id)

describe('factorChoices', () => {
  it('offers the same factor for every region, default first', () => {
    expect(ids('f-hotel-dk')).toEqual([
      'f-hotel-dk', 'f-hotel-uk', 'f-hotel-fr', 'f-hotel-de', 'f-hotel-nl', 'f-hotel-es', 'f-hotel-ch', 'f-hotel-us', 'f-hotel-it',
    ])
    expect(ids('f-exio-obs-dk')).toEqual(['f-exio-obs-dk', 'f-exio-obs-cn', 'f-exio-obs-se', 'f-exio-obs-fr', 'f-exio-obs-nl', 'f-exio-obs-scot'])
  })

  it('offers nothing else when the factor has no other region, so a line keeps to its type', () => {
    // Diesel and petrol share category and unit, but a diesel line is not offered petrol.
    expect(ids('f-s1-diesel')).toEqual(['f-s1-diesel'])
    expect(ids('f-t-tog')).toEqual(['f-t-tog'])
    expect(ids('f-w-papir-dep')).toEqual(['f-w-papir-dep'])
    expect(ids('f-exio-computer')).toEqual(['f-exio-computer'])
  })

  it('offers a family of date versions once', () => {
    expect(ids('f-s2-el-dk-2025')).toEqual(['f-s2-el-dk-2025'])
  })

  it('is empty for an unknown factor', () => {
    expect(factorChoices('nope', factors)).toEqual([])
  })
})
