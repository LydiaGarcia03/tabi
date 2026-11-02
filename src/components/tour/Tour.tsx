// The app tour on computers (User's picks from two mocks, 2026-11-02): a red "?" at the bottom right (3A); a welcome
// card with a red band and the torii on a medallion (1-Z) saying an example trip is used; then each step darkens the page
// but the part it explains, outlined with a red pulse, with a card beside it (2A + 2C's pulse); the same red band to
// end (4A), keeping the example trip or deleting it.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { SIDEBAR } from '../../breakpoints'
import { href, navigate } from '../../router'
import { deleteExampleTrip, ensureExampleTrip, type ExampleTrip } from '../../tour/exampleTrip'
import { requestNewTrip, setTour, TOUR_STEPS, tourSeen, useTour } from '../../tour/tour'
import { useMediaQuery } from '../../useMediaQuery'
import { Icon } from '../Icon'

export function Tour() {
  const wide = useMediaQuery(SIDEBAR)
  const tour = useTour()

  // The first time the app is opened on a computer.
  useEffect(() => {
    if (wide && !tourSeen()) setTour({ phase: 'intro' })
  }, [wide])

  if (!wide) return null
  switch (tour.phase) {
    case 'closed':
      return (
        <button type="button" className="tour-button" aria-label="Tour of the app" title="Tour" onClick={() => setTour({ phase: 'intro' })}>
          <Icon name="help" size={24} />
        </button>
      )
    case 'intro':
      return <TourIntro starting={!!tour.starting} />
    case 'steps':
      return <TourSteps key={tour.step} step={tour.step} example={tour.example} />
    case 'end':
      return <TourEnd />
  }
}

function close() {
  setTour({ phase: 'closed' })
}

/** Esc closes, ← → move between steps. */
function useKeys(keys: Record<string, () => void>) {
  const ref = useRef(keys)
  useLayoutEffect(() => {
    ref.current = keys
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = ref.current[e.key]
      if (!action) return
      e.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function TourIntro({ starting }: { starting: boolean }) {
  const [error, setError] = useState(false)
  useKeys({ Escape: close })

  async function start() {
    setTour({ phase: 'intro', starting: true })
    try {
      const example = await ensureExampleTrip()
      setTour({ phase: 'steps', step: 0, example })
    } catch {
      setTour({ phase: 'intro' })
      setError(true)
    }
  }

  return (
    <TourModal icon={<ToriiMark />} labelledBy="tour-intro-title">
      <h2 id="tour-intro-title">Welcome to {__APP__.name}</h2>
      <p>
        To show you around, we’ll use an example trip, <strong>Japan in spring</strong>. It stays in your trips afterwards, so you
        can explore it or delete it.
      </p>
      {error && <p className="error small">The example trip couldn’t be saved on this device. Try again.</p>}
      <button type="button" className="primary" disabled={starting} onClick={() => void start()} autoFocus>
        {starting ? 'Getting it ready…' : 'Start the tour'}
      </button>
      <button type="button" className="link tour-later" onClick={close}>
        Skip for now
      </button>
    </TourModal>
  )
}

function TourEnd() {
  const [busy, setBusy] = useState(false)
  useKeys({ Escape: close })

  async function deleteExample() {
    setBusy(true)
    navigate({ page: 'trips' })
    await deleteExampleTrip()
    close()
  }

  return (
    <TourModal icon={<Icon name="check" size={34} weight={2.6} />} labelledBy="tour-end-title">
      <h2 id="tour-end-title">That’s the tour!</h2>
      <p>
        The example trip <strong>Japan in spring</strong> is in your trips. Open it any time to see how a planned trip looks.
      </p>
      <div className="tour-end-actions">
        <button type="button" disabled={busy} onClick={() => void deleteExample()}>
          Delete the example
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy}
          autoFocus
          onClick={() => {
            requestNewTrip()
            navigate({ page: 'trips' })
            close()
          }}
        >
          Create my trip
        </button>
      </div>
      <p className="muted small tour-replay">Replay the tour from the ? button.</p>
    </TourModal>
  )
}

/** The welcome and end card: a red band with 旅 faded in it, a medallion half over it, then the text. */
function TourModal({ icon, labelledBy, children }: { icon: ReactNode; labelledBy: string; children: ReactNode }) {
  return (
    <div className="tour-layer">
      <div className="tour-shade" />
      <div className="tour-modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <div className="tour-band" aria-hidden="true">
          <span lang="ja">{__APP__.nameJapanese}</span>
        </div>
        <div className="tour-medallion" aria-hidden="true">
          {icon}
        </div>
        <div className="tour-modal-body">{children}</div>
      </div>
    </div>
  )
}

/** The torii of the app's logo, in red without its tile. */
function ToriiMark() {
  return (
    <svg width="40" height="40" viewBox="14 20 72 64" aria-hidden="true">
      <g fill="var(--accent)">
        <rect x="16" y="24" width="68" height="7" />
        <rect x="20" y="31" width="60" height="4" />
        <rect x="47" y="35" width="6" height="10" />
        <rect x="23" y="45" width="54" height="5" />
        <rect x="30" y="35" width="7" height="45" />
        <rect x="63" y="35" width="7" height="45" />
      </g>
    </svg>
  )
}

interface Box {
  x1: number
  y1: number
  x2: number
  y2: number
}

const PAD = 8
const CARD_WIDTH = 320
const GAP = 16
const EDGE = 12
/** The app bar stays on top: what is under it can't be seen. */
const TOP = 72

function TourSteps({ step, example }: { step: number; example: ExampleTrip }) {
  const current = TOUR_STEPS[step]
  const last = step === TOUR_STEPS.length - 1
  const [box, setBox] = useState<Box | null>(null)
  const [lost, setLost] = useState(false)
  const [cardHeight, setCardHeight] = useState(200)
  const cardRef = useRef<HTMLDivElement>(null)

  const next = () => setTour(last ? { phase: 'end', example } : { phase: 'steps', step: step + 1, example })
  const back = () => step > 0 && setTour({ phase: 'steps', step: step - 1, example })
  useKeys({ Escape: close, ArrowRight: next, ArrowLeft: back })

  // Go to the step's page, then follow its target (pages load their data after they open; the page may scroll).
  useEffect(() => {
    const target = href(current.route(example))
    if (window.location.hash !== target) window.location.hash = target
    const started = performance.now()
    let scrolled = false
    let frame = 0
    let previous = ''
    const follow = () => {
      let r = targetRect(current.target)
      if (r) {
        if (!scrolled && r.height > 0) {
          scrolled = true
          const room = window.innerHeight - TOP - EDGE
          // No room beside it (a wide part): at the top, so the card fits below it.
          const besideRoom = r.right + PAD + GAP + CARD_WIDTH <= window.innerWidth - EDGE || r.left - PAD - GAP - CARD_WIDTH >= EDGE
          if (!besideRoom) {
            if (Math.abs(r.top - PAD - TOP) > 4) window.scrollBy({ top: r.top - PAD - TOP, behavior: 'smooth' })
          } else if (r.top < TOP || r.bottom > window.innerHeight - EDGE) {
            const by = r.height <= room ? r.top - TOP - (room - r.height) / 2 : r.top - TOP
            window.scrollBy({ top: by, behavior: 'smooth' })
          }
          r = targetRect(current.target) ?? r
        }
        const next: Box = {
          x1: Math.max(r.left - PAD, 4),
          y1: Math.max(r.top - PAD, 4),
          x2: Math.min(r.right + PAD, window.innerWidth - 4),
          y2: Math.min(r.bottom + PAD, window.innerHeight - 4),
        }
        const key = [next.x1, next.y1, next.x2, next.y2].map(Math.round).join()
        if (key !== previous) {
          previous = key
          setBox(next.y2 > next.y1 + 8 && next.x2 > next.x1 + 8 ? next : null)
        }
      } else if (performance.now() - started > 4000) {
        setLost(true)
      }
      frame = requestAnimationFrame(follow)
    }
    frame = requestAnimationFrame(follow)
    return () => cancelAnimationFrame(frame)
  }, [current, example])

  // The card's height decides where it fits; it shows once there is something to point at.
  const shown = !!box || lost
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    setCardHeight(card.offsetHeight)
    card.focus({ preventScroll: true })
    const observer = new ResizeObserver(() => setCardHeight(card.offsetHeight))
    observer.observe(card)
    return () => observer.disconnect()
  }, [shown])

  const placement = box ? placeCard(box, cardHeight) : null
  // Nothing to point at yet: just the darkened page, the card coming when the target shows (or alone after a while).
  // A target with no room around it gets the card in the middle.
  if (!shown) {
    return (
      <div className="tour-layer">
        <div className="tour-shade" />
      </div>
    )
  }

  return (
    <div className="tour-layer">
      <div className="tour-shade" style={box ? holeMask(box) : undefined} />
      {box && <div className="tour-ring" style={{ left: box.x1, top: box.y1, width: box.x2 - box.x1, height: box.y2 - box.y1 }} />}
      <div
        ref={cardRef}
        className={`tour-card${placement ? ` arrow-${placement.side}` : ' centered'}`}
        style={placement ? { left: placement.left, top: placement.top, ['--arrow' as string]: `${placement.arrow}px` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-step-title"
        tabIndex={-1}
      >
        <p className="muted small">
          {current.chapter} · {step + 1} of {TOUR_STEPS.length}
        </p>
        <h2 id="tour-step-title">{current.title}</h2>
        {current.text && <p>{current.text}</p>}
        {current.points && (
          <ul className="tour-points">
            {current.points.map(([name, what]) => (
              <li key={typeof name === 'string' ? name : name.label}>
                {typeof name === 'string' ? (
                  <strong>{name}</strong>
                ) : (
                  <span className="tour-point-icon" role="img" aria-label={name.label} title={name.label}>
                    <Icon name={name.icon} size={14} />
                  </span>
                )}{' '}
                {what}
              </li>
            ))}
          </ul>
        )}
        {current.after && <p>{current.after}</p>}
        <div className="tour-card-actions">
          <button type="button" className="link tour-skip" onClick={close}>
            Skip tour
          </button>
          {step > 0 && (
            <button type="button" onClick={back}>
              Back
            </button>
          )}
          <button type="button" className="primary" onClick={next}>
            {last ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Where the step's parts are on the screen (all of them together); null while none is there. */
function targetRect(target: string | string[]): { left: number; top: number; right: number; bottom: number; height: number } | null {
  const rects = (Array.isArray(target) ? target : [target])
    .map((selector) => document.querySelector(selector)?.getBoundingClientRect())
    .filter((r): r is DOMRect => !!r && r.width + r.height > 0)
  if (rects.length === 0) return null
  const left = Math.min(...rects.map((r) => r.left))
  const top = Math.min(...rects.map((r) => r.top))
  const right = Math.max(...rects.map((r) => r.right))
  const bottom = Math.max(...rects.map((r) => r.bottom))
  return { left, top, right, bottom, height: bottom - top }
}

/** Beside the target (right, left, below, above: the first with room), the arrow pointing at it; else null. */
function placeCard(box: Box, height: number): { left: number; top: number; side: 'r' | 'l' | 'b' | 't'; arrow: number } | null {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max))
  const sideTop = () => clamp(box.y1, TOP, vh - height - EDGE)
  const sideArrow = (top: number) => clamp((Math.max(box.y1, top) + Math.min(box.y2, top + height)) / 2 - top - 7, 16, height - 30)
  const endLeft = () => clamp(box.x1, EDGE, vw - CARD_WIDTH - EDGE)
  const endArrow = (left: number) => clamp((Math.max(box.x1, left) + Math.min(box.x2, left + CARD_WIDTH)) / 2 - left - 7, 16, CARD_WIDTH - 30)
  if (box.x2 + GAP + CARD_WIDTH <= vw - EDGE) {
    const top = sideTop()
    return { left: box.x2 + GAP, top, side: 'r', arrow: sideArrow(top) }
  }
  if (box.x1 - GAP - CARD_WIDTH >= EDGE) {
    const top = sideTop()
    return { left: box.x1 - GAP - CARD_WIDTH, top, side: 'l', arrow: sideArrow(top) }
  }
  if (box.y2 + GAP + height <= vh - EDGE) {
    const left = endLeft()
    return { left, top: box.y2 + GAP, side: 'b', arrow: endArrow(left) }
  }
  if (box.y1 - GAP - height >= TOP) {
    const left = endLeft()
    return { left, top: box.y1 - GAP - height, side: 't', arrow: endArrow(left) }
  }
  return null
}

/** The shade everywhere but a rounded hole around the target. */
function holeMask({ x1, y1, x2, y2 }: Box): CSSProperties {
  const w = window.innerWidth
  const h = window.innerHeight
  const q = Math.min(14, (x2 - x1) / 2, (y2 - y1) / 2)
  const hole = `M${x1 + q} ${y1}H${x2 - q}A${q} ${q} 0 0 1 ${x2} ${y1 + q}V${y2 - q}A${q} ${q} 0 0 1 ${x2 - q} ${y2}H${x1 + q}A${q} ${q} 0 0 1 ${x1} ${y2 - q}V${y1 + q}A${q} ${q} 0 0 1 ${x1 + q} ${y1}Z`
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><path fill-rule='evenodd' d='M0 0H${w}V${h}H0Z${hole}'/></svg>`
  const mask = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  return { maskImage: mask, WebkitMaskImage: mask }
}
