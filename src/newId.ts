/**
 * A unique id for lines, locations and other records. Random UUIDs, so saved data and new
 * records never collide, and they match the GUID primary keys Dataverse uses.
 */
export const newId = (): string => crypto.randomUUID()
