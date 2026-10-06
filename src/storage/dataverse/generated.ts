// The TableApi (store.ts) on top of the services the Power Apps CLI generated for the hlesg_
// tables (src/generated). Loaded only when the app runs inside Power Apps.

import { Hlesg_ejerandelsService } from '../../generated/services/Hlesg_ejerandelsService'
import { Hlesg_faktorkildesService } from '../../generated/services/Hlesg_faktorkildesService'
import { Hlesg_importsService } from '../../generated/services/Hlesg_importsService'
import { Hlesg_indekspunktsService } from '../../generated/services/Hlesg_indekspunktsService'
import { Hlesg_investeringsService } from '../../generated/services/Hlesg_investeringsService'
import { Hlesg_klimaregnskabsService } from '../../generated/services/Hlesg_klimaregnskabsService'
import { Hlesg_koncernsService } from '../../generated/services/Hlesg_koncernsService'
import { Hlesg_linjesService } from '../../generated/services/Hlesg_linjesService'
import { Hlesg_lokationsService } from '../../generated/services/Hlesg_lokationsService'
import { Hlesg_pendlingsService } from '../../generated/services/Hlesg_pendlingsService'
import { Hlesg_posteringsService } from '../../generated/services/Hlesg_posteringsService'
import { Hlesg_prisaarsService } from '../../generated/services/Hlesg_prisaarsService'
import { Hlesg_regelsService } from '../../generated/services/Hlesg_regelsService'
import { Hlesg_relevansesService } from '../../generated/services/Hlesg_relevansesService'
import { Hlesg_virksomhedsService } from '../../generated/services/Hlesg_virksomhedsService'
import { tables } from '../../dataverse/schema'
import type { DvRecord, TableApi } from './store'

type Result<T> = { success: boolean; data: T; error?: unknown; skipToken?: string }
type Service = {
  getAll(options?: { select?: string[]; maxPageSize?: number; skipToken?: string }): Promise<Result<DvRecord[]>>
  create(record: never): Promise<Result<DvRecord>>
  update(id: string, changes: never): Promise<Result<DvRecord>>
  delete(id: string): Promise<void>
}

// The generated classes are typed per table; the store works with plain records, so they're
// used through this one shape. The records are built from the same schema the tables were.
const services = {
  hlesg_koncern: Hlesg_koncernsService,
  hlesg_virksomhed: Hlesg_virksomhedsService,
  hlesg_ejerandel: Hlesg_ejerandelsService,
  hlesg_klimaregnskab: Hlesg_klimaregnskabsService,
  hlesg_lokation: Hlesg_lokationsService,
  hlesg_linje: Hlesg_linjesService,
  hlesg_pendling: Hlesg_pendlingsService,
  hlesg_investering: Hlesg_investeringsService,
  hlesg_faktorkilde: Hlesg_faktorkildesService,
  hlesg_relevans: Hlesg_relevansesService,
  hlesg_indekspunkt: Hlesg_indekspunktsService,
  hlesg_prisaar: Hlesg_prisaarsService,
  hlesg_import: Hlesg_importsService,
  hlesg_postering: Hlesg_posteringsService,
  hlesg_regel: Hlesg_regelsService,
} as unknown as Record<string, Service>

function service(table: string): Service {
  const s = services[table]
  if (!s) throw new Error(`No generated service for ${table}`)
  return s
}

function check<T>(r: Result<T>, what: string): T {
  if (!r.success) {
    const e = r.error as { message?: string } | undefined
    throw new Error(`${what}: ${e?.message ?? 'Dataverse afviste ændringen.'}`)
  }
  return r.data
}

/** Only the columns the app uses (Microsoft: always limit the columns you retrieve). */
function selectFor(table: string): string[] {
  const t = tables.find((x) => x.name === table)!
  return [`${table}id`, t.primary.name, ...t.columns.map((c) => (c.kind === 'lookup' ? `_${c.name}_value` : c.name))]
}

export function generatedApi(): TableApi {
  return {
    async list(table) {
      const out: DvRecord[] = []
      let skipToken: string | undefined
      do {
        const r = await service(table).getAll({ select: selectFor(table), maxPageSize: 5000, skipToken })
        out.push(...check(r, `Kunne ikke læse ${table}`))
        skipToken = r.skipToken
      } while (skipToken)
      return out
    },
    async create(table, record) {
      const data = check(await service(table).create(record as never), `Kunne ikke oprette i ${table}`)
      return String(data[`${table}id`])
    },
    async update(table, id, changes) {
      check(await service(table).update(id, changes as never), `Kunne ikke gemme i ${table}`)
    },
    async delete(table, id) {
      await service(table).delete(id)
    },
  }
}
