// The app's line icons: SVG paths on a 24×24 grid, drawn with the current
// text color. Shared by <Icon> and the map markers (which need plain SVG).

export const ICON_PATHS = {
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  up: 'M6 15l6-6 6 6',
  close: 'M6 6l12 12M18 6L6 18',
  edit: 'M4 20h4L18.5 9.5a2.1 2.1 0 00-3-3L5 17v3zM13.5 8.5l2 2',
  book: 'M6 4h11a2 2 0 012 2v14H8a2 2 0 01-2-2V4zM6 18a2 2 0 012-2h11M10 8h5',
  layers: 'M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 001 1h12a1 1 0 001-1v-6',
  print: 'M7 9V4h10v5M7 17H5a1 1 0 01-1-1v-6a1 1 0 011-1h14a1 1 0 011 1v6a1 1 0 01-1 1h-2M7 14h10v6H7z',
  map: 'M9 4L4 6v14l5-2 6 2 5-2V4l-5 2-6-2zM9 4v14M15 6v14',
  drawMap: 'M3 6l4-2 5 2 4-2v6M3 6v13l4-2 4 2M7 4v13M12 6v6.5M13.5 21h2.2l5.4-5.4a1.5 1.5 0 00-2.2-2.2l-5.4 5.4V21z',
  plus: 'M12 5v14M5 12h14',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5.5M12 7.5h.01',
  plusCircle: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 8v8M8 12h8',
  minusCircle: 'M12 21a9 9 0 100-18 9 9 0 000 18zM8 12h8',
  calendar: 'M5 6h14v14H5zM5 10h14M9 4v4M15 4v4',
  pin: 'M12 21s-6-5.7-6-11a6 6 0 0112 0c0 5.3-6 11-6 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  wallet: 'M4 7h14a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V7zM4 7l11-3v3M16 13.5h.01',
  // Three dots: "More" (the itinerary's tabs on phones); drawn with a heavy stroke (weight) so the dots show.
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  // A pie chart with one slice out: the Budget page's "Breakdown".
  pie: 'M10 6.5a7 7 0 107 7h-7v-7zM13.5 3v7h7a7 7 0 00-7-7z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
  download: 'M12 4v11M8 11l4 4 4-4M5 19h14',
  door: 'M6 20V5a1 1 0 011-1h10a1 1 0 011 1v15M4 20h16M14.5 12h.01',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z',
  reorder: 'M9 5l3-3 3 3M9 19l3 3 3-3M6 9h12M6 12h12M6 15h12',
  // Six dots: the handle that drags a photo sideways.
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  check: 'M5 12.5l4.5 4.5L19 7',
  star: 'M12 3.8l2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.6l-5 2.65.95-5.6L3.9 9.7l5.6-.8z',
  bed:'M3 6v13M3 15h18v4M21 15v-2.5a3 3 0 00-3-3h-8V15M6.5 12.75a1.75 1.75 0 100-3.5 1.75 1.75 0 000 3.5z',
  station: 'M8 3.5h8a3 3 0 013 3V14a3 3 0 01-3 3H8a3 3 0 01-3-3V6.5a3 3 0 013-3zM5 10h14M9 13.5h.01M15 13.5h.01M9 17l-2 3.5M15 17l2 3.5',
  home: 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5',
  locate: 'M12 19a7 7 0 100-14 7 7 0 000 14zM12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM12 2v3M12 19v3M2 12h3M19 12h3',
  ban: 'M12 21a9 9 0 100-18 9 9 0 000 18zM5.6 5.6l12.8 12.8',
  walk: 'M13.5 6.3a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM12.5 8.5l-2 5.5 3.5 3v4.5M10.5 14l-2.5 6.5M12.5 8.5l3 3h3M12.5 8.5L9 10l-1 3.5',
  bus: 'M6 3.5h12a2 2 0 012 2V17a1 1 0 01-1 1H5a1 1 0 01-1-1V5.5a2 2 0 012-2zM9 5.5h6M6.5 8h11v5h-11zM7.5 15.5h.01M16.5 15.5h.01M6.5 18v2.5M17.5 18v2.5M2.5 8.5v3M21.5 8.5v3',
  train: 'M7 3h10a2 2 0 012 2v10a3 3 0 01-3 3H8a3 3 0 01-3-3V5a2 2 0 012-2zM5 9.5h14M12 3v6.5M8.5 14h.01M15.5 14h.01M8 18l-2 3M16 18l2 3',
  shinkansen: 'M2 16.5h14.5a5 5 0 004.6-3.1L22 11c-3.5-2.6-7.5-4-12-4H5a3 3 0 00-3 3v6.5zM2 12.5h18.5M6 9.5h2.5M11 9.5h2.5M3 20h18',
  subway:
    'M2 21v-8.5a10 8 0 0120 0V21M8 10.5h8a1.5 1.5 0 011.5 1.5v5a1.5 1.5 0 01-1.5 1.5H8A1.5 1.5 0 016.5 17v-5A1.5 1.5 0 018 10.5zM6.5 14h11M12 10.5V14M9.5 18.5L8 21M14.5 18.5L16 21',
  taxi: 'M3 15.5V13l2-1 2.5-4h8l3 4 2.5.8v2.7h-1.5M9.5 15.5h6M10.5 8V5.5h3V8M5.75 17.25a1.75 1.75 0 100-3.5 1.75 1.75 0 000 3.5zM17.25 17.25a1.75 1.75 0 100-3.5 1.75 1.75 0 000 3.5zM3 15.5h1',
  car: 'M3 15.5V13l2-1 2.5-4h8l3 4 2.5.8v2.7h-1.5M9.5 15.5h6M5.75 17.25a1.75 1.75 0 100-3.5 1.75 1.75 0 000 3.5zM17.25 17.25a1.75 1.75 0 100-3.5 1.75 1.75 0 000 3.5zM3 15.5h1',
  ferry:
    'M3.5 15l1.5 3.5h14l1.5-3.5h-17zM6.5 15v-4h11v4M9.5 11V8h5v3M12 5v3M2.5 21.5c1.6 0 1.6-1 3.2-1s1.6 1 3.2 1 1.6-1 3.2-1 1.6 1 3.2 1 1.6-1 3.2-1 1.6 1 3.2 1',
  plane: 'M21 15.5v-2L13.5 9V4.5a1.5 1.5 0 00-3 0V9L3 13.5v2l7.5-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5l-2-1.5v-5z',
  ticket: 'M4 7h16v3a2 2 0 000 4v3H4v-3a2 2 0 000-4V7zM14.5 8v1.5M14.5 11.25v1.5M14.5 14.5V16',
  food: 'M4 12h16a8 8 0 01-16 0zM9.5 20h5M13 3.5l-2.5 6.5M19.5 4.5L13.5 10',
  binoculars:
    'M5.5 19a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM18.5 19a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM9 15.5h6M2.6 14.5l2.4-8A1.5 1.5 0 016.5 5.5H8A1.5 1.5 0 019.5 7v8.5M21.4 14.5l-2.4-8A1.5 1.5 0 0017.5 5.5H16A1.5 1.5 0 0014.5 7v8.5',
  bag: 'M5 8h14l-1 12H6L5 8zM9 8V6.5a3 3 0 016 0V8',
  box: 'M4 8l8-4 8 4v8l-8 4-8-4V8zM4 8l8 4 8-4M12 12v8',
  purse: 'M4.5 11h15v7.5a1.5 1.5 0 01-1.5 1.5H6a1.5 1.5 0 01-1.5-1.5V11zM7 11c0-4 1.8-6.5 5-6.5s5 2.5 5 6.5M10.5 14h3',
  suitcase: 'M8 9h8a2 2 0 012 2v7a2 2 0 01-2 2H8a2 2 0 01-2-2v-7a2 2 0 012-2zM10 9V3.5h4V9M10 12.5v5M14 12.5v5M9 20v1.5M15 20v1.5',
  checked: 'M6 6.5h11a2 2 0 012 2V19a2 2 0 01-2 2H6a2 2 0 01-2-2V8.5a2 2 0 012-2zM9 6.5V3.5h5v3M4 11.5h15M4 16h15M7 21v1M16 21v1M19 9l2.2 1.2v3.3',
  warning: 'M12 4L2.5 20h19L12 4zM12 10v4.5M12 17.5h.01',
  save: 'M5 4h11l3 3v13H5V4zM8 4v5h7V4M8 20v-6h8v6',
  done: 'M12 21a9 9 0 100-18 9 9 0 000 18zM8 12.5l2.8 2.8L16 9.5',
  return: 'M9 14l-4-4 4-4M5 10h9.5a4.5 4.5 0 010 9H12',
  arrow: 'M5 12h14M13 6l6 6-6 6',
} as const

export type IconName = keyof typeof ICON_PATHS

/** The icon as an SVG string, for map markers (which aren't React). */
export function iconSvg(name: IconName, { size = 18, weight = 1.8, color = 'currentColor', filled = false } = {}): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? color : 'none'}" stroke="${color}" ` +
    `stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON_PATHS[name]}"/></svg>`
  )
}
