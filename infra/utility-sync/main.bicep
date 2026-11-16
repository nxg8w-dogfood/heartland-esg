// The nightly Eloverblik and Varmeoverblik sync (docs/adr/0021), one per environment:
// - a Function App on the Flex Consumption plan (Node.js 24), with a system-assigned identity;
// - its storage account, reached with that identity (no keys);
// - Log Analytics and Application Insights, and an alert when a run fails;
// - read access for the identity to the environment's Key Vault secrets, which hold each
//   company's tokens (put there by hand, README);
// - a monthly budget on the resource group's sync resources, with alerts at 50, 80 and 100 %.
// The Function's code is deployed by the pipeline (.github/workflows/deploy.yml). Dataverse
// access is an application user for the identity, set up by hand (README).
//
//   az deployment group create -g <resource group> -f infra/utility-sync/main.bicep -p infra/utility-sync/<env>.bicepparam

@description('dev, test or prod')
@allowed(['dev', 'test', 'prod'])
param environment string

param location string = resourceGroup().location

@description('The existing Key Vault, in this resource group, that holds the companies\' tokens')
param keyVaultName string

@description('The Dataverse environment the sync writes to, e.g. https://<org>.crm4.dynamics.com')
param dataverseUrl string

@description('Owner tag: the owning team, not a shared mailbox')
param ownerEmail string

@description('Who gets the budget and failure alerts: the owning team')
param alertEmails array

@description('Monthly budget for the sync, in the billing currency')
param budgetAmount int = 20

@description('First day of the budget, yyyy-MM-01. Defaults to this month.')
param budgetStartDate string = utcNow('yyyy-MM-01')

var tags = {
  owner: ownerEmail
  project: 'heartland-esg'
  environment: environment
  component: 'utility-sync'
}
var suffix = uniqueString(resourceGroup().id, 'utility-sync', environment)
var appName = 'func-hlesg-sync-${environment}-${suffix}'
var packageContainer = 'app-package'

// Built-in role IDs: public, the same in every tenant
// (https://learn.microsoft.com/azure/role-based-access-control/built-in-roles), not secrets.
var roles = {
  keyVaultSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6' // gitleaks:allow
  storageBlobDataOwner: 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b' // gitleaks:allow
  storageQueueDataContributor: '974c5e8b-45b9-4653-ba55-5f855dd0fb88' // gitleaks:allow
  storageTableDataContributor: '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3' // gitleaks:allow
  monitoringMetricsPublisher: '3913510d-42f4-4e42-8a64-420c390055eb' // gitleaks:allow
}

// ---- Storage ---------------------------------------------------------------------------

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: take('sthlesgsync${environment}${suffix}', 24)
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    // Only the app's identity, never an account key.
    allowSharedKeyAccess: false
  }
}

resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource packages 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobs
  name: packageContainer
}

// ---- Monitoring ------------------------------------------------------------------------

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-hlesg-sync-${environment}-${suffix}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-hlesg-sync-${environment}-${suffix}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
    // Telemetry only with the app's identity, not with the connection string alone.
    DisableLocalAuth: true
  }
}

// ---- Function App ----------------------------------------------------------------------

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'plan-hlesg-sync-${environment}-${suffix}'
  location: location
  tags: tags
  kind: 'functionapp'
  sku: { tier: 'FlexConsumption', name: 'FC1' }
  properties: { reserved: true }
}

resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  name: appName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        { name: 'AzureWebJobsStorage__accountName', value: storage.name }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        { name: 'APPLICATIONINSIGHTS_AUTHENTICATION_STRING', value: 'Authorization=AAD' }
        { name: 'DATAVERSE_URL', value: dataverseUrl }
        { name: 'KEY_VAULT_URL', value: vault.properties.vaultUri }
      ]
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${packageContainer}'
          authentication: { type: 'SystemAssignedIdentity' }
        }
      }
      // One run a night needs one small instance.
      scaleAndConcurrency: { maximumInstanceCount: 40, instanceMemoryMB: 512 }
      runtime: { name: 'node', version: '24' }
    }
  }
}

// ---- Access for the app's identity -----------------------------------------------------

resource storageRoles 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for role in [roles.storageBlobDataOwner, roles.storageQueueDataContributor, roles.storageTableDataContributor]: {
  scope: storage
  name: guid(storage.id, functionApp.id, role)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', role)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}]

resource telemetryRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: insights
  name: guid(insights.id, functionApp.id, roles.monitoringMetricsPublisher)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.monitoringMetricsPublisher)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

// The vault's secrets, read-only. The vault also holds the MotorAPI key; Key Vault roles can't be
// narrowed to a name prefix, and the sync only ever asks for eloverblik-* and varmeoverblik-*.
resource secretsReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, functionApp.id, roles.keyVaultSecretsUser)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.keyVaultSecretsUser)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ---- Alerts and budget -----------------------------------------------------------------

resource team 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: 'ag-hlesg-sync-${environment}'
  location: 'global'
  tags: tags
  properties: {
    groupShortName: 'hlesgsync'
    enabled: true
    emailReceivers: [for (email, i) in alertEmails: { name: 'team-${i}', emailAddress: email, useCommonAlertSchema: true }]
  }
}

// The run throws when any company fails (functions/utility-sync/src/index.ts), so a failed
// request is a night with missing data.
resource failedRun 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: 'alert-hlesg-sync-failed-${environment}'
  location: location
  tags: tags
  properties: {
    displayName: 'Heartland ESG: the nightly utility sync failed (${environment})'
    severity: 2
    enabled: true
    scopes: [insights.id]
    evaluationFrequency: 'PT6H'
    windowSize: 'PT6H'
    criteria: {
      allOf: [
        {
          query: 'requests | where name == "utilitySync" and success == false'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: { numberOfEvaluationPeriods: 1, minFailingPeriodsToAlert: 1 }
        }
      ]
    }
    actions: { actionGroups: [team.id] }
  }
}

resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: 'budget-hlesg-sync-${environment}'
  properties: {
    category: 'Cost'
    amount: budgetAmount
    timeGrain: 'Monthly'
    timePeriod: { startDate: budgetStartDate }
    filter: {
      dimensions: { name: 'ResourceId', operator: 'In', values: [functionApp.id, plan.id, storage.id, insights.id, logs.id] }
    }
    notifications: {
      actual50: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 50, thresholdType: 'Actual', contactEmails: alertEmails }
      actual80: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 80, thresholdType: 'Actual', contactEmails: alertEmails }
      actual100: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 100, thresholdType: 'Actual', contactEmails: alertEmails }
    }
  }
}

@description('The Function App, for the pipeline variable UTILITY_SYNC_APP')
output functionAppName string = functionApp.name

@description('The identity to create the Dataverse application user for (README)')
output principalId string = functionApp.identity.principalId
