// Turns the schema (schema.ts) into Dataverse Web API metadata requests, following Microsoft's
// documented shapes for tables, columns and one-to-many relationships:
// https://learn.microsoft.com/power-apps/developer/data-platform/webapi/create-update-entity-definitions-using-web-api
// https://learn.microsoft.com/power-apps/developer/data-platform/webapi/create-update-column-definitions-using-web-api
// https://learn.microsoft.com/power-apps/developer/data-platform/webapi/create-update-entity-relationships-using-web-api
// Pure functions, so the requests are tested without an environment.

import type { Column, Table } from './schema'

type Json = Record<string, unknown>

export function label(text: string, languageCode: number): Json {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: languageCode }],
  }
}

/** hlesg_linje → hlesg_Linje. Logical names are the schema name in lowercase. */
export function schemaName(logicalName: string): string {
  const i = logicalName.indexOf('_')
  return logicalName.slice(0, i + 1) + logicalName.charAt(i + 1).toUpperCase() + logicalName.slice(i + 2)
}

const required = (yes: boolean | undefined) => ({ Value: yes ? 'ApplicationRequired' : 'None' })

function common(c: { name: string; label: string; description?: string }, lcid: number): Json {
  return {
    SchemaName: schemaName(c.name),
    DisplayName: label(c.label, lcid),
    Description: label(c.description ?? c.label, lcid),
  }
}

/** The column's attribute definition. Lookups aren't attributes on their own; see relationship(). */
export function attribute(c: Exclude<Column, { kind: 'lookup' }>, lcid: number): Json {
  const base = common(c, lcid)
  switch (c.kind) {
    case 'text':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', ...base, AttributeType: 'String', AttributeTypeName: { Value: 'StringType' }, RequiredLevel: required(c.required), MaxLength: c.maxLength, FormatName: { Value: 'Text' } }
    case 'memo':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', ...base, AttributeType: 'Memo', AttributeTypeName: { Value: 'MemoType' }, RequiredLevel: required(false), MaxLength: c.maxLength, Format: 'TextArea' }
    case 'decimal':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata', ...base, AttributeType: 'Decimal', AttributeTypeName: { Value: 'DecimalType' }, RequiredLevel: required(false), Precision: c.precision, MinValue: c.min, MaxValue: c.max }
    case 'integer':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata', ...base, AttributeType: 'Integer', AttributeTypeName: { Value: 'IntegerType' }, RequiredLevel: required(false), MinValue: c.min, MaxValue: c.max, Format: 'None' }
    case 'date':
      // Date only, with no time zone, so 2025-03-01 stays 2025-03-01 for every user.
      return { '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', ...base, AttributeType: 'DateTime', AttributeTypeName: { Value: 'DateTimeType' }, RequiredLevel: required(c.required), Format: 'DateOnly', DateTimeBehavior: { Value: 'DateOnly' } }
    case 'datetime':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', ...base, AttributeType: 'DateTime', AttributeTypeName: { Value: 'DateTimeType' }, RequiredLevel: required(false), Format: 'DateAndTime', DateTimeBehavior: { Value: 'TimeZoneIndependent' } }
    case 'boolean':
      return {
        '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata', ...base, AttributeType: 'Boolean', AttributeTypeName: { Value: 'BooleanType' }, RequiredLevel: required(false),
        DefaultValue: c.default,
        OptionSet: { TrueOption: { Value: 1, Label: label(c.trueLabel, lcid) }, FalseOption: { Value: 0, Label: label(c.falseLabel, lcid) }, OptionSetType: 'Boolean' },
      }
    case 'choice':
      return {
        '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata', ...base, AttributeType: 'Picklist', AttributeTypeName: { Value: 'PicklistType' }, RequiredLevel: required(c.required),
        OptionSet: { '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata', IsGlobal: false, OptionSetType: 'Picklist', Options: c.options.map((o) => ({ Value: o.value, Label: label(o.label, lcid) })) },
      }
  }
}

/** A new table, with its primary name column. Other columns are added afterwards. */
export function entity(t: Table, lcid: number): Json {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: schemaName(t.name),
    DisplayName: label(t.label, lcid),
    DisplayCollectionName: label(t.pluralLabel, lcid),
    Description: label(t.description, lcid),
    OwnershipType: 'UserOwned',
    IsActivity: false,
    HasActivities: false,
    HasNotes: false,
    // ADR 0005: every change is audited.
    IsAuditEnabled: { Value: true, CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyauditsettings' },
    Attributes: [
      { ...attribute({ kind: 'text', name: t.primary.name, label: t.primary.label, maxLength: t.primary.maxLength, required: t.primary.required }, lcid), IsPrimaryName: true },
    ],
  }
}

/** hlesg_virksomhed → hlesg_linje gives hlesg_virksomhed_linje. Unique while a table has one lookup per target. */
export function relationshipName(c: Extract<Column, { kind: 'lookup' }>, table: string): string {
  return `${c.target}_${table.slice(table.indexOf('_') + 1)}`
}

/**
 * A lookup is a one-to-many relationship. Cascade makes the target the record's parent: deleting,
 * assigning, sharing or reparenting it does the same to the record. A table may have only one.
 */
export function relationship(c: Extract<Column, { kind: 'lookup' }>, table: string, lcid: number): Json {
  const parental = c.onDelete === 'Cascade'
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: relationshipName(c, table),
    ReferencedEntity: c.target,
    ReferencedAttribute: `${c.target}id`,
    ReferencingEntity: table,
    CascadeConfiguration: parental
      ? { Assign: 'Cascade', Delete: 'Cascade', Merge: 'NoCascade', Reparent: 'Cascade', Share: 'Cascade', Unshare: 'Cascade' }
      : { Assign: 'NoCascade', Delete: c.onDelete, Merge: 'NoCascade', Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade' },
    Lookup: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      AttributeType: 'Lookup',
      AttributeTypeName: { Value: 'LookupType' },
      ...common(c, lcid),
      RequiredLevel: required(c.required),
    },
  }
}
