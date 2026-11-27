import { describe, expect, it } from 'vitest'
import { deleteImportQuestion } from './deleteImport'

describe('deleteImportQuestion', () => {
  it('counts the postings that are there, not the ones the file held', () => {
    // An import of 18.802 rows whose save was cut short after 10.034: deleting it removes the
    // 10.034 that exist, and the dialog has to say so (the old text read the import's own count).
    expect(deleteImportQuestion('Finansposter.xlsx', 10034)).toBe('Slet importen Finansposter.xlsx og dens 10.034 posteringer?')
  })

  it('says postering in the singular', () => {
    expect(deleteImportQuestion('En.csv', 1)).toBe('Slet importen En.csv og dens 1 postering?')
  })

  it('handles an import whose rows are all gone', () => {
    expect(deleteImportQuestion('Tom.csv', 0)).toBe('Slet importen Tom.csv og dens 0 posteringer?')
  })
})
