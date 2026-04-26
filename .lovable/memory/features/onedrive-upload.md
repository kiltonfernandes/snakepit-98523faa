---
name: OneDrive Upload Pipeline
description: Rivaldo MP3 upload to OneDrive — folder structure, naming, retry, bulk, delete from calendar
type: feature
---
## OneDrive Episode Upload

**Connector**: `microsoft_onedrive` (scope `Files.ReadWrite.All`).
**Edge function**: `upload-episode-to-onedrive` (actions: `initiate`, `finalize`, `delete`).
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
- Bulk consolidated episode (Sunday): ALWAYS downloaded locally and NEVER uploaded to OneDrive, regardless of the "Enviar diários para OneDrive" toggle. Per-day MP3s still respect the upload toggle. Status banner in modal shows local download confirmation.
- Calendar modal: "Arquivo no OneDrive" section above Spotify with **Baixar do Drive** (opens `repository_url`) and **Excluir do Drive** (AlertDialog confirmation → `action: delete` → clears all `repository_*` fields).
- Retry: re-encodes the row's pipeline and re-uploads.

### Why edge function proxies initiate
OneDrive requires OAuth + folder traversal/creation. Edge handles auth via gateway. The actual byte transfer goes browser → Graph (pre-signed URL) to bypass edge payload limits. Delete uses `DELETE /me/drive/items/{fileId}` (treats 404 as already-gone).
