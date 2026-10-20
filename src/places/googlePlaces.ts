// Place search through Places API (New) in the Maps JavaScript API. Every
// call here costs one request (daily quota after the free trial: 100), so
// they only run on an explicit user action and never per keystroke.

/** Only the fields we store: id, name, address, coordinates. */
const FIELDS = ['id', 'displayName', 'formattedAddress', 'location']

export interface PlaceResult {
  googlePlaceId: string
  name: string
  address?: string
  lat: number
  lng: number
}

export async function searchPlaces(query: string, bias?: google.maps.LatLngBounds | null): Promise<PlaceResult[]> {
  const { Place } = await placesLibrary()
  const { places } = await Place.searchByText({
    textQuery: query,
    fields: FIELDS,
    maxResultCount: 8,
    language: 'en',
    locationBias: bias ?? undefined,
  })
  return places.map(toResult).filter((p) => p != null)
}

/** Details of a place tapped on the map. */
export async function fetchPlace(googlePlaceId: string): Promise<PlaceResult | null> {
  const { Place } = await placesLibrary()
  const { place } = await new Place({ id: googlePlaceId }).fetchFields({ fields: FIELDS.filter((f) => f !== 'id') })
  return toResult(place)
}

async function placesLibrary(): Promise<google.maps.PlacesLibrary> {
  if (typeof google === 'undefined' || !google.maps?.importLibrary) {
    throw new Error('Google Maps is not loaded (is the API key set?).')
  }
  return (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary
}

function toResult(place: google.maps.places.Place): PlaceResult | null {
  if (!place.location) return null
  return {
    googlePlaceId: place.id,
    name: place.displayName ?? 'Unnamed place',
    address: place.formattedAddress ?? undefined,
    lat: place.location.lat(),
    lng: place.location.lng(),
  }
}
