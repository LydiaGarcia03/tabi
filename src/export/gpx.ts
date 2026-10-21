// GPX 1.1: places as waypoints, drawn segments as tracks. For apps that
// don't read KML (GPX has no standard line colors).

import type { Itinerary } from './itinerary'
import { escapeXml } from './xml'

export function toGpx(title: string, { points, lines }: Itinerary): string {
  const waypoints = points.map(
    (p) => `  <wpt lat="${p.lat}" lon="${p.lng}">
    <name>${escapeXml(p.name)}</name>
    <desc>${escapeXml(p.description)}</desc>
  </wpt>`,
  )
  const tracks = lines.map(
    (l) => `  <trk>
    <name>${escapeXml(l.name)}</name>
    <desc>${escapeXml(l.description)}</desc>
    <trkseg>
${l.path.map((c) => `      <trkpt lat="${c.lat}" lon="${c.lng}"/>`).join('\n')}
    </trkseg>
  </trk>`,
  )
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Tabi" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${escapeXml(title)}</name></metadata>
${[...waypoints, ...tracks].join('\n')}
</gpx>
`
}
