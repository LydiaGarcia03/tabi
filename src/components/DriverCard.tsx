import { useLiveQuery } from 'dexie-react-hooks'
import { useContext, useEffect, useState, type FormEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { db } from '../db/db'
import type { LocalNames, Place, Stay } from '../db/model'
import { updateStay } from '../db/stays'
import { updatePlace } from '../db/trips'
import { romanize } from '../i18n/romanize'
import { fetchLocalNames } from '../places/googlePlaces'
import { DriverCardContext, localLanguage } from '../places/localNames'
import { Icon } from './Icon'

type Target = { place: Place; stay?: undefined } | { stay: Stay; place?: undefined }

/**
 * The card icon (no text) beside a place of the Logbook, the place in focus and "Back to base" (User, 2026-10-31).
 * A tap opens the driver card.
 */
export function DriverCardButton(target: Target) {
  const [open, setOpen] = useState(false)
  const name = target.place?.name ?? target.stay?.base?.name ?? ''
  const show = (e: MouseEvent) => {
    // Inside a row's <summary>: don't fold or unfold it.
    e.preventDefault()
    e.stopPropagation()
    setOpen(true)
  }
  return (
    <>
      <button type="button" className="ghost icon-button driver-card-button" aria-label={`Show ${name} to a driver`} title="Show to a driver" onClick={show}>
        <Icon name="card" size={18} />
      </button>
      {open && createPortal(<DriverCard {...target} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

/**
 * "Show to a driver" (User's choice 5b-B from a mock, 2026-10-31): the address in the local language, huge, how it
 * reads under it (muted), then the local name and its reading; meant to be held sideways (phones go full screen and
 * turn to landscape when Chrome lets them). Works offline. Edit: type the local texts, or get them from Google.
 */
function DriverCard({ place, stay, onClose }: Target & { onClose: () => void }) {
  const base = stay?.base
  const title = place?.name ?? base?.name ?? ''
  const englishAddress = place?.address
  const local = place?.local ?? base?.local ?? {}
  const [editing, setEditing] = useState(false)
  const { googlePlaceId, language, online } = useGoogleSource(place, stay)
  const [fetching, setFetching] = useState<'no' | 'yes' | 'failed'>('no')

  // Always the address in the local language (User): when it isn't saved yet and Google knows the place, it is
  // asked for once (1 request) and saved on the place, so the card works offline afterwards.
  const canFetch = !local.address && !!googlePlaceId && !!language && online
  useEffect(() => {
    if (!canFetch || fetching !== 'no') return
    setFetching('yes')
    fetchLocalNames(googlePlaceId!, language!)
      .then((found) => (found.address ? save({ ...local, address: found.address, name: local.name ?? found.name }) : setFetching('failed')))
      .catch(() => setFetching('failed'))
    // Once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFetch])
  // While Google answers (usually well under a second) the texts stay hidden, so the saved English one never flashes
  // before the local one (User); after 3 s, or if it fails, the English address shows.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 3000)
    return () => clearTimeout(timer)
  }, [])
  const waiting = canFetch && fetching !== 'failed' && !slow

  // Phones: full screen, sideways (Chrome allows the turn only in full screen); back as it was on close.
  useEffect(() => {
    if (!matchMedia('(pointer: coarse)').matches) return
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    document.documentElement
      .requestFullscreen?.()
      .then(() => orientation.lock?.('landscape'))
      .catch(() => {})
    return () => {
      orientation.unlock?.()
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const address = local.address ?? englishAddress ?? title
  const addressReading = local.addressReading || romanize(local.address) || (local.address ? englishAddress : undefined)
  const name = local.name ?? title
  const nameReading = local.nameReading || romanize(local.name) || (local.name && local.name !== title ? title : undefined)

  async function save(next: LocalNames) {
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v?.trim())) as LocalNames
    const value = Object.keys(clean).length ? clean : undefined
    if (place) await updatePlace(place.id, { local: value })
    else if (stay?.base) await updateStay(stay.id, { base: { ...stay.base, local: value } })
    setEditing(false)
  }

  return (
    // Computers: a window in the middle of the screen (a click outside closes it); phones: the whole screen (User).
    <div className="driver-card-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div className="driver-card" role="dialog" aria-modal="true" aria-label={`${title}: show to a driver`}>
      <div className="driver-card-top">
        <span>{title}</span>
        {!editing && (
          <button type="button" className="ghost driver-card-edit" onClick={() => setEditing(true)}>
            <Icon name="edit" size={16} /> Edit
          </button>
        )}
        <button type="button" className="ghost icon-button" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={22} />
        </button>
      </div>
      {editing ? (
        <LocalForm place={place} stay={stay} local={local} englishAddress={englishAddress} onSave={save} onCancel={() => setEditing(false)} />
      ) : waiting ? (
        <div className="driver-card-body" aria-busy="true" />
      ) : (
        <div className="driver-card-body">
          <p className="driver-card-address">{address}</p>
          {addressReading && <p className="driver-card-reading">{addressReading}</p>}
          <p className="driver-card-name">{name}</p>
          {nameReading && <p className="driver-card-reading">{nameReading}</p>}
          {!local.address &&
            (fetching === 'yes' ? (
              <p className="driver-card-hint muted">Getting the address in the local language…</p>
            ) : (
              <button type="button" className="link driver-card-hint" onClick={() => setEditing(true)}>
                {googlePlaceId && !online ? 'No internet: the local address comes once online · Type it' : 'Add the address in the local language'}
              </button>
            ))}
        </div>
      )}
    </div>
    </div>
  )
}

/** Google's id for the place (a city base picked from a hotel option has it there) and the local language. */
function useGoogleSource(place?: Place, stay?: Stay) {
  const { countries, online } = useContext(DriverCardContext)
  const optionPlaceId = useLiveQuery(
    async () => (stay?.base?.optionId ? (await db.options.get(stay.base.optionId))?.googlePlaceId : undefined),
    [stay?.base?.optionId],
  )
  const point = place ?? stay?.base
  return { googlePlaceId: place?.googlePlaceId ?? optionPlaceId, language: point && localLanguage(countries, point), online }
}

/** The local name and address, typed or got from Google (1 request), and how they read. */
function LocalForm({
  place,
  stay,
  local,
  englishAddress,
  onSave,
  onCancel,
}: {
  place?: Place
  stay?: Stay
  local: LocalNames
  englishAddress?: string
  onSave: (local: LocalNames) => void
  onCancel: () => void
}) {
  const { googlePlaceId, language, online } = useGoogleSource(place, stay)
  const [draft, setDraft] = useState<LocalNames>(local)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key: keyof LocalNames, value: string) => setDraft({ ...draft, [key]: value })

  async function fromGoogle() {
    if (!googlePlaceId || !language) return
    setBusy(true)
    setError('')
    try {
      const found = await fetchLocalNames(googlePlaceId, language)
      setDraft({ ...draft, name: found.name ?? draft.name, address: found.address ?? draft.address })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    onSave(draft)
  }

  return (
    <form className="driver-card-form" onSubmit={submit}>
      <p className="muted small">The name and address as written in the country, for a taxi driver or anyone you ask. Saved on the place, offline.</p>
      {googlePlaceId && language && (
        <div className="row">
          <button type="button" onClick={fromGoogle} disabled={busy || !online}>
            <Icon name="search" size={16} /> {busy ? 'Getting them…' : 'Get them from Google'}
          </button>
          <span className="muted small">{online ? '1 request' : 'Needs internet'}</span>
        </div>
      )}
      {error && <p className="error small">{error}</p>}
      <label>
        Address in the local language
        <textarea rows={2} value={draft.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="東京都新宿区歌舞伎町1-19-1" />
      </label>
      <label>
        How the address reads
        <input
          value={draft.addressReading ?? ''}
          onChange={(e) => set('addressReading', e.target.value)}
          placeholder={romanize(draft.address) ?? englishAddress ?? 'Kabukichō 1-19-1, Shinjuku-ku'}
        />
      </label>
      <label>
        Name in the local language
        <input value={draft.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="ホテルグレイスリー新宿" />
      </label>
      <label>
        How the name reads
        <input value={draft.nameReading ?? ''} onChange={(e) => set('nameReading', e.target.value)} placeholder={romanize(draft.name) ?? 'Hoteru Gureisurī Shinjuku'} />
      </label>
      <p className="muted small">Left empty, the readings are made on the device for Cyrillic, Greek and Korean; for Japanese the address in English stands in.</p>
      <div className="row">
        <button type="submit" className="primary">
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
