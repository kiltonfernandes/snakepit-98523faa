const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/microsoft_onedrive";
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

interface InitiatePayload {
  action: "initiate";
  folderPath: string; // e.g. "Snakepit/2026-W17"
  filename: string;   // e.g. "segunda-titulo.mp3"
  fileSize: number;
}

interface FinalizePayload {
  action: "finalize";
  fileId: string;
}

interface DeletePayload {
  action: "delete";
  fileId: string;
}

interface DownloadPayload {
  action: "download";
  fileId: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function okResponse(data: Record<string, unknown>) {
  return jsonResponse({ ok: true, ...data }, 200);
}

function errorResponse(error: string, diagnostics?: Record<string, unknown>) {
  return jsonResponse({ ok: false, error, diagnostics }, 200);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(input: string, init: RequestInit, stage: string, attempts = 3) {
  let lastError = "Unknown error";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(input, init);
      if (res.ok || !RETRYABLE_STATUSES.has(res.status) || attempt === attempts) {
        return res;
      }
      lastError = await res.text().catch(() => `HTTP ${res.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Network failure";
      if (attempt === attempts) {
        throw new Error(`OneDrive ${stage} failed after ${attempts} attempts: ${lastError}`);
      }
    }
    await sleep(attempt * 400);
  }
  throw new Error(`OneDrive ${stage} failed: ${lastError}`);
}

function getAuthHeaders() {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  const ONEDRIVE_API_KEY = Deno.env.get("MICROSOFT_ONEDRIVE_API_KEY");
  if (!ONEDRIVE_API_KEY) throw new Error("MICROSOFT_ONEDRIVE_API_KEY is not configured");
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": ONEDRIVE_API_KEY,
  };
}

/** Ensures the folder path exists by creating each segment if missing. Returns the final folder driveItem id. */
async function ensureFolderPath(folderPath: string): Promise<string> {
  const segments = folderPath.split("/").filter(Boolean);
  const headers = getAuthHeaders();
  let parentId = "root";
  for (const segment of segments) {
    // Try to find child by name
    const childrenRes = await fetchWithRetry(
      `${GATEWAY_URL}/me/drive/items/${parentId}/children?$filter=name eq '${encodeURIComponent(segment).replace(/'/g, "''")}'&$select=id,name,folder`,
      { headers },
      "list children",
    );
    if (!childrenRes.ok) {
      const text = await childrenRes.text();
      throw new Error(`OneDrive list children failed [${childrenRes.status}]: ${text}`);
    }
    const data = await childrenRes.json();
    const existing = data.value?.find((it: { name: string; folder?: unknown }) => it.name === segment && it.folder);
    if (existing) {
      parentId = existing.id;
      continue;
    }
    // Create folder
    const createRes = await fetchWithRetry(`${GATEWAY_URL}/me/drive/items/${parentId}/children`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: segment, folder: {}, "@microsoft.graph.conflictBehavior": "rename" }),
    }, "create folder");
    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`OneDrive create folder failed [${createRes.status}]: ${text}`);
    }
    const created = await createRes.json();
    parentId = created.id;
  }
  return parentId;
}

async function createUploadSession(folderItemId: string, filename: string) {
  const headers = getAuthHeaders();
  const res = await fetchWithRetry(
    `${GATEWAY_URL}/me/drive/items/${folderItemId}:/${encodeURIComponent(filename)}:/createUploadSession`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        item: {
          "@microsoft.graph.conflictBehavior": "replace",
        },
      }),
    },
    "create upload session",
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OneDrive createUploadSession failed [${res.status}]: ${text}`);
  }
  const data = await res.json();
  return data as { uploadUrl: string; expirationDateTime: string };
}

async function getFileMeta(fileId: string) {
  const headers = getAuthHeaders();
  const res = await fetchWithRetry(`${GATEWAY_URL}/me/drive/items/${fileId}?$select=id,name,webUrl,size,@microsoft.graph.downloadUrl`, { headers }, "get item");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OneDrive get item failed [${res.status}]: ${text}`);
  }
  return await res.json();
}

async function deleteFile(fileId: string): Promise<void> {
  const headers = getAuthHeaders();
  const res = await fetchWithRetry(`${GATEWAY_URL}/me/drive/items/${fileId}`, {
    method: "DELETE",
    headers,
  }, "delete item");
  // 204 No Content on success; 404 also treated as "already gone" so we don't
  // block the UI from cleaning up the metadata.
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`OneDrive delete failed [${res.status}]: ${text}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();

    if (body.action === "initiate") {
      const { folderPath, filename, fileSize } = body as InitiatePayload;
      if (!folderPath || !filename || typeof fileSize !== "number") {
        return errorResponse("folderPath, filename and fileSize are required", { action: "initiate" });
      }
      const safeFilename = filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 200);
      const folderItemId = await ensureFolderPath(folderPath);
      const session = await createUploadSession(folderItemId, safeFilename);
      return okResponse({
        uploadUrl: session.uploadUrl,
        expirationDateTime: session.expirationDateTime,
        folderItemId,
        filename: safeFilename,
      });
    }

    if (body.action === "finalize") {
      const { fileId } = body as FinalizePayload;
      if (!fileId) return errorResponse("fileId is required", { action: "finalize" });
      const meta = await getFileMeta(fileId);
      return okResponse({
        id: meta.id,
        name: meta.name,
        webUrl: meta.webUrl,
        size: meta.size,
      });
    }

    if (body.action === "delete") {
      const { fileId } = body as DeletePayload;
      if (!fileId) return errorResponse("fileId is required", { action: "delete" });
      await deleteFile(fileId);
      return okResponse({ success: true });
    }

    if (body.action === "download") {
      const { fileId } = body as DownloadPayload;
      if (!fileId) return errorResponse("fileId is required", { action: "download" });
      const meta = await getFileMeta(fileId);
      return okResponse({
        id: meta.id,
        name: meta.name,
        webUrl: meta.webUrl,
        size: meta.size,
        downloadUrl: meta["@microsoft.graph.downloadUrl"] || null,
      });
    }

    return errorResponse("Unknown action", { action: body?.action ?? null });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[upload-episode-to-onedrive]", msg);
    return errorResponse(msg, { stage: "handler" });
  }
});
