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

interface ChoiceInfo {
  choice: ConflictChoice
  label: string
  /** What happens, shown under the button. */
  effect: string
  /** Shown before confirming. */
  confirm: string
  danger?: boolean
}

function conflictChoices(name: string, kind: SyncConflict['kind']): ChoiceInfo[] {
  return kind === 'both-changed'
    ? [
        {
          choice: 'device',
          label: "Keep this device's",
          effect: 'Use the version on this device. The one in Drive (and on your other device) is replaced.',
          confirm: `Keep this device's “${name}”? The version in Drive and on your other device is replaced by it.`,
        },
        {
          choice: 'drive',
          label: "Keep Drive's",
          effect: 'Use the version from your other device. The one on this device is replaced.',
          confirm: `Keep Drive's “${name}”? The version on this device is replaced by it.`,
          danger: true,
        },
        {
          choice: 'both',
          label: 'Keep both',
          effect: 'Rarely what you want: you end up with two trips, Drive’s version as “(copy)”.',
          confirm: `Keep both? You'll have two trips: “${name}” from this device and “${name} (copy)” from Drive. You can delete one later.`,
        },
      ]
    : [
        {
          choice: 'device',
          label: 'Keep it',
          effect: 'The trip stays here and is sent to Drive again (it comes back on your other device).',
          confirm: `Keep “${name}”? It comes back on your other device too.`,
        },
        {
          choice: 'delete-here',
          label: 'Delete here too',
          effect: 'The trip is deleted from this device as well.',
          confirm: `Delete “${name}” from this device too? This can't be undone.`,
          danger: true,
        },
      ]
}

function ConflictChoiceBox({ conflict }: { conflict: SyncConflict }) {
  const [busy, setBusy] = useState(false)
  // Every choice replaces or deletes something: a second tap confirms it.
  const [picked, setPicked] = useState<ChoiceInfo | null>(null)
  const choose = (choice: ConflictChoice) => {
    setBusy(true)
    void resolveConflict(conflict.tripId, choice).finally(() => {
      setBusy(false)
      setPicked(null)
    })
  }
  return (
    <div className="import-conflict">
      <p className="small">
        {conflict.kind === 'both-changed' ? (
          <>
            “{conflict.name}” is different on this device and in Drive: it was changed on both devices since the last
            sync. Usually you keep the version you edited last.
          </>
        ) : (
          <>“{conflict.name}” was deleted on another device, but it is still here.</>
        )}
      </p>
      {picked ? (
        <div className="conflict-confirm">
          <p className="small">{picked.confirm}</p>
          <div className="row wrap">
            <button type="button" className={picked.danger ? 'danger' : 'primary'} disabled={busy} onClick={() => choose(picked.choice)}>
              {busy ? 'Working…' : `Yes, ${picked.label.charAt(0).toLowerCase()}${picked.label.slice(1)}`}
            </button>
            <button type="button" disabled={busy} onClick={() => setPicked(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <ul className="conflict-choices">
          {conflictChoices(conflict.name, conflict.kind).map((info) => (
            <li key={info.choice}>
              <button type="button" className={info.danger ? 'danger' : undefined} onClick={() => setPicked(info)}>
                {info.label}
              </button>
              <span className="muted small">{info.effect}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * MB ? `${(bytes / (1024 * MB)).toFixed(1)} GB` : `${Math.round(bytes / MB)} MB`
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
