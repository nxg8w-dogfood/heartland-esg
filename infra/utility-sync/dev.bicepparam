// Dev: the subscription NEXUSAI-DEV, resource group rg-heartland-ai (Sweden Central), next to
// the MotorAPI proxy and its Key Vault. Emails come from the command line or environment.
using 'main.bicep'

param environment = 'dev'
param keyVaultName = 'kv-nexus-ai-dev-867ee8'
param dataverseUrl = 'https://orgb872058d.crm4.dynamics.com'
param ownerEmail = readEnvironmentVariable('HLESG_OWNER_EMAIL')
param alertEmails = split(readEnvironmentVariable('HLESG_BUDGET_EMAILS'), ',')
