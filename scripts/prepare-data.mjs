import {readFile,writeFile} from 'node:fs/promises';
import {distanceKm, journeyMetrics} from '../src/journey.js';

const root = new URL('../data/', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL('raw/'+name+'.json', root), 'utf8'));
const requests = [['KSX','WLO'], ['SKS','OXC'], ['WSM','LNB']];
const regions = {west:-.184, east:-.079, south:51.488, north:51.539};
const stopKey = value => '940GZZLU'+value;
const shortName = value => value.replace(/ Underground Station$/, '').replace(' St. Pancras', ' St Pancras');
const valid = ([lon,lat]) => Number.isFinite(lon) && Number.isFinite(lat)
  && lon > -1 && lon < 1 && lat > 50 && lat < 52;
const flatten = points => points.flatMap(point => [point,...flatten(point.children || [])]);

const stationSource = await read('stops');
const intermediateSource = await read('intermediate-stops');
const official = flatten([...stationSource.data,...intermediateSource.data]);
const lookup = new Map(official.map(stop => [stop.naptanId,stop]));
function verifiedStop(id) {
  const stop=lookup.get(id);
  if(!stop||!valid([stop.lon,stop.lat])) throw new Error('Missing verified TfL StopPoint '+id);
  return {id,name:shortName(stop.commonName),point:[stop.lon,stop.lat]};
}
const stops = {};
for (const code of new Set(requests.flat())) {
  const row = official.find(stop => stop.naptanId === stopKey(code));
  if (!row || !valid([row.lon,row.lat])) throw new Error('Missing exact TfL child StopPoint: '+code);
  stops[code] = {code, id:row.naptanId, name:shortName(row.commonName), lat:row.lat, lon:row.lon};
}

function projection(leg) {
  let points;
  if (typeof leg.path?.lineString === 'string') {
    const raw = JSON.parse(leg.path.lineString);
    const line = raw.map(([lat,lon]) => [lon,lat]);
    if (line.length >= 2 && line.every(valid)) points = line;
  }
  if (points) return {points, geometry:'geometry'};
  const stopPoints = [leg.departurePoint,...(leg.path?.stopPoints || []),leg.arrivalPoint];
  const verified = stopPoints.map(stop => [stop?.lon,stop?.lat]).filter(valid);
  if (verified.length >= 2) return {points:verified, geometry:'sequence'};
  return {points:[], geometry:'missing'};
}

const journeys = [];
for (const [from,to] of requests) {
  const id = from+'-'+to;
  const captured = await read(id);
  const raw = captured.data.journeys?.[0];
  const plannedDate = new URL(captured.source).searchParams.get('date');
  if (!raw || raw.startDateTime.slice(0,10).replaceAll('-','') !== plannedDate || !Number.isFinite(raw.duration)) {
    throw new Error('Unexpected TfL plan: '+id);
  }
  if (raw.legs[0]?.departurePoint?.naptanId !== stopKey(from) || raw.legs.at(-1)?.arrivalPoint?.naptanId !== stopKey(to)) {
    throw new Error('The TfL response endpoints did not match the selected stops: '+id);
  }
  const legs = raw.legs.map(leg => {
    const identity = leg.routeOptions?.[0]?.lineIdentifier;
    return {
      mode:leg.mode.id, line:identity?.id || leg.mode.id, name:identity?.name || leg.mode.name,
      minutes:leg.duration, from:shortName(leg.departurePoint.commonName), to:shortName(leg.arrivalPoint.commonName),
      ...projection(leg),
      stops:[...new Set([leg.departurePoint.naptanId,...(leg.path?.stopPoints||[]).map(stop=>stop.id),leg.arrivalPoint.naptanId])].map(verifiedStop),
    };
  });
  const transfers = [];
  let prior;
  for (const leg of legs) {
    if (leg.mode === 'walking') continue;
    if (prior && prior.line !== leg.line) transfers.push(leg.stops[0]);
    prior = leg;
  }
  if (legs.some(leg => leg.geometry === 'missing')) throw new Error('No verified projection for '+id);
  const summary = {id,from,to,minutes:raw.duration,depart:raw.startDateTime,arrive:raw.arrivalDateTime,
    checkedAt:captured.checkedAt,source:captured.source,legs,transfers};
  const metrics = journeyMetrics(summary, stops);
  console.log(JSON.stringify({id, from:stops[from], to:stops[to], duration:summary.minutes,
    km:metrics.km, ratio:metrics.ratio, separation:metrics.separation,
    legs:legs.map(leg=>[leg.line,leg.geometry,leg.points.length]), transfers:transfers.map(t=>t.name)}, null, 1));
  if (metrics.km !== distanceKm(stops[to],stops[from])) throw new Error('Distance must be symmetric');
  journeys.push(summary);
}

function clipPolygon(ring,[inside,intersect]) {
  const result=[];
  let prior=ring.at(-1);
  for (const point of ring) {
    if (inside(point) !== inside(prior)) result.push(intersect(prior,point));
    if (inside(point)) result.push(point);
    prior=point;
  }
  return result;
}
const edge = (axis, value, sign) => [
  point => (point[axis] - value) * sign >= 0,
  (a,b) => {
    const t=(value-a[axis])/(b[axis]-a[axis]);
    return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  },
];
const river = await read('river');
const clip = [edge(0,regions.west,1),edge(0,regions.east,-1),edge(1,regions.south,1),edge(1,regions.north,-1)];
const polygons=river.data.features.flatMap(feature=>feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates);
const thames=polygons.map(rings=>rings.map(points=>clip.reduce((ring,side)=>clipPolygon(ring,side),points))
  .filter(ring=>ring.length>3)).filter(rings=>rings.length);
if (!thames.length) throw new Error('Missing Thames geometry within the exhibit bounds');
const compact={bounds:regions,stops,journeys,thames,
  sources:[{name:'TfL StopPoint coordinates',url:stationSource.source,checkedAt:stationSource.checkedAt},
    {name:'TfL StopPoint · intermediate stations',url:intermediateSource.source,checkedAt:intermediateSource.checkedAt},
    ...journeys.map(item=>({name:stops[item.from].name+' to '+stops[item.to].name+' · TfL Journey Planner',url:item.source,checkedAt:item.checkedAt})),
    {name:'Greater London Authority · River Thames',url:river.source,checkedAt:river.checkedAt},
    {name:'TfL Colour Standard',url:'https://content.tfl.gov.uk/tfl-colour-standard.pdf'}]};
await writeFile(new URL('journeys.json',root), JSON.stringify(compact));
