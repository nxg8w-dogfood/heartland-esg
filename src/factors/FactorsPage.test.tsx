import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { factors } from '../data/factors'
import { FactorsPage } from './FactorsPage'

it('folds the factors per municipality into one closed group, drawn only when opened', () => {
  const html = renderToStaticMarkup(<FactorsPage base={factors} factors={factors} publications={[]} sources={{}} onChoose={() => {}} />)
  expect(html).toContain('Elmiks pr. kommune (392 faktorer)')
  expect(html).not.toContain('factor-f-s2-el-kommune-101-2025')
  expect(html).toContain('factor-f-s2-el-dk1-2025')
})
