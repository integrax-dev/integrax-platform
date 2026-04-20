# @integrax/connector-google-sheets

Connector for Google Sheets. Read and write spreadsheet data for reporting and lightweight data sync.

**Auth:** OAuth2 service account (JSON key) or user OAuth token.

**Actions:** read range, write range, append rows, create sheet, list sheets.

**Exports:** `GoogleSheetsConnector` (class), shared types from `types.ts`.

**Dependencies:** `@integrax/connector-sdk`, `googleapis`.

**Consumers:** `services/control-plane` tester registry, `modules/catalog` (product export).
