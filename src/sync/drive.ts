// Google Drive REST calls for sync, all inside the app's hidden folder
// (appDataFolder). The Drive API is free; files count towards the user's
// Drive storage.

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const TIMEOUT_MS = 60_000

export interface DriveFile {
  id: string
  name: string
  /**
   * Increases with every change on Google's side, even ones nobody made (so it
   * can't tell alone whether the other device changed the file: see `md5Checksum`).
   */
  version: string
  /** MD5 of the file's content: changes only when the content does. */
  md5Checksum?: string
  appProperties?: Record<string, string>
}

const FILE_FIELDS = 'id,name,version,md5Checksum,appProperties'

export interface DriveAbout {
  email: string
  name?: string
  /** Bytes; `limit` is absent for unlimited storage. */
  quota: { limit?: number; usage: number }
}

/** The token expired or was revoked: sign in again. */
export class AuthError extends Error {}

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new Error("Couldn't reach Google Drive. Check the internet connection.")
  }
  if (response.ok) return response
  if (response.status === 401) throw new AuthError('Google sign-in expired.')
  const body = await response.text()
  if (/storageQuotaExceeded/.test(body)) {
    throw new Error('Your Google Drive is full: free some space in it, then sync again. Everything is still saved on this device.')
  }
  throw new Error(`Google Drive error ${response.status}: ${body.slice(0, 200)}`)
}

export async function about(token: string): Promise<DriveAbout> {
  const response = await call(token, `${API}/about?fields=user(displayName,emailAddress),storageQuota(limit,usage)`)
  const data = await response.json()
  return {
    email: data.user?.emailAddress ?? '',
    name: data.user?.displayName,
    quota: {
      limit: data.storageQuota?.limit ? Number(data.storageQuota.limit) : undefined,
      usage: Number(data.storageQuota?.usage ?? 0),
    },
  }
}

export async function listFiles(token: string): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken = ''
  do {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      pageSize: '1000',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const data = await (await call(token, `${API}/files?${params}`)).json()
    files.push(...(data.files ?? []))
    pageToken = data.nextPageToken ?? ''
  } while (pageToken)
  return files
}

export async function downloadText(token: string, fileId: string): Promise<string> {
  return (await call(token, `${API}/files/${fileId}?alt=media`)).text()
}

export async function downloadBlob(token: string, fileId: string): Promise<Blob> {
  return (await call(token, `${API}/files/${fileId}?alt=media`)).blob()
}

/** Creates the file (no `fileId`) or replaces its content. Returns its new state. */
export async function uploadFile(
  token: string,
  file: { fileId?: string; name: string; content: Blob; appProperties?: Record<string, string> },
): Promise<DriveFile> {
  const metadata: Record<string, unknown> = { name: file.name, appProperties: file.appProperties }
  if (!file.fileId) metadata.parents = ['appDataFolder']
  const body = new FormData()
  body.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  body.append('file', file.content)
  const url = file.fileId
    ? `${UPLOAD}/files/${file.fileId}?uploadType=multipart&fields=${FILE_FIELDS}`
    : `${UPLOAD}/files?uploadType=multipart&fields=${FILE_FIELDS}`
  return (await call(token, url, { method: file.fileId ? 'PATCH' : 'POST', body })).json()
}

export async function deleteFile(token: string, fileId: string): Promise<void> {
  try {
    await call(token, `${API}/files/${fileId}`, { method: 'DELETE' })
  } catch (err) {
    // Already gone (deleted by the other device): fine.
    if (!(err instanceof Error && /error 404/.test(err.message))) throw err
  }
}
