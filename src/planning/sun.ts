// Sunrise and sunset, computed on the device (works offline, no API): NOAA's solar calculator equations
// (Meeus), good to about a minute.

const RAD = Math.PI / 180
/** The sun's center 50′ below the horizon: refraction and its radius (the usual "sunrise"). */
const ZENITH = 90.833

/** Sunrise and sunset in minutes after local midnight, or null when the sun doesn't rise or set (polar day/night). */
function sunEvents(date: string, lat: number, lng: number, offsetMinutes: number): { rise: number; set: number } | null {
  const [y, m, d] = date.split('-').map(Number)
  // Julian centuries since J2000, at local noon.
  const julianDay = (Date.UTC(y, m - 1, d, 12) - offsetMinutes * 60_000) / 86_400_000 + 2440587.5
  const t = (julianDay - 2451545) / 36525
  const meanLng = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360
  const anomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t)
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
  const center =
    Math.sin(anomaly * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * anomaly * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * anomaly * RAD) * 0.000289
  const omega = 125.04 - 1934.136 * t
  const apparentLng = meanLng + center - 0.00569 - 0.00478 * Math.sin(omega * RAD)
  const obliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(omega * RAD)
  const declination = Math.asin(Math.sin(obliquity * RAD) * Math.sin(apparentLng * RAD))
  const v = Math.tan((obliquity / 2) * RAD) ** 2
  const equationOfTime =
    (4 / RAD) *
    (v * Math.sin(2 * meanLng * RAD) -
      2 * eccentricity * Math.sin(anomaly * RAD) +
      4 * eccentricity * v * Math.sin(anomaly * RAD) * Math.cos(2 * meanLng * RAD) -
      0.5 * v * v * Math.sin(4 * meanLng * RAD) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * anomaly * RAD))
  const cosH = Math.cos(ZENITH * RAD) / (Math.cos(lat * RAD) * Math.cos(declination)) - Math.tan(lat * RAD) * Math.tan(declination)
  if (cosH > 1 || cosH < -1) return null
  const halfDay = (4 * Math.acos(cosH)) / RAD
  const noon = 720 - 4 * lng - equationOfTime + offsetMinutes
  const wrap = (minutes: number) => ((Math.round(minutes) % 1440) + 1440) % 1440
  return { rise: wrap(noon - halfDay), set: wrap(noon + halfDay) }
}

/** "+09:00" → 540. */
function offsetMinutes(offset: string): number {
  const match = offset.match(/([+-])(\d{2}):(\d{2})/)
  return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0
}

export interface SunTimes {
  /** Minutes after local midnight. */
  rise: number
  set: number
}

/** Sunrise and sunset at a point on a day, in the place's local time (`offset` from `utcOffsetAt`). */
export function sunTimes(point: { lat: number; lng: number }, date: string, offset: string): SunTimes | null {
  return sunEvents(date, point.lat, point.lng, offsetMinutes(offset))
}

/** "HH:mm" → minutes; before 04:00 counts as the night after (a late dinner at 00:30 comes after 23:00). */
function stopMinutes(time: string | undefined): number | undefined {
  const match = time?.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return undefined
  const minutes = Number(match[1]) * 60 + Number(match[2])
  return minutes < 240 ? minutes + 1440 : minutes
}

/**
 * Where the sunrise and sunset rows go in a day's timeline: the index of the stop each comes before (the stops'
 * count = after the last one), by the stops' planned times. Without any planned time, sunrise first and sunset last.
 */
export function sunSlots(times: (string | undefined)[], sun: SunTimes): { rise: number; set: number } {
  const minutes = times.map(stopMinutes)
  const at = (event: number) => {
    const i = minutes.findIndex((m) => m != null && m >= event)
    return i < 0 ? times.length : i
  }
  if (minutes.every((m) => m == null)) return { rise: 0, set: times.length }
  return { rise: at(sun.rise), set: at(sun.set) }
}

/** 343 → "05:43", like the planned times. */
export function clockTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}
