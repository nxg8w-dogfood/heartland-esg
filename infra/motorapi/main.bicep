// The MotorAPI proxy for plate lookups (docs/adr/0009), one per environment:
// - API Management (Consumption) that adds the MotorAPI key from Key Vault and checks the
//   caller's Entra ID token and app role (connectors/motorapi/apim-policy.xml);
// - read access for API Management's identity to that one Key Vault secret;
// - two Entra app registrations: the proxy (an API with the Vehicle.Lookup role) and the
//   custom connector (its OAuth client), with admin consent between them;
// - a monthly budget on the API Management instance, with alerts at 50, 80 and 100 %.
// The key itself is never in this template: it's put in Key Vault by hand (README).

extension microsoftGraphV1

@description('dev, test or prod')
@allowed(['dev', 'test', 'prod'])
param environment string

param location string = resourceGroup().location

@description('The existing Key Vault, in this resource group, that holds the MotorAPI key')
param keyVaultName string

@description('Name of the secret holding the MotorAPI key, e.g. motorapi-key-dev')
param motorApiKeySecretName string

@description('Owner tag, and API Management publisher email: the owning team, not a shared mailbox')
param ownerEmail string

@description('Who gets the budget alerts: the owning team')
param budgetContactEmails array

@description('Monthly budget for the proxy, in the billing currency')
param budgetAmount int = 50

@description('First day of the budget, yyyy-MM-01. Defaults to this month.')
param budgetStartDate string = utcNow('yyyy-MM-01')

@description('Object ID of the Entra group whose members may look up plates. Empty to assign by hand.')
param lookupGroupObjectId string = ''

@description('Redirect URIs for the connector app; add the per-connector URI shown after importing the connector')
param connectorRedirectUris array = ['https://global.consent.azure-apim.net/redirect']

var tags = {
  owner: ownerEmail
  project: 'heartland-esg'
  environment: environment
  component: 'motorapi'
}
var tenantId = tenant().tenantId
var appPrefix = 'heartland-esg-motorapi-${environment}'
var proxyIdentifierUri = 'api://${tenantId}/${appPrefix}'
var lookupRoleValue = 'Vehicle.Lookup'
var lookupRoleId = guid(appPrefix, lookupRoleValue)
var scopeId = guid(appPrefix, 'user_impersonation')
// Built-in role Key Vault Secrets User: a public ID, the same in every tenant
// (https://learn.microsoft.com/azure/role-based-access-control/built-in-roles), not a secret.
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6' // gitleaks:allow

// ---- Entra ID -------------------------------------------------------------------------

resource proxyApp 'Microsoft.Graph/applications@v1.0' = {
  uniqueName: '${appPrefix}-proxy'
  displayName: 'Heartland ESG – MotorAPI proxy (${environment})'
  signInAudience: 'AzureADMyOrg'
  identifierUris: [proxyIdentifierUri]
  api: {
    requestedAccessTokenVersion: 2
    oauth2PermissionScopes: [
      {
        id: scopeId
        value: 'user_impersonation'
        type: 'User'
        isEnabled: true
        adminConsentDisplayName: 'Look up Danish plates'
        adminConsentDescription: 'Lets Heartland ESG look up Danish licence plates through the MotorAPI proxy on behalf of the signed-in user.'
        userConsentDisplayName: 'Look up Danish plates'
        userConsentDescription: 'Lets Heartland ESG look up Danish licence plates for you.'
      }
    ]
  }
  appRoles: [
    {
      id: lookupRoleId
      value: lookupRoleValue
      displayName: 'Look up plates'
      description: 'May look up Danish licence plates in Heartland ESG.'
      allowedMemberTypes: ['User']
      isEnabled: true
    }
  ]
}

resource proxySp 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: proxyApp.appId
  // Only users given the Vehicle.Lookup role (directly or through the group) get a token.
  appRoleAssignmentRequired: true
}

resource lookupGroupAssignment 'Microsoft.Graph/appRoleAssignedTo@v1.0' = if (!empty(lookupGroupObjectId)) {
  appRoleId: lookupRoleId
  principalId: lookupGroupObjectId
  resourceId: proxySp.id
}

resource connectorApp 'Microsoft.Graph/applications@v1.0' = {
  uniqueName: '${appPrefix}-connector'
  displayName: 'Heartland ESG – MotorAPI connector (${environment})'
  signInAudience: 'AzureADMyOrg'
  web: {
    redirectUris: connectorRedirectUris
  }
  requiredResourceAccess: [
    {
      resourceAppId: proxyApp.appId
      resourceAccess: [{ id: scopeId, type: 'Scope' }]
    }
  ]
}

resource connectorSp 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: connectorApp.appId
}

// Admin consent for the connector to call the proxy, so users aren't asked one by one.
resource consent 'Microsoft.Graph/oauth2PermissionGrants@v1.0' = {
  clientId: connectorSp.id
  consentType: 'AllPrincipals'
  resourceId: proxySp.id
  scope: 'user_impersonation'
}

// ---- Key Vault access ------------------------------------------------------------------

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource keySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = {
  parent: vault
  name: motorApiKeySecretName
}

// ---- API Management --------------------------------------------------------------------

resource apim 'Microsoft.ApiManagement/service@2024-05-01' = {
  name: 'apim-hlesg-motorapi-${environment}-${uniqueString(resourceGroup().id)}'
  location: location
  tags: tags
  sku: { name: 'Consumption', capacity: 0 }
  identity: { type: 'SystemAssigned' }
  properties: {
    publisherEmail: ownerEmail
    publisherName: 'Heartland A/S'
  }
}

// Read access to the one secret only, not the whole vault.
resource keyReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keySecret
  name: guid(keySecret.id, apim.id, keyVaultSecretsUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: apim.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

var namedValueNames = ['tenant-id', 'motorapi-connector-app-id', 'motorapi-proxy-app-id', 'motorapi-audience', 'motorapi-user-role']
var namedValues = {
  'tenant-id': tenantId
  'motorapi-connector-app-id': connectorApp.appId
  'motorapi-proxy-app-id': proxyApp.appId
  'motorapi-audience': proxyIdentifierUri
  'motorapi-user-role': lookupRoleValue
}

// Loop over the names, which are known up front; the values come from the app registrations.
resource plainValues 'Microsoft.ApiManagement/service/namedValues@2024-05-01' = [for name in namedValueNames: {
  parent: apim
  name: name
  properties: {
    displayName: name
    value: namedValues[name]
    secret: false
  }
}]

resource keyValue 'Microsoft.ApiManagement/service/namedValues@2024-05-01' = {
  parent: apim
  name: 'motorapi-key'
  properties: {
    displayName: 'motorapi-key'
    secret: true
    // Versionless, so a rotated key is picked up within four hours.
    keyVault: { secretIdentifier: '${vault.properties.vaultUri}secrets/${motorApiKeySecretName}' }
  }
  dependsOn: [keyReader]
}

resource api 'Microsoft.ApiManagement/service/apis@2024-05-01' = {
  parent: apim
  name: 'motorapi'
  properties: {
    displayName: 'MotorAPI'
    path: 'motorapi'
    protocols: ['https']
    serviceUrl: 'https://v1.motorapi.dk'
    // Entra ID does the authentication (the policy); no APIM subscription keys.
    subscriptionRequired: false
  }
}

var operations = [
  { name: 'GetVehicle', displayName: 'Get a vehicle by licence plate', urlTemplate: '/vehicles/{plate}' }
  { name: 'GetVehicleEnvironment', displayName: 'Get a vehicle\'s fuel economy and emissions', urlTemplate: '/vehicles/{plate}/environment' }
]

resource ops 'Microsoft.ApiManagement/service/apis/operations@2024-05-01' = [for op in operations: {
  parent: api
  name: op.name
  properties: {
    displayName: op.displayName
    method: 'GET'
    urlTemplate: op.urlTemplate
    templateParameters: [{ name: 'plate', type: 'string', required: true }]
  }
}]

resource apiPolicy 'Microsoft.ApiManagement/service/apis/policies@2024-05-01' = {
  parent: api
  name: 'policy'
  properties: {
    format: 'rawxml'
    value: loadTextContent('../../connectors/motorapi/apim-policy.xml')
  }
  dependsOn: [plainValues, keyValue]
}

// ---- Budget ----------------------------------------------------------------------------

resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: 'budget-hlesg-motorapi-${environment}'
  properties: {
    category: 'Cost'
    amount: budgetAmount
    timeGrain: 'Monthly'
    timePeriod: { startDate: budgetStartDate }
    filter: {
      dimensions: { name: 'ResourceId', operator: 'In', values: [apim.id] }
    }
    notifications: {
      actual50: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 50, thresholdType: 'Actual', contactEmails: budgetContactEmails }
      actual80: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 80, thresholdType: 'Actual', contactEmails: budgetContactEmails }
      actual100: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 100, thresholdType: 'Actual', contactEmails: budgetContactEmails }
    }
  }
}

// ---- What the Power Platform environment variables need ----------------------------------

output hlesg_MotorApiHost string = replace(apim.properties.gatewayUrl, 'https://', '')
output hlesg_TenantId string = tenantId
output hlesg_MotorApiAudience string = proxyIdentifierUri
output hlesg_MotorApiConnectorClientId string = connectorApp.appId
output proxyAppId string = proxyApp.appId
