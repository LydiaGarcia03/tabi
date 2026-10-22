import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { Stars } from '../components/Stars'
import { baseIcon, baseMarkerSvg } from '../db/stays'
import type { StayBase } from '../db/model'
import { ICON_PATHS, type IconName } from '../iconPaths'
import { placePinSvg } from '../mapLines'
import { applyTheme } from '../theme'

const NAMES = Object.keys(ICON_PATHS) as IconName[]
const BASE_KINDS: StayBase['kind'][] = ['hotel', 'station', 'other', undefined]

/**
 * Developer page (#/dev/icons): every icon of the app, and the places they
 * are used, in light and dark, to check them quickly. Changes no data.
 */
export function IconsPage() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark')
  const [rating, setRating] = useState<number | undefined>(3)
  const [favorite, setFavorite] = useState(true)
  const [chosen, setChosen] = useState(false)

  // Only for this page: the saved theme comes back when leaving it.
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])
  useEffect(() => () => applyTheme(), [])

  return (
    <>
      <header className="hero row between wrap">
        <h1>Icons</h1>
        <button type="button" onClick={() => setDark(!dark)}>
          {dark ? 'Light' : 'Dark'} mode
        </button>
      </header>

      <section className="card">
        <h2>All icons</h2>
        <ul className="icon-gallery">
          {NAMES.map((name) => (
            <li key={name}>
              <span className="icon-gallery-sizes">
                <Icon name={name} size={28} />
                <Icon name={name} size={18} />
                <Icon name={name} size={14} />
              </span>
              <code className="small">{name}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Options</h2>
        <p className="row wrap">
          <button type="button" className={`icon-toggle${favorite ? ' on' : ''}`} title="Favorite" onClick={() => setFavorite(!favorite)}>
            <Icon name="star" filled={favorite} />
          </button>
          <button type="button" className={`icon-toggle${chosen ? ' on' : ''}`} title="Choose" onClick={() => setChosen(!chosen)}>
            <Icon name="check" />
          </button>
          <button type="button" className="icon-toggle" title="Discard">
            <Icon name="close" />
          </button>
          <span className="muted small">(tap them)</span>
        </p>
        <p>
          <span className="status-mark favorite">
            <Icon name="star" size={15} filled />
          </span>
          Favorite option ·{' '}
          <span className="status-mark chosen">
            <Icon name="check" size={15} weight={2.6} />
          </span>
          Chosen option
        </p>
        <p className="badges">
          <span className="badge badge-best">
            <Icon name="sparkle" size={13} /> Best match
          </span>
          <span className="badge">
            <Icon name="wallet" size={13} /> Cheapest
          </span>
          <span className="badge">
            <Icon name="pin" size={13} /> Closest
          </span>
          <span className="badge">
            <Icon name="clock" size={13} /> Fastest
          </span>
          <span className="badge">
            <Icon name="star" size={13} filled /> Your top
          </span>
        </p>
        <p className="row wrap">
          <Stars value={rating} onChange={setRating} /> <Stars value={4} />
        </p>
      </section>

      <section className="card">
        <h2>Day</h2>
        <ol className="timeline">
          <li className="base-stop">
            <span className="base-stop-icon" aria-hidden="true">
              <Icon name="home" size={20} />
            </span>
            <span className="base-stop-text">
              <span className="base-stop-label">Back to base</span>
              <span className="muted small">Super Hotel Namba</span>
            </span>
            <button type="button" className="ghost icon-button" aria-label="Remove">
              <Icon name="close" size={16} />
            </button>
          </li>
          <li className="base-add">
            <button type="button" className="link small">
              <Icon name="plus" size={14} /> <Icon name="home" size={15} /> Back to base
            </button>
          </li>
        </ol>
        <p className="small">
          <span className="muted">Reservation:</span> <span className="warning">Reservation needed</span> ·{' '}
          <span className="muted">
            <Icon name="check" size={14} /> Reserved
          </span>
        </p>
      </section>

      <section className="card">
        <h2>Map markers</h2>
        <p className="muted small">City bases (a tile, not a pin) next to a place pin.</p>
        <div className="icon-map-sample">
          {BASE_KINDS.map((kind) => (
            <span key={kind ?? 'old'} className="icon-map-item">
              <span className="base-pin" dangerouslySetInnerHTML={{ __html: baseMarkerSvg({ kind }) }} />
              <code className="small">{baseIcon({ kind })}</code>
            </span>
          ))}
          <span className="icon-map-item">
            <span className="map-pin" dangerouslySetInnerHTML={{ __html: placePinSvg('2', {}) }} />
            <code className="small">place</code>
          </span>
        </div>
      </section>
    </>
  )
}
