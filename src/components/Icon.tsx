// Small line icons (24×24 grid, drawn with the current text color). The paths are in iconPaths.ts.

import { ICON_PATHS, type IconName } from '../iconPaths'

export type { IconName }

/**
 * `weight` fixes the stroke width; without it the icon follows the weight of
 * the text around it (normal, semibold, bold: see `.icon` in index.css).
 */
export function Icon({ name, size = 18, weight, filled = false }: { name: IconName; size?: number; weight?: number; filled?: boolean }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      style={weight != null ? { strokeWidth: weight } : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
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
