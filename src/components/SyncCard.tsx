import { useEffect, useState } from 'react'
import {
  refreshQuota,
  resolveConflict,
  signIn,
  signOut,
  syncNow,
  useSyncStatus,
  type ConflictChoice,
  type SyncConflict,
  type SyncStatus,
} from '../sync/sync'
import { useOnline } from '../useOnline'

const MB = 1024 * 1024
/** Below this much free space in Drive, warn before it fills up. */
const LOW_SPACE = 500 * MB

/** Settings → Account & sync (Google Drive). */
export function SyncCard() {
  const status = useSyncStatus()
  const online = useOnline()
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  useEffect(() => {
    if (status.account) void refreshQuota()
  }, [status.account])

  return (
    <section className="card sync-card">
      <h2>Account &amp; sync</h2>
      {!status.available ? (
        <p className="muted small">Sync is not set up in this build (VITE_GOOGLE_CLIENT_ID is missing).</p>
      ) : !status.account ? (
        <>
          <p className="small">
            Sign in with Google to have the same trips on your phone and your computer, and your NAVITIME key on both.
          </p>
          <p className="muted small">
            Everything is saved in a hidden Tabi folder in your own Google Drive (Tabi can't see your other files). It uses
            your Drive storage: about 1–2 MB per trip, plus about 0.2 MB per photo. <strong>Make sure your Drive has free
            space</strong>, or syncing stops (nothing is lost: it stays on this device).
          </p>
          <p className="muted small">
            The app still works offline; changes are sent when you're back online. Trips already on this device are sent
            to Drive when you sign in.
          </p>
          <div className="row">
            <button type="button" className="primary" disabled={!online} onClick={() => void signIn()}>
              Sign in with Google
            </button>
            {!online && <span className="muted small">Needs internet.</span>}
          </div>
          {status.error && <p className="error small">{status.error}</p>}
        </>
      ) : (
        <>
          <p className="small">
            Signed in as <strong>{status.account.email}</strong>
          </p>
          <SyncState status={status} online={online} />
          <DriveSpace quota={status.quota} />
          {status.conflicts.map((c) => (
            <ConflictChoiceBox key={c.tripId} conflict={c} />
          ))}
          <div className="row wrap">
            <button type="button" disabled={!online || status.phase === 'syncing'} onClick={() => void syncNow(true)}>
              {status.phase === 'signin' ? 'Sign in again and sync' : 'Sync now'}
            </button>
            {confirmSignOut ? (
              <>
                <button type="button" className="danger" onClick={() => void signOut().then(() => setConfirmSignOut(false))}>
                  Sign out
                </button>
                <button type="button" onClick={() => setConfirmSignOut(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmSignOut(true)}>
                Sign out…
              </button>
            )}
          </div>
          {confirmSignOut && (
            <p className="muted small">
              This device stops syncing. Your trips stay here and in your Drive; changes made here from now on aren't sent.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function SyncState({ status, online }: { status: SyncStatus; online: boolean }) {
  let text: string
  if (status.phase === 'syncing') text = 'Syncing…'
  else if (status.phase === 'signin') text = 'Paused: the Google sign-in expired (it lasts about an hour). Sign in again to sync.'
  else if (!online) text = status.pending ? 'Offline: changes made here are sent when you are back online.' : 'Offline.'
  else if (status.pending) text = 'Changes made here are waiting to be sent.'
  else text = status.lastSync ? `Up to date · last synced ${formatWhen(status.lastSync)}` : 'Not synced yet.'
  return (
    <>
      <p className="muted small">{text}</p>
      {status.phase === 'error' && status.error && <p className="error small">{status.error}</p>}
    </>
  )
}

function DriveSpace({ quota }: { quota: SyncStatus['quota'] }) {
  if (!quota) return null
  if (quota.limit == null) return <p className="muted small">Google Drive: unlimited storage.</p>
  const free = Math.max(0, quota.limit - quota.usage)
  return (
    <p className={`small ${free < LOW_SPACE ? 'warning' : 'muted'}`}>
      Google Drive: {formatSize(free)} free of {formatSize(quota.limit)}
      {free < LOW_SPACE && ' — almost full: syncing may stop. Free some space in your Drive.'}
    </p>
  )
}

function ConflictChoiceBox({ conflict }: { conflict: SyncConflict }) {
  const [busy, setBusy] = useState(false)
  const choose = (choice: ConflictChoice) => {
    setBusy(true)
    void resolveConflict(conflict.tripId, choice).finally(() => setBusy(false))
  }
  const choices: [ConflictChoice, string, string?][] =
    conflict.kind === 'both-changed'
      ? [
          ['device', "Keep this device's"],
          ['drive', "Keep Drive's", 'danger'],
          ['both', 'Keep both'],
        ]
      : [
          ['device', 'Keep it'],
          ['delete-here', 'Delete here too', 'danger'],
        ]
  return (
    <div className="import-conflict">
      <p className="small">
        {conflict.kind === 'both-changed' ? (
          <>
            “{conflict.name}” is different here and in Drive (changed on both devices since the last sync). Which one do
            you keep? The other version is replaced; “Keep both” makes a copy.
          </>
        ) : (
          <>
            “{conflict.name}” was deleted on another device. Delete it here too, or keep it (it is sent to Drive again)?
          </>
        )}
      </p>
      <div className="row wrap">
        {choices.map(([choice, label, className]) => (
          <button key={choice} type="button" className={className} disabled={busy} onClick={() => choose(choice)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * MB ? `${(bytes / (1024 * MB)).toFixed(1)} GB` : `${Math.round(bytes / MB)} MB`
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
