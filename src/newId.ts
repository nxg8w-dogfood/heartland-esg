let nextId = 1

/** Ids for lines and locations held in memory. Dataverse will assign real ids. */
export const newId = () => String(nextId++)
