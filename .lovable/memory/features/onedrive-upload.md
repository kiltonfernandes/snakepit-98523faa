---
name: OneDrive Upload Pipeline
description: Rivaldo MP3 upload to OneDrive — folder structure, naming, retry, bulk
type: feature
---
## OneDrive Episode Upload

**Connector**: `microsoft_onedrive` (scope `Files.ReadWrite.All`).
**Edge function**: `upload-episode-to-onedrive` (actions: `initiate`, `finalize`).
**Client helper**: `src/lib/storage/onedrive.ts` — chunked upload (10 MiB) directly to Graph pre-signed URL after edge initiates session.

### Folder & naming
- `Snakepit/{YYYY}-W{NN}/` (ISO week of the episode_date).
- Filename = sanitized title (lowercase, `_` separators, `.mp3`).
- Conflict behavior: `replace` (re-upload overwrites).

### Persistence
On success, updates `episode_materials`:
- `repository_provider = 'onedrive'`
- `repository_url = webUrl`
- `repository_file_id = driveItem.id`
- `repository_uploaded_at = ISO now()`

### UI behavior
- Single Rivaldo: checkbox "Enviar para OneDrive" (default ON), shows "Já no Drive" badge when material already has `repository_url`.
- BulkModal: same checkbox, per-row status badge (uploading / done with link / error+retry button). When upload is ON, individual MP3 downloads are skipped.
- Retry: re-encodes the row's pipeline and re-uploads (does NOT keep the blob in memory between runs).

### Why edge function proxies initiate
OneDrive requires OAuth + folder traversal/creation. Edge handles auth via gateway. The actual byte transfer goes browser → Graph (pre-signed URL) to bypass edge payload limits.
