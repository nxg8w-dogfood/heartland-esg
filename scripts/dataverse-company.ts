// Sets up a company's business unit (docs/adr/0006 section 4): a business unit under the root
// one, which stands for the group, and an owner team in it that owns the company's records.
//
//   npm run dataverse:company -- --url https://<org>.crm4.dynamics.com --name "Heartland A/S" [--dry-run]
//
// Users in the business unit with a Klimaregnskab role see and change only records owned there.
// When the company exists in the app (hlesg_virksomhed with that name), it's assigned to the
// owner team; its records follow through the parental relationships (docs/adr/0006, 0007).
// Run it again after creating the company in the app. Never deletes. Needs System Administrator.

import { client, environment } from './lib/dataverse.ts'

const usage = 'npm run dataverse:company -- --url https://<org>.crm4.dynamics.com --name "<company>" [--dry-run]'
const { org, dryRun, arg } = environment(usage)
const name = arg('--name')?.trim()
if (!name || name.length > 160) {
  console.error(`Usage: ${usage}`)
  process.exit(2)
}
const { call, get, values, createdId, q } = client(org)

/** The team that owns the company's records, in its business unit */
const ownerTeamName = (company: string) => `${company} – klimaregnskab`

async function main() {
  const who = (await get('WhoAmI')).json as { UserId: string }
  console.log(`Signed in to ${org} as user ${who.UserId}${dryRun ? ' (dry run: nothing is changed)' : ''}`)

  const root = (await values('businessunits?$select=businessunitid,name&$filter=_parentbusinessunitid_value eq null'))[0]
  if (!root) throw new Error('No root business unit found.')
  const rootId = String(root.businessunitid)
  if (String(root.name).trim().toLowerCase() === name!.toLowerCase()) throw new Error(`${name} is the root business unit, which stands for the group; a company gets a unit below it.`)

  let unit = (await values(`businessunits?$select=businessunitid,_parentbusinessunitid_value&$filter=name eq ${q(name!)}`))[0]
  if (unit && String(unit._parentbusinessunitid_value) !== rootId) throw new Error(`A business unit called ${name} exists, but not directly under the root unit. Left as it is.`)
  if (!unit) {
    if (dryRun) console.log(`Would create the business unit ${name} under ${String(root.name)}`)
    else {
      const r = await call('POST', 'businessunits', { name, 'parentbusinessunitid@odata.bind': `/businessunits(${rootId})` })
      unit = { businessunitid: createdId(r.headers) }
      console.log(`Created the business unit ${name} under ${String(root.name)}`)
    }
  } else console.log(`The business unit ${name} exists`)

  const team = ownerTeamName(name!)
  let teamId = unit ? (await values(`teams?$select=teamid&$filter=name eq ${q(team)} and _businessunitid_value eq ${String(unit.businessunitid)}`))[0]?.teamid as string | undefined : undefined
  if (teamId) console.log(`The owner team ${team} exists`)
  else if (dryRun) console.log(`Would create the owner team ${team} in ${name}`)
  else {
    // Owner team (teamtype 0): it can own records. The signed-in user is its administrator.
    const r = await call('POST', 'teams', {
      name: team, teamtype: 0,
      'businessunitid@odata.bind': `/businessunits(${String(unit!.businessunitid)})`,
      'administratorid@odata.bind': `/systemusers(${who.UserId})`,
    })
    teamId = createdId(r.headers) ?? undefined
    console.log(`Created the owner team ${team} in ${name}`)
  }

  // The company record, if it exists yet: give it to the owner team, and its records follow.
  const companies = await values(`hlesg_virksomheds?$select=hlesg_virksomhedid,_owningteam_value&$filter=hlesg_navn eq ${q(name!)}`)
  if (companies.length > 1) throw new Error(`${companies.length} companies are called ${name}; assign the right one by hand.`)
  const company = companies[0]
  if (!company) console.log(`No company called ${name} in the app yet. Create it under Koncern, then run this again to assign it.`)
  else if (teamId && company._owningteam_value === teamId) console.log(`The company ${name} is owned by ${team}`)
  else if (dryRun) console.log(`Would assign the company ${name}, and its records, to ${team}`)
  else {
    await call('PATCH', `hlesg_virksomheds(${String(company.hlesg_virksomhedid)})`, { 'ownerid@odata.bind': `/teams(${teamId})` })
    console.log(`Assigned the company ${name}, and its records, to ${team}`)
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
