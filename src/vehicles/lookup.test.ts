import { describe, expect, it } from 'vitest'
import { connectorLookup } from './connectorLookup'
import { exampleLookup } from './exampleLookup'
import { fromMotorApi, lookupFailure, noLookup, type MotorApiEnvironment, type MotorApiVehicle } from './lookup'

const at = '2026-11-10T09:00:00.000Z'

// Shaped like MotorAPI's documented answers (https://v1.motorapi.dk/doc/), cut to what's used.
const diesel: MotorApiVehicle = {
  registration_number: 'AB12345',
  type: 'Personbil',
  make: 'SKODA',
  model: 'Octavia',
  variant: '2.0 TDI Style DSG',
  first_registration: '2022-03-14+01:00',
  fuel_type: 'Diesel',
  is_hybrid: false,
  hybrid_type: null,
}
const env: MotorApiEnvironment = { fuel_type: 'Diesel', fuel_usage: 22.7, total_usage: null, co2_emission: 117, measurement_norm: 'WLTP' }

describe('fromMotorApi', () => {
  it('maps a diesel car with WLTP data', () => {
    const r = fromMotorApi('AB12345', diesel, env, at)
    expect(r).toEqual({
      ok: true,
      notes: [],
      vehicle: {
        plate: 'AB12345',
        make: 'SKODA',
        model: 'Octavia',
        variant: '2.0 TDI Style DSG',
        fuel: 'diesel',
        firstRegistration: '2022-03-14',
        kmPerLitre: 22.7,
        co2GPerKm: 117,
        testNorm: 'WLTP',
        rangeKm: null,
        source: 'lookup',
        fetchedAt: at,
      },
    })
  })

  it('maps petrol ("Benzin") to benzin, in any case', () => {
    const r = fromMotorApi('CD23456', { ...diesel, fuel_type: 'BENZIN' }, { ...env, fuel_type: 'Benzin' }, at)
    expect(r.ok && r.vehicle.fuel).toBe('benzin')
  })

  it('uses total_usage when fuel_usage is missing, as for some hybrids', () => {
    const r = fromMotorApi('CD23456', { ...diesel, is_hybrid: true, hybrid_type: 'mild' }, { ...env, fuel_usage: null, total_usage: 26.3 }, at)
    expect(r.ok && r.vehicle.kmPerLitre).toBe(26.3)
  })

  it('falls back to the environment’s fuel type', () => {
    const r = fromMotorApi('AB12345', { ...diesel, fuel_type: null }, env, at)
    expect(r.ok && r.vehicle.fuel).toBe('diesel')
  })

  it('flags NEDC figures, which understate real consumption', () => {
    const r = fromMotorApi('AB12345', diesel, { ...env, measurement_norm: 'NEDC' }, at)
    expect(r.ok && r.vehicle.testNorm).toBe('NEDC')
    expect(r.ok && r.notes.join(' ')).toMatch(/NEDC/)
  })

  it('leaves an unknown test standard empty', () => {
    const r = fromMotorApi('AB12345', diesel, { ...env, measurement_norm: 'EU-norm 2000' }, at)
    expect(r.ok && r.vehicle.testNorm).toBeNull()
  })

  it.each([
    ['missing', null],
    ['zero', 0],
    ['negative', -1],
    ['not a number', Number.NaN],
  ])('leaves fuel economy empty, with a note, when it’s %s', (_, value) => {
    const r = fromMotorApi('AB12345', diesel, { ...env, fuel_usage: value, total_usage: null }, at)
    expect(r.ok && r.vehicle.kmPerLitre).toBeNull()
    expect(r.ok && r.notes.join(' ')).toMatch(/brændstofforbrug/)
  })

  it('still returns the car when the environment call failed', () => {
    const r = fromMotorApi('AB12345', diesel, null, at)
    expect(r.ok).toBe(true)
    expect(r.ok && r.vehicle).toMatchObject({ kmPerLitre: null, co2GPerKm: null, testNorm: null })
    expect(r.ok && r.notes.join(' ')).toMatch(/Miljødata/)
  })

  it('keeps only the date of the first registration', () => {
    const r = fromMotorApi('AB12345', { ...diesel, first_registration: '2013-12-18+01:00' }, env, at)
    expect(r.ok && r.vehicle.firstRegistration).toBe('2013-12-18')
    const none = fromMotorApi('AB12345', { ...diesel, first_registration: '' }, env, at)
    expect(none.ok && none.vehicle.firstRegistration).toBeNull()
  })

  it('notes a vehicle that isn’t a passenger car', () => {
    const r = fromMotorApi('AB12345', { ...diesel, type: 'Varebil' }, env, at)
    expect(r.ok && r.notes.join(' ')).toMatch(/varebil/)
  })

  it('trims text and drops an empty variant', () => {
    const r = fromMotorApi('AB12345', { ...diesel, make: ' SKODA ', variant: '  ' }, env, at)
    expect(r.ok && r.vehicle.make).toBe('SKODA')
    expect(r.ok && r.vehicle.variant).toBeUndefined()
  })

  it.each([['El'], ['Brint'], [null]])('refuses a car running on %s', (fuel) => {
    const r = fromMotorApi('JK56789', { ...diesel, fuel_type: fuel }, { ...env, fuel_type: fuel }, at)
    expect(r).toMatchObject({ ok: false, reason: 'not-supported' })
  })

  it('refuses a plug-in hybrid, whose km can’t be turned into litres', () => {
    const r = fromMotorApi('GH45678', { ...diesel, fuel_type: 'Benzin', is_hybrid: true, hybrid_type: 'plugin' }, env, at)
    expect(r).toMatchObject({ ok: false, reason: 'not-supported' })
    expect(!r.ok && r.message).toMatch(/plugin-hybrid/)
  })
})

describe('lookupFailure', () => {
  it.each([
    [404, 'not-found'],
    [403, 'limit'],
    [401, 'failed'],
    [503, 'failed'],
    [undefined, 'failed'],
  ] as const)('maps HTTP %s to %s', (status, reason) => {
    expect(lookupFailure(status).reason).toBe(reason)
  })
})

describe('the lookups the app ships', () => {
  it('noLookup offers manual entry only', async () => {
    expect(noLookup.available).toBe(false)
    expect(await noLookup.lookup('AB12345')).toMatchObject({ ok: false, reason: 'unavailable' })
  })

  it('exampleLookup answers its example plates and nothing else', async () => {
    expect(await exampleLookup.lookup('AB12345')).toMatchObject({ ok: true, vehicle: { fuel: 'diesel', kmPerLitre: 22.7 } })
    expect(await exampleLookup.lookup('ZZ99999')).toMatchObject({ ok: false, reason: 'not-found' })
  })
})

describe('connectorLookup', () => {
  const ok = <T,>(data: T) => Promise.resolve({ success: true, data })
  const fail = (status?: number) => Promise.resolve({ success: false, data: undefined as never, error: { status } })
  const now = () => new Date(at)

  it('calls both operations and maps the answers', async () => {
    const calls: string[] = []
    const lookup = connectorLookup({
      GetVehicle: (p) => { calls.push(`vehicle ${p}`); return ok(diesel) },
      GetVehicleEnvironment: (p) => { calls.push(`environment ${p}`); return ok(env) },
    }, now)
    expect(await lookup.lookup('AB12345')).toMatchObject({ ok: true, vehicle: { kmPerLitre: 22.7, fetchedAt: at } })
    expect(calls).toEqual(['vehicle AB12345', 'environment AB12345'])
  })

  it.each([[404, 'not-found'], [403, 'limit'], [401, 'failed'], [undefined, 'failed']] as const)(
    'reports HTTP %s from the vehicle call as %s, without calling for environment data',
    async (status, reason) => {
      let envCalled = false
      const lookup = connectorLookup({ GetVehicle: () => fail(status), GetVehicleEnvironment: () => { envCalled = true; return ok(env) } }, now)
      expect(await lookup.lookup('AB12345')).toMatchObject({ ok: false, reason })
      expect(envCalled).toBe(false)
    },
  )

  it('reports a call that throws as failed', async () => {
    const lookup = connectorLookup({ GetVehicle: () => Promise.reject(new Error('network')), GetVehicleEnvironment: () => ok(env) }, now)
    expect(await lookup.lookup('AB12345')).toMatchObject({ ok: false, reason: 'failed' })
  })

  it.each([['fails', () => fail(503)], ['throws', () => Promise.reject(new Error('x'))]])(
    'still returns the car when the environment call %s',
    async (_, environment) => {
      const lookup = connectorLookup({ GetVehicle: () => ok(diesel), GetVehicleEnvironment: environment as () => Promise<never> }, now)
      expect(await lookup.lookup('AB12345')).toMatchObject({ ok: true, vehicle: { kmPerLitre: null } })
    },
  )
})
