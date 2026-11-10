// Example answers for `npm run dev` in a plain browser, where there is no connector. They let
// the lookup flow be tried and tested without a MotorAPI key. Inside Power Apps the app uses the
// connector instead (or noLookup until it's added). The cars are made up.

import { fromMotorApi, lookupFailure, type MotorApiEnvironment, type MotorApiVehicle, type PlateLookup } from './lookup'

const examples: Record<string, [MotorApiVehicle, MotorApiEnvironment | null]> = {
  AB12345: [
    { type: 'Personbil', make: 'Skoda', model: 'Octavia', variant: '2.0 TDI Style DSG', first_registration: '2022-03-14+01:00', fuel_type: 'Diesel', is_hybrid: false, hybrid_type: null },
    { fuel_type: 'Diesel', fuel_usage: 22.7, total_usage: null, co2_emission: 117, measurement_norm: 'WLTP' },
  ],
  CD23456: [
    { type: 'Personbil', make: 'Toyota', model: 'Yaris', variant: '1.5 Hybrid', first_registration: '2021-09-02+02:00', fuel_type: 'Benzin', is_hybrid: true, hybrid_type: 'mild' },
    { fuel_type: 'Benzin', fuel_usage: null, total_usage: 26.3, co2_emission: 87, measurement_norm: 'WLTP' },
  ],
  EF34567: [
    { type: 'Personbil', make: 'Volkswagen', model: 'Passat', variant: '2.0 TDI', first_registration: '2016-05-20+02:00', fuel_type: 'Diesel', is_hybrid: false, hybrid_type: null },
    { fuel_type: 'Diesel', fuel_usage: 23.8, total_usage: null, co2_emission: 109, measurement_norm: 'NEDC' },
  ],
  GH45678: [
    { type: 'Personbil', make: 'Kia', model: 'Niro', variant: '1.6 GDI Plug-in Hybrid', first_registration: '2020-08-26+02:00', fuel_type: 'Benzin', is_hybrid: true, hybrid_type: 'plugin' },
    { fuel_type: 'Benzin', fuel_usage: 44.2, total_usage: null, co2_emission: 31, measurement_norm: 'WLTP' },
  ],
  JK56789: [
    { type: 'Personbil', make: 'Tesla', model: 'Model 3', first_registration: '2023-01-10+01:00', fuel_type: 'El', is_hybrid: false, hybrid_type: null },
    { fuel_type: 'El', fuel_usage: null, co2_emission: 0, measurement_norm: 'WLTP' },
  ],
}

export const exampleLookup: PlateLookup = {
  available: true,
  label: 'Udviklingsversion: opslag giver eksempeldata, ikke Motorregistret. Prøv AB 12 345, CD 23 456, EF 34 567, GH 45 678 eller JK 56 789.',
  lookup: async (plate) => {
    const found = examples[plate]
    if (!found) return lookupFailure(404)
    return fromMotorApi(plate, found[0], found[1], new Date().toISOString())
  },
}
