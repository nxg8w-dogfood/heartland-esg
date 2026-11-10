// The lookup through the MotorAPI custom connector (connectors/motorapi/, ADR 0009). Running
// `pa app add data-source` for the connector generates a service with GetVehicle and
// GetVehicleEnvironment; this adapter takes that service, so the app doesn't depend on
// generated code until the connector exists in an environment.

import { fromMotorApi, lookupFailure, type MotorApiEnvironment, type MotorApiVehicle, type PlateLookup } from './lookup'

/** The shape of a generated connector call's result (IOperationResult in @microsoft/power-apps) */
type OperationResult<T> = { success: boolean; data: T; error?: (Error & { status?: number }) | { status?: number } }

export type MotorApiService = {
  GetVehicle: (plate: string) => Promise<OperationResult<MotorApiVehicle>>
  GetVehicleEnvironment: (plate: string) => Promise<OperationResult<MotorApiEnvironment>>
}

export function connectorLookup(service: MotorApiService, now: () => Date = () => new Date()): PlateLookup {
  return {
    available: true,
    label: '',
    lookup: async (plate) => {
      const vehicle = await service.GetVehicle(plate).catch(() => null)
      if (!vehicle) return lookupFailure(undefined)
      if (!vehicle.success || !vehicle.data) return lookupFailure(vehicle.error?.status)
      // The car is still worth having without environment data; the user can add km/l.
      const environment = await service.GetVehicleEnvironment(plate).catch(() => null)
      return fromMotorApi(plate, vehicle.data, environment?.success ? environment.data : null, now().toISOString())
    },
  }
}
