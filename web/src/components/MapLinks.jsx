import { directionsLink, exactLocation, mapsLink } from '../util.js'

/** "Map" opens the pin in Google Maps; "Directions" starts navigation (opens the Maps app on a phone). */
export default function MapLinks({ latitude, longitude, name, area, className = 'btn' }) {
  const loc = { latitude, longitude, name, area }
  const map = mapsLink(loc)
  if (!map) return null
  const exact = exactLocation(loc)
  const note = exact ? '' : ' (no coordinates on file — searches by name)'
  return (
    <span className="maplinks">
      <a className={className} href={map} target="_blank" rel="noopener noreferrer" title={`Open in Google Maps${note}`}>Map</a>
      <a className={className} href={directionsLink(loc)} target="_blank" rel="noopener noreferrer" title={`Directions in Google Maps${note}`}>Directions</a>
    </span>
  )
}
