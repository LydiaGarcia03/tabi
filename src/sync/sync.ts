// Drive sync: each trip is one file in the app's hidden Drive folder (the
// backup format, photos as separate image files), plus a settings file with
// the NAVITIME key. The device stays the source of truth: everything works
// offline, and changes are sent/fetched when there is internet and a valid
// sign-in.
//
// Change detection: a hash of each trip's content at the last sync (this
// device) and the Drive file's version at the last sync (other devices).
// Changed on both sides, or deleted on one side and kept on the other, is
// never guessed: the user decides (`conflicts`).

import { useSyncExternalStore } from 'react'
import { db, onTripDataChange } from '../db/db'
import type { OptionPhoto } from '../db/model'
import { loadTripData, type TripData } from '../db/tripData'
import { deleteTrip } from '../db/trips'
import { importBackup, parseBackup, toBackupJsonWithoutImages, type PhotoRef } from '../export/backup'
import { getRapidApiKey, loadJson, saveJson, setRapidApiKey } from '../settings'
import * as drive from './drive'
import { currentToken, forgetToken, GOOGLE_CLIENT_ID, requestToken, revokeToken } from './googleAuth'

const STATE_KEY = 'tabi.sync'
const SETTINGS_FILE = 'settings.json'
/** Wait after the last change before sending it (edits come in bursts). */
const DEBOUNCE_MS = 5_000

const tripFileName = (tripId: string) => `trip-${tripId}.json`
const photoPrefix = (tripId: string) => `photo-${tripId}-`
const photoFileName = (tripId: string, photoId: string) => `${photoPrefix(tripId)}${photoId}.jpg`

export interface SyncAccount {
  email: string
  name?: string
}

interface TripSyncState {
  fileId: string
  /** Drive file version when last synced. */
  version: string
  /** Content hash on this device when last synced. */
  hash: string
}

interface SavedState {
  account: SyncAccount | null
  trips: Record<string, TripSyncState>
  settings?: { fileId: string; version: string; key: string }
  lastSync?: string
  /** Changed on this device since the last sync. */
  pending?: boolean
}

export type ConflictKind = 'both-changed' | 'deleted-on-drive'

export interface SyncConflict {
  tripId: string
  name: string
  kind: ConflictKind
}

export interface SyncStatus {
  account: SyncAccount | null
  /** `signin` = the ~1 hour sign-in expired: tap to sign in again. */
  phase: 'idle' | 'syncing' | 'signin' | 'error'
  error?: string
  lastSync?: string
  pending: boolean
  conflicts: SyncConflict[]
  quota?: drive.DriveAbout['quota']
  available: boolean
}

let saved: SavedState = loadJson<SavedState>(STATE_KEY) ?? { account: null, trips: {} }
let status: SyncStatus = {
  account: saved.account,
  phase: 'idle',
  lastSync: saved.lastSync,
  pending: !!saved.pending,
  conflicts: [],
  available: !!GOOGLE_CLIENT_ID,
}
const listeners = new Set<() => void>()

function save(patch: Partial<SavedState>) {
  saved = { ...saved, ...patch }
  saveJson(STATE_KEY, saved)
}

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((listener) => listener())
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => status,
  )
}

// --- Signing in and out ------------------------------------------------------

export async function signIn(): Promise<void> {
  setStatus({ error: undefined })
  try {
    const token = await requestToken()
    const info = await drive.about(token)
    const account = { email: info.email, name: info.name }
    // Another account: what was synced before belongs to that one.
    if (saved.account?.email !== account.email) save({ trips: {}, settings: undefined, lastSync: undefined })
    save({ account, pending: true })
    setStatus({ account, quota: info.quota, lastSync: undefined, pending: true })
    await syncNow()
  } catch (err) {
    setStatus({ phase: 'error', error: message(err) })
  }
}

/** Stops syncing on this device. Trips stay here and in Drive. */
export async function signOut(): Promise<void> {
  await revokeToken()
  save({ account: null, trips: {}, settings: undefined, lastSync: undefined, pending: false })
  setStatus({ account: null, phase: 'idle', error: undefined, conflicts: [], quota: undefined, lastSync: undefined, pending: false })
}

/** Free space in Drive (shown in Settings); quietly skipped without a valid sign-in. */
export async function refreshQuota(): Promise<void> {
  const token = currentToken()
  if (!token || !saved.account) return
  try {
    setStatus({ quota: (await drive.about(token)).quota })
  } catch {
    // Not important enough to report.
  }
}

// --- Syncing -------------------------------------------------------------------

let running: Promise<void> | null = null
let runAgain = false
/** True while sync itself writes downloaded trips (not a change by the user). */
let applyingRemote = false
let debounce: ReturnType<typeof setTimeout> | undefined

/**
 * Syncs now. `fromTap` = the user tapped a button, so an expired sign-in can
 * open Google's window; automatic syncs just report that a sign-in is needed.
 */
export async function syncNow(fromTap = false): Promise<void> {
  if (!saved.account) return
  if (running) {
    // A tap must not be swallowed by an automatic run that stops at "sign in again".
    if (fromTap) return running.then(() => syncNow(true))
    runAgain = true
    return running
  }
  const run = (async () => {
    try {
      do {
        runAgain = false
        let token = currentToken()
        if (!token) {
          if (!fromTap) {
            setStatus({ phase: 'signin' })
            return
          }
          token = await requestToken(saved.account!.email)
        }
        setStatus({ phase: 'syncing', error: undefined })
        try {
          await syncOnce(token)
        } catch (err) {
          if (!(err instanceof drive.AuthError)) throw err
          forgetToken()
          setStatus({ phase: 'signin' })
          return
        }
        const now = new Date().toISOString()
        save({ lastSync: now, pending: false })
        setStatus({ phase: 'idle', lastSync: now, pending: false })
      } while (runAgain)
    } catch (err) {
      setStatus({ phase: 'error', error: message(err) })
    }
  })()
  // Cleared after the run, never inside it: a run that ends before its first
  // `await` (sign-in expired) would clear `running` before it was even set, and
  // `running` would then stay set forever, ignoring every later sync and tap.
  running = run
  void run.finally(() => {
    if (running === run) running = null
  })
  return run
}

async function syncOnce(token: string): Promise<void> {
  const files = await drive.listFiles(token)
  const byName = new Map(files.map((f) => [f.name, f]))
  const remoteTrips = new Map<string, drive.DriveFile>()
  for (const f of files) {
    const id = /^trip-(.+)\.json$/.exec(f.name)?.[1]
    if (id) remoteTrips.set(id, f)
  }
  const localTrips = new Map((await db.trips.toArray()).map((t) => [t.id, t]))
  const ids = new Set([...localTrips.keys(), ...remoteTrips.keys(), ...Object.keys(saved.trips)])
  const conflicts: SyncConflict[] = []

  for (const id of ids) {
    const local = localTrips.get(id)
    const remote = remoteTrips.get(id)
    const state = saved.trips[id]
    const name = local?.name ?? remote?.appProperties?.tripName ?? 'Trip'

    if (local && remote) {
      const localData = (await loadTripData(id))!
      const hash = await contentHash(localData)
      if (!state) {
        // Both sides have it and it was never synced from here (e.g. moved with a backup file).
        const remoteData = parseBackup(await drive.downloadText(token, remote.id))
        if ((await contentHash({ ...remoteData.data, photos: [] }, remoteData.photoRefs)) === hash) {
          setTripState(id, { fileId: remote.id, version: remote.version, hash })
        } else conflicts.push({ tripId: id, name, kind: 'both-changed' })
        continue
      }
      const localChanged = state.hash !== hash
      const remoteChanged = state.version !== remote.version
      if (localChanged && remoteChanged) conflicts.push({ tripId: id, name, kind: 'both-changed' })
      else if (localChanged) await uploadTrip(token, localData, hash, remote.id, byName)
      else if (remoteChanged) await downloadTrip(token, id, remote, byName, 'replace')
    } else if (local) {
      if (state) conflicts.push({ tripId: id, name, kind: 'deleted-on-drive' })
      else {
        const localData = (await loadTripData(id))!
        await uploadTrip(token, localData, await contentHash(localData), undefined, byName)
      }
    } else if (remote) {
      if (state && state.version === remote.version) await deleteRemoteTrip(token, id, remote, byName)
      // New from another device, or changed there after being deleted here (kept: nothing is lost).
      else await downloadTrip(token, id, remote, byName, 'replace')
    } else {
      setTripState(id, null)
    }
  }

  await syncSettings(token, byName.get(SETTINGS_FILE))
  setStatus({ conflicts })
}

/** What "keep" means for each side of a conflict. */
export type ConflictChoice = 'device' | 'drive' | 'both' | 'delete-here'

export async function resolveConflict(tripId: string, choice: ConflictChoice): Promise<void> {
  if (!saved.account) return
  setStatus({ error: undefined })
  try {
    const token = currentToken() ?? (await requestToken(saved.account.email))
    const files = await drive.listFiles(token)
    const byName = new Map(files.map((f) => [f.name, f]))
    const remote = byName.get(tripFileName(tripId))
    if (choice === 'delete-here') {
      await withRemoteWrites(() => deleteTrip(tripId))
      setTripState(tripId, null)
    } else if (choice === 'drive' && remote) {
      await downloadTrip(token, tripId, remote, byName, 'replace')
    } else {
      // "Keep both": Drive's version comes in as a copy, this device's version stays and is sent.
      if (choice === 'both' && remote) await downloadTrip(token, tripId, remote, byName, 'copy')
      const localData = await loadTripData(tripId)
      if (localData) await uploadTrip(token, localData, await contentHash(localData), remote?.id, byName)
    }
    setStatus({ conflicts: status.conflicts.filter((c) => c.tripId !== tripId) })
    await syncNow(true)
  } catch (err) {
    setStatus({ phase: 'error', error: message(err) })
  }
}

async function uploadTrip(
  token: string,
  data: TripData,
  hash: string,
  fileId: string | undefined,
  byName: Map<string, drive.DriveFile>,
): Promise<void> {
  const tripId = data.trip.id
  // Photos first: a trip file never points to images that aren't there yet.
  // Photos never change (replacing one gives it a new id), so each is sent once.
  const keep = new Set<string>()
  for (const photo of data.photos) {
    const name = photoFileName(tripId, photo.id)
    keep.add(name)
    if (!byName.has(name)) await drive.uploadFile(token, { name, content: photo.image })
  }
  const file = await drive.uploadFile(token, {
    fileId,
    name: tripFileName(tripId),
    content: new Blob([toBackupJsonWithoutImages(data)], { type: 'application/json' }),
    appProperties: { tripName: data.trip.name },
  })
  setTripState(tripId, { fileId: file.id, version: file.version, hash })
  for (const [name, f] of byName) {
    if (name.startsWith(photoPrefix(tripId)) && !keep.has(name)) await drive.deleteFile(token, f.id)
  }
}

async function downloadTrip(
  token: string,
  tripId: string,
  remote: drive.DriveFile,
  byName: Map<string, drive.DriveFile>,
  mode: 'replace' | 'copy',
): Promise<void> {
  const { data, photoRefs } = parseBackup(await drive.downloadText(token, remote.id))
  const localPhotos = new Map((await db.photos.where('tripId').equals(tripId).toArray()).map((p) => [p.id, p.image]))
  const photos: OptionPhoto[] = []
  for (const ref of photoRefs) {
    const file = byName.get(photoFileName(tripId, ref.id))
    const image = localPhotos.get(ref.id) ?? (file ? await drive.downloadBlob(token, file.id) : null)
    if (image) photos.push({ ...ref, image })
  }
  await withRemoteWrites(() => importBackup({ ...data, photos }, mode))
  if (mode === 'replace') {
    const saved = (await loadTripData(tripId))!
    setTripState(tripId, { fileId: remote.id, version: remote.version, hash: await contentHash(saved) })
  }
}

async function deleteRemoteTrip(token: string, tripId: string, remote: drive.DriveFile, byName: Map<string, drive.DriveFile>) {
  await drive.deleteFile(token, remote.id)
  for (const [name, f] of byName) {
    if (name.startsWith(photoPrefix(tripId))) await drive.deleteFile(token, f.id)
  }
  setTripState(tripId, null)
}

/**
 * The NAVITIME key. A key typed here since the last sync is sent; otherwise
 * the one in Drive is used. An empty key is never sent (an emptied browser
 * storage must not erase the saved key): Drive's key fills it in.
 */
async function syncSettings(token: string, remote: drive.DriveFile | undefined): Promise<void> {
  const local = getRapidApiKey() ?? ''
  const last = saved.settings
  let remoteKey = ''
  if (remote) {
    if (last?.fileId === remote.id && last.version === remote.version) remoteKey = last.key
    else {
      try {
        remoteKey = String(JSON.parse(await drive.downloadText(token, remote.id)).rapidApiKey ?? '')
      } catch (err) {
        if (err instanceof drive.AuthError) throw err
      }
    }
  }
  if (local && local !== (last?.key ?? '') && local !== remoteKey) {
    const file = await drive.uploadFile(token, {
      fileId: remote?.id,
      name: SETTINGS_FILE,
      content: new Blob([JSON.stringify({ rapidApiKey: local })], { type: 'application/json' }),
    })
    save({ settings: { fileId: file.id, version: file.version, key: local } })
  } else if (remote) {
    if (remoteKey && remoteKey !== local) setRapidApiKey(remoteKey)
    save({ settings: { fileId: remote.id, version: remote.version, key: remoteKey } })
  }
}

function setTripState(tripId: string, state: TripSyncState | null) {
  const trips = { ...saved.trips }
  if (state) trips[tripId] = state
  else delete trips[tripId]
  save({ trips })
}

async function withRemoteWrites<T>(write: () => Promise<T>): Promise<T> {
  applyingRemote = true
  try {
    return await write()
  } finally {
    applyingRemote = false
  }
}

/** Fingerprint of a trip's content (photos by id: their images never change). */
async function contentHash(data: TripData, photoRefs?: PhotoRef[]): Promise<string> {
  const photos = photoRefs ?? data.photos.map(({ image: _image, ...ref }) => ref)
  const { trip, days, places, legs, expenses, stays, options } = data
  const text = JSON.stringify({ trip, days, places, legs, expenses, stays, options, photos })
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// --- Automatic sync --------------------------------------------------------------

/** Syncs on start, after changes, when the connection comes back and when the app is put away. */
export function startAutoSync(): void {
  onTripDataChange(() => {
    if (applyingRemote || !saved.account) return
    if (!saved.pending) {
      save({ pending: true })
      setStatus({ pending: true })
    }
    clearTimeout(debounce)
    debounce = setTimeout(() => void syncNow(), DEBOUNCE_MS)
  })
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saved.pending) void syncNow()
    if (document.visibilityState === 'visible') void syncNow()
  })
  if (navigator.onLine) void syncNow()
}
