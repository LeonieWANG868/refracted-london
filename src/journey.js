const base = new URL('../data/journeys.json', import.meta.url);
const radiusKm = 6371.0088;
const radians = value => value * Math.PI / 180;
export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const colours = Object.freeze({
  jubilee: '#838d93', district: '#007d32', victoria: '#039be5', bakerloo: '#b26300',
  walking: '#aabece',
});

export function distanceKm(a, b) {
  const lat = radians(b.lat - a.lat);
  const lon = radians(b.lon - a.lon);
  const value = Math.sin(lat / 2) ** 2
    + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(lon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(clamp(value)));
}

export function journeyMetrics(journey, stops) {
  const km = distanceKm(stops[journey.from], stops[journey.to]);
  if (!(km > 0) || !Number.isFinite(journey.minutes) || journey.minutes <= 0) {
    throw new Error('The source journey is missing valid endpoints or duration.');
  }
  const ratio = journey.minutes / km;
  const separation = clamp((journey.minutes / Math.max(.75, km) - 1) / 5);
  return {km, ratio, separation, durationMs: 3700 + clamp(journey.minutes, 5, 32) * 103};
}

export async function readData() {
  const response = await fetch(base);
  if (!response.ok) throw new Error('The verified TfL snapshot could not be loaded.');
  const result = await response.json();
  if (!result.stops || result.journeys?.length < 3) throw new Error('The TfL snapshot is incomplete.');
  return result;
}

export function mapPoint([lon,lat], bounds) {
  return [(lon - bounds.west) / (bounds.east - bounds.west),
    (bounds.north - lat) / (bounds.north - bounds.south)];
}

export const stopPoint = stop => [stop.lon, stop.lat];
export const londonDate = value => new Intl.DateTimeFormat('en-GB', {
  timeZone:'Europe/London', day:'numeric', month:'short', year:'numeric',
}).format(new Date(value));
