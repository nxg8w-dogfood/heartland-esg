// Dev: the subscription NEXUSAI-DEV, resource group rg-heartland-ai (Sweden Central).
// Emails come from the command line or environment, so no address is fixed here.
using 'main.bicep'

param environment = 'dev'
param keyVaultName = 'kv-nexus-ai-dev-867ee8'
param motorApiKeySecretName = 'motorapi-key-dev'
param connectorSecretName = 'motorapi-connector-secret-dev'
param ownerEmail = readEnvironmentVariable('HLESG_OWNER_EMAIL')
param budgetContactEmails = split(readEnvironmentVariable('HLESG_BUDGET_EMAILS'), ',')
param lookupGroupObjectId = readEnvironmentVariable('HLESG_LOOKUP_GROUP_ID', '')
