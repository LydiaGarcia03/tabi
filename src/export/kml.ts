// KML for Organic Maps (imported as a bookmark list: pins + colored tracks).
// Also opens in Google My Maps and Google Earth.

import type { Itinerary } from './itinerary'
import { escapeXml } from './xml'

export function toKml(title: string, { points, lines }: Itinerary): string {
  const placemarks = [
    ...points.map(
      (p) => `    <Placemark>
      <name>${escapeXml(p.name)}</name>
      <description>${escapeXml(p.description)}</description>
      <styleUrl>#placemark-red</styleUrl>
      <Point><coordinates>${p.lng},${p.lat}</coordinates></Point>
    </Placemark>`,
    ),
    ...lines.map(
      (l) => `    <Placemark>
      <name>${escapeXml(l.name)}</name>
      <description>${escapeXml(l.description)}</description>
      <Style><LineStyle><color>${kmlColor(l.color)}</color><width>5</width></LineStyle></Style>
      <LineString><tessellate>1</tessellate><coordinates>${l.path.map((c) => `${c.lng},${c.lat}`).join(' ')}</coordinates></LineString>
    </Placemark>`,
    ),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(title)}</name>
    <Style id="placemark-red">
      <IconStyle><Icon><href>https://omaps.app/placemarks/placemark-red.png</href></Icon></IconStyle>
    </Style>
${placemarks.join('\n')}
  </Document>
</kml>
`
}

/** KML colors are "aabbggrr". */
function kmlColor(hex: string): string {
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)]
  return `ff${b}${g}${r}`
}
