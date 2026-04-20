# @integrax/storage

File storage adapter with Cloudflare R2 and local filesystem implementations.

**Exports:** `IStorageAdapter`, `R2StorageAdapter`, `LocalStorageAdapter`, `createStorageAdapter()` factory, types: `StorageObject`, `UploadOptions`.

**`createStorageAdapter()`** picks R2 when `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` are set; otherwise falls back to `LOCAL_STORAGE_DIR`.

**Consumers:** `services/control-plane` (storage routes `/api/storage`), `services/connector-watchdog` (evidence packs).
