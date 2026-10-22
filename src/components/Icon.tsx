// Small line icons (24×24 grid, drawn with the current text color).

const PATHS = {
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  up: 'M6 15l6-6 6 6',
  close: 'M6 6l12 12M18 6L6 18',
  edit: 'M4 20h4L18.5 9.5a2.1 2.1 0 00-3-3L5 17v3zM13.5 8.5l2 2',
  book: 'M6 4h11a2 2 0 012 2v14H8a2 2 0 01-2-2V4zM6 18a2 2 0 012-2h11M10 8h5',
  layers: 'M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  settings:
    'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 001 1h12a1 1 0 001-1v-6',
  print: 'M7 9V4h10v5M7 17H5a1 1 0 01-1-1v-6a1 1 0 011-1h14a1 1 0 011 1v6a1 1 0 01-1 1h-2M7 14h10v6H7z',
  map: 'M9 4L4 6v14l5-2 6 2 5-2V4l-5 2-6-2zM9 4v14M15 6v14',
  plus: 'M12 5v14M5 12h14',
  calendar: 'M5 6h14v14H5zM5 10h14M9 4v4M15 4v4',
  pin: 'M12 21s-6-5.7-6-11a6 6 0 0112 0c0 5.3-6 11-6 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  wallet: 'M4 7h14a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V7zM4 7l11-3v3M16 13.5h.01',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
  download: 'M12 4v11M8 11l4 4 4-4M5 19h14',
  door: 'M6 20V5a1 1 0 011-1h10a1 1 0 011 1v15M4 20h16M14.5 12h.01',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z',
  /** Drag handle: three lines between an up and a down arrow. */
  reorder: 'M9 5l3-3 3 3M9 19l3 3 3-3M6 9h12M6 12h12M6 15h12',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18, weight = 1.8 }: { name: IconName; size?: number; weight?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** The app mark: a torii gate on the app red. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" rx="24" fill="var(--accent)" />
      <g fill="var(--on-accent)" transform="translate(0 2)">
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
