import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Place } from '../../db/model'
import { KIND_SINGULAR } from '../../planning/optionKinds'
import type { FromOptionInfo } from '../../places/useFromOption'
import { useFromOption } from '../../places/useFromOption'
import { OptionDetails } from '../OptionDetails'
import { BlobImage } from '../Photos'
import { Sheet } from '../Sheet'

/**
 * A place's option details (photos, facts, notes), read-only, without leaving the Logbook (User's choices from a
 * mock, 2026-10-28: 3B, a panel rising from the bottom on phones, pulled down to close). Works offline.
 */
export function PlaceDetailsSheet({ place, found, onClose }: { place: Place; found: FromOptionInfo; onClose: () => void }) {
  const { option, trip, images } = found
  return (
    <Sheet title={KIND_SINGULAR[option.kind]} bottom onClose={onClose}>
      <OptionDetails option={option} trip={trip} images={images} inPlan={place.bookAhead && place.booked ? 'booked' : 'in'} onClose={onClose} />
    </Sheet>
  )
}

/** "The day" list (choice 2A): the place's first photo before its name; a tap opens its details. Nothing without photos. */
export function PlaceThumb({ place }: { place: Place }) {
  const found = useFromOption(place)
  const [open, setOpen] = useState(false)
  if (!found || found.images.length === 0) return null
  const count = found.images.length
  return (
    <>
      <button
        type="button"
        className="logbook-thumb"
        aria-label={`Details and photos of ${place.name}`}
        onClick={(e) => {
          // React passes taps inside the sheet (on <body>) up to here too: leave those alone (links in it).
          if (!e.currentTarget.contains(e.target as Node)) return
          // Inside the row's <summary>: open the details, not the row.
          e.preventDefault()
          setOpen(true)
        }}
      >
        <BlobImage image={found.images[0]} alt="" />
        {count > 1 && <span className="lead-photo-more">+{count - 1}</span>}
      </button>
      {/* On <body>: inside the <summary>, every tap in the sheet would fold or unfold the row. */}
      {open && createPortal(<PlaceDetailsSheet place={place} found={found} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}
