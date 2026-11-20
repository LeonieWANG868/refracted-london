import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {journeyMetrics} from '../src/journey.js';
import {geographicProjection} from '../src/projection.js';
import {prepareRoute,routeSlice} from '../src/route-timing.js';

const data=new URL('../data/',import.meta.url);
const file=async(name)=>JSON.parse(await readFile(new URL(name+'.json',data),'utf8'));
const compact=await file('journeys');
const stationRaw=await file('raw/stops');
const flatten=points=>points.flatMap(stop=>[stop,...flatten(stop.children || [])]);
const intermediateRaw=await file('raw/intermediate-stops');
const stations=flatten([...stationRaw.data,...intermediateRaw.data]);
const {project}=geographicProjection(1024,696,compact);

function checkDistance(a,b){
  const theta=Math.PI/180;
  const point=({lat,lon})=>[Math.cos(lat*theta)*Math.cos(lon*theta),Math.cos(lat*theta)*Math.sin(lon*theta),Math.sin(lat*theta)];
  const [x,y,z]=point(a),[u,v,w]=point(b);
  const cross=Math.hypot(y*w-z*v,z*u-x*w,x*v-y*u);
  return 6371.0088*Math.atan2(cross,x*u+y*v+z*w);
}

assert.equal(compact.journeys.length,3);
for(const journey of compact.journeys){
  const capture=await file('raw/'+journey.id);
  const raw=capture.data.journeys[0];
  assert.equal(journey.minutes,raw.duration);
  assert.equal(journey.depart,raw.startDateTime);
  assert.equal(journey.source,capture.source);
  assert.equal(journey.checkedAt,capture.checkedAt);
  for(const code of [journey.from,journey.to]){
    const stop=compact.stops[code];
    const exact=stations.find(item=>item.naptanId===stop.id);
    assert.deepEqual([stop.lat,stop.lon],[exact.lat,exact.lon]);
  }
  assert.equal(raw.legs.length,journey.legs.length);
  for(const [i,leg] of journey.legs.entries()){
    const official=raw.legs[i];
    assert.equal(leg.line,official.routeOptions[0].lineIdentifier.id);
    assert.equal(leg.geometry,'geometry');
    assert.deepEqual(leg.points,JSON.parse(official.path.lineString).map(([lat,lon])=>[lon,lat]));
    assert.deepEqual(leg.stops.map(stop=>stop.id),[...new Set([official.departurePoint.naptanId,...official.path.stopPoints.map(stop=>stop.id),official.arrivalPoint.naptanId])]);
    for(const stop of leg.stops){
      const source=stations.find(row=>row.naptanId===stop.id);
      assert.deepEqual(stop.point,[source.lon,source.lat]);
    }
  }
  const plot=prepareRoute(journey,project);
  assert.equal(plot.nodes[0].kind,'origin');
  assert.equal(plot.nodes[0].at,0);
  assert.equal(plot.nodes.at(-1).kind,'destination');
  assert.equal(plot.nodes.at(-1).at,plot.total);
  assert.ok(plot.nodes.slice(1).every((node,i)=>node.at>plot.nodes[i].at));
  assert.deepEqual(plot.nodes.filter(node=>node.kind==='transfer').map(node=>node.id),journey.transfers.map(stop=>stop.id));
  for(const leg of plot.legs){
    const slice=routeSlice(leg,leg.start,leg.end);
    assert.ok(slice.every((point,i)=>point.every((coord,axis)=>Math.abs(coord-leg.points[i][axis])<1e-8)));
  }
  const {km,ratio,separation}=journeyMetrics(journey,compact.stops);
  assert.ok(Math.abs(km-checkDistance(compact.stops[journey.from],compact.stops[journey.to]))<1e-8);
  assert.equal(ratio,journey.minutes/km);
  assert.ok(separation>=0&&separation<=1);
  console.log(journey.id,km.toFixed(2)+' km',journey.minutes+' min',ratio.toFixed(2)+' min/km');
}
const near={A:{lat:51.5,lon:-.11},B:{lat:51.50002,lon:-.11}};
assert.equal(journeyMetrics({from:'A',to:'B',minutes:14},near).separation,1);
assert.ok(compact.thames[0][0].length>30);
console.log('Verified 15 exact StopPoints, all five TfL leg geometries, progressive station and transfer timing, distances and capped optical mapping.');
