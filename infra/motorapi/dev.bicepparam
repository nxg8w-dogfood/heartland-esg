// Dev: the subscription NEXUSAI-DEV, resource group rg-heartland-ai (Sweden Central).
// Emails come from the command line or environment, so no address is fixed here.
using 'main.bicep'

param environment = 'dev'
param keyVaultName = 'kv-nexus-ai-dev-867ee8'
param motorApiKeySecretName = 'motorapi-key-dev'
param connectorSecretName = 'motorapi-connector-secret-dev'
// The connector's own redirect URI, shown on its Security tab after it was created in dev.
param connectorRedirectUris = [
  'https://global.consent.azure-apim.net/redirect'
  'https://global.consent.azure-apim.net/redirect/hlesg-5fmotorapi-5f40b405ceb15270d7'
]
param ownerEmail = readEnvironmentVariable('HLESG_OWNER_EMAIL')
param budgetContactEmails = split(readEnvironmentVariable('HLESG_BUDGET_EMAILS'), ',')
param lookupGroupObjectId = readEnvironmentVariable('HLESG_LOOKUP_GROUP_ID', '')
