import type { Location } from '../calc/scope2'
import { newId } from '../newId'

/** The original app's starting location: Danish grid mix, residual mix, BEIS heating fallback. */
export const defaultLocation = (): Location => ({
  id: newId(),
  name: 'Hovedkontor',
  gridFamily: 'el-dk-location',
  marketInstrument: 'residualmiks',
  heatingFactorId: 'f-s2-fjernvarme-beis',
})
