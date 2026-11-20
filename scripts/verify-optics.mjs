import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CUBE_HALF,ROTATION_SECONDS,exhibitLayout,projectionTarget,opticalPath,rotationAt,glassDistance} from '../src/optics.js';
import {CITY_SWEEP_MS,createCity} from '../src/city.js';
import {createBirds,flockFlight} from '../src/birds.js';
import {districtCoordinates,decodeMetres} from '../src/district.js';
import {roundedGlassGeometry} from '../src/glass.js';
import {createViewerMotion} from '../src/viewer.js';
import {journeyGuides} from '../src/beam.js';
import {geographicProjection} from '../src/projection.js';

const json=name=>readFile(new URL('../data/'+name+'.json',import.meta.url),'utf8').then(JSON.parse);
const [data,district,models]=await Promise.all(['journeys','london-district','landmarks'].map(json));
const coordinates=districtCoordinates(district);
assert.equal(district.buildings.length,district.metadata.total);
assert.ok(district.buildings.length>=600);
assert.ok(district.step.every(value=>value>=3&&value<3.4));
assert.equal(decodeMetres(district.roofPoints).length,district.metadata.surveyPoints*3);
assert.ok(district.buildings.every(({shape,height})=>shape.length>=6&&height>2));
assert.equal(district.buildings.find(building=>building.name==='Shell Centre').height,107);
assert.ok(district.buildings.some(building=>building.name==='County Hall'&&building.holes.length>0));
const [lon,lat]=district.origin;
const cityOrigin=coordinates.place([lon,lat],0);
const oneMetre=coordinates.place([lon+1/district.metres[0],lat-1/district.metres[1]],1);
assert.ok(oneMetre.every((value,axis)=>Math.abs(value-cityOrigin[axis]-coordinates.scale)<1e-9));
const city=createCity({district,landmarks:models},1.5);
assert.equal(city.group.children.length,models.landmarks.length+1);
const cityPoints=city.group.children.reduce((total,object)=>{
  assert.equal(object.isPoints,true);
  assert.equal(object.geometry.attributes.appearance.count,object.geometry.attributes.position.count);
  object.geometry.computeBoundingBox();
  const {min,max}=object.geometry.boundingBox;
  assert.ok(Math.max(-min.x,-min.z,max.x,max.z)<CUBE_HALF);
  assert.ok(min.y>-CUBE_HALF&&min.y<-CUBE_HALF+.15);
  return total+object.geometry.attributes.position.count;
},0);
assert.ok(cityPoints>25000&&cityPoints<130000);
const flock=createBirds(1.5);
assert.equal(flockFlight(0),null);
assert.equal(flockFlight(12),null);
assert.equal(flockFlight(4.3).count,2);
assert.equal(flockFlight(25.4).count,3);
assert.ok(flockFlight(4.3).vx>0 && flockFlight(25.4).vx<0);
flock.update(4300,true,false);
assert.equal(flock.group.visible,false);
flock.update(4300,false,false);
const lead=flock.group.children[0];
const lit=lead.material.uniforms.opacity.value;
const wings=lead.geometry.attributes.position.array.slice();
assert.equal(flock.group.visible,true);
flock.update(4300,false,true);
assert.ok(lead.material.uniforms.opacity.value<lit);
flock.update(4380,false,false);
assert.notDeepEqual(lead.geometry.attributes.position.array,wings);
for(let time=2500;time<54e3;time+=171){
  flock.update(time,false,false);
  if(!flock.group.visible)continue;
  for(const bird of flock.group.children.filter(item=>item.visible)){
    const padding=.26*bird.scale.x;
    assert.ok(Math.max(Math.abs(bird.position.x),Math.abs(bird.position.y),Math.abs(bird.position.z))+padding<CUBE_HALF);
  }
}
const floor=coordinates.lift(0);
city.update(0,false);
const west=city.group.position.clone();
city.update(CITY_SWEEP_MS/2,false);
const east=city.group.position.clone();
assert.ok(west.x>1&&east.x<-.85&&west.z<0&&east.z>0);
city.update(CITY_SWEEP_MS,false);
assert.ok(west.distanceTo(city.group.position)<1e-9);
city.update(CITY_SWEEP_MS/4,false);
assert.ok(city.group.scale.x>1.9);
assert.ok(Math.abs(city.group.position.y+floor*city.group.scale.y-floor)<1e-9);
for(const cloud of city.group.children){
  const {x,y,z,w}=cloud.material.uniforms.cityWindow.value;
  assert.deepEqual([x,y,z,w],[city.group.scale.x,city.group.position.x,city.group.position.z,CUBE_HALF]);
}
city.update(1750,true);
const still=city.group.position.clone();
city.update(20_000,true);
assert.ok(still.equals(city.group.position));
console.log('Verified enlarged city fit, repeating geographic sweep, fixed floor, edge clipping and intermittent, bounded bird animation.');
assert.deepEqual(models.landmarks.map(model=>model.id),['london-eye','palace-of-westminster','westminster-abbey']);
for(const model of models.landmarks){
  assert.ok(coordinates.contains(model.origin));
  assert.ok(Number.isFinite(coordinates.groundAt(model.origin)));
  for(const part of Object.values(model.parts)){
    assert.equal(Buffer.from(part.lines,'base64').byteLength%12,0);
    assert.equal(Buffer.from(part.dots,'base64').byteLength%6,0);
  }
}
assert.ok(Math.abs(rotationAt(ROTATION_SECONDS*1000)-rotationAt(0)-2*Math.PI)<1e-12);

const glass=roundedGlassGeometry();
const prism=glass.attributes.position;
for(let i=0;i<prism.count;i++){
  assert.ok(Math.abs(glassDistance([prism.getX(i),prism.getY(i),prism.getZ(i)]))<1e-6);
}
glass.dispose();
const same=(a,b)=>assert.ok(a.every((value,index)=>Math.abs(value-b[index])<1e-10));
const layouts=[exhibitLayout(false),exhibitLayout(true)];
const {firstLight}=geographicProjection(1024,696,data);
let cases=0;
for(const layout of layouts)for(const journey of data.journeys){
  const route=journeyGuides(journey,data.bounds);
  assert.equal(route.transferIndices.length,journey.transfers.length);
  const target=projectionTarget(layout,firstLight(journey));
  for(const pitch of [-.64,-.32,0,.32,.64])for(let frame=0;frame<360;frame++){
    const angle=rotationAt(ROTATION_SECONDS*1000*frame/360);
    const path=opticalPath({...layout,angle,pitch,target,...route});
    assert.ok(path.enterAt>0 && path.exitAt>path.enterAt && path.total>path.exitAt);
    assert.ok(Math.abs(glassDistance(path.entry))<1e-6);
    assert.ok(Math.abs(glassDistance(path.exit))<1e-6);
    assert.ok(glassDistance(path.read(path.enterAt-.001))>0);
    assert.ok(glassDistance(path.read(path.exitAt+.001))>0);
    same(path.toWorld(path.read(0)),layout.source);
    same(path.toWorld(path.read(path.total)),target);
    for(let cell=1;cell<20;cell++){
      const distance=path.enterAt+(path.exitAt-path.enterAt)*cell/20;
      assert.ok(glassDistance(path.read(distance))<1e-6);
    }
    cases++;
  }
}
console.log(cases+' rotating-cube traces verified across both camera layouts and all three journeys.');
const fit=()=>1.45;
const grab=speed=>{
  const motion=createViewerMotion();
  motion.begin(1);motion.drag(15,18,speed);motion.end(speed);
  return motion;
};
const fast=grab(10),slow=grab(75);
const fastFirst=fast.tick(.033,false,fit),slowFirst=slow.tick(.033,false,fit);
assert.ok(fastFirst.yaw>slowFirst.yaw&&fastFirst.pitch>slowFirst.pitch);
let state=fastFirst;
for(let i=0;i<100;i++)state=fast.tick(.033,false,fit);
assert.ok(state.pitch>0);
const before=state.yaw;
state=fast.tick(.1,false,fit);
assert.ok(Math.abs((state.yaw-before)/.1-2*Math.PI/ROTATION_SECONDS)<.0001);
fast.magnify(3);
assert.ok(fast.tick(.03,false,fit).zoom>1);
for(let i=0;i<100;i++)state=fast.tick(.033,false,fit);
assert.ok(Math.abs(state.zoom-1.45)<1e-9);
fast.magnify(.10);
for(let i=0;i<100;i++)state=fast.tick(.033,false,fit);
assert.ok(Math.abs(state.zoom-.69)<1e-9);
console.log('Verified velocity-dependent drag, preserved pitch, gradual return to auto yaw and damped zoom limits.');
console.log(district.buildings.length+' mapped building volumes, '+district.metadata.surveyPoints+' measured roof points in the source, and '+cityPoints+' rendered points across all buildings and landmarks.');
