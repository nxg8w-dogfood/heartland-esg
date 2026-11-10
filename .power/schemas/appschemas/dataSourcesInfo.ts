/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * This file is auto-generated. Do not modify it manually.
 * Changes to this file may be overwritten.
 */

export const dataSourcesInfo = {
  "hlesg_5fmotorapi_5f40b405ceb15270d7": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Connector",
    "apis": {
      "GetVehicle": {
        "path": "/{connectionId}/vehicles/{plate}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "plate",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "403": {
            "type": "void"
          },
          "404": {
            "type": "void"
          }
        }
      },
      "GetVehicleEnvironment": {
        "path": "/{connectionId}/vehicles/{plate}/environment",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "plate",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "403": {
            "type": "void"
          },
          "404": {
            "type": "void"
          }
        }
      }
    }
  },
  "hlesg_ejerandels": {
    "tableId": "",
    "version": "",
    "primaryKey": "hlesg_ejerandelid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "hlesg_faktorkildes": {
    "tableId": "",
    "version": "",
    "primaryKey": "hlesg_faktorkildeid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "hlesg_imports": {
    "tableId": "",
    "version": "",
    "primaryKey": "hlesg_importid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "hlesg_indekspunkts": {
    "tableId": "",
    "version": "",
    "primaryKey": "hlesg_indekspunktid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "hlesg_investerings": {
    "tableId": "",
    "version": "",
    "primaryKey": "hlesg_investeringid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "hlesg_klimaregnskabs": {
    "tableId": "",
    "version": "",
    "primaryKey": "hlesg_klimaregnskabid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "hlesg_koeretoejs": {
    "tableId": "",
    "version": "",
    "primaryKey": "hlesg_koeretoejid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "hlesg_koncerns": {
    "tableId": "",
    "version": "",
    "primaryKey": "hlesg_koncernid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "hlesg_linjes": {
    "tableId": "",
    "version": "",
    "primaryKey": "hlesg_linjeid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "hlesg_lokations": {
    "tableId": "",
    "version": "",
    "primaryKey": "hlesg_lokationid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "hlesg_pendlings": {
    "tableId": "",
    "version": "",
    "primaryKey": "hlesg_pendlingid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "hlesg_posterings": {
    "tableId": "",
    "version": "",
    "primaryKey": "hlesg_posteringid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "hlesg_prisaars": {
    "tableId": "",
    "version": "",
    "primaryKey": "hlesg_prisaarid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "hlesg_regels": {
    "tableId": "",
    "version": "",
    "primaryKey": "hlesg_regelid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "hlesg_relevanses": {
    "tableId": "",
    "version": "",
    "primaryKey": "hlesg_relevansid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "hlesg_virksomheds": {
    "tableId": "",
    "version": "",
    "primaryKey": "hlesg_virksomhedid",
    "dataSourceType": "Dataverse",
    "apis": {}
  }
};
