import * as T from '../vendor/three.module.js';
import {clamp,mapPoint} from './journey.js';
import {CUBE_HALF} from './optics.js';
import {createDistrict} from './district.js';
import {addLandmarks} from './landmarks.js';

export function cityPoint(point,bounds,y=-.69) {
  const [x,z]=mapPoint(point,bounds);
  return [(x-.5)*3.95,y,(z-.5)*3.13];
}

const sweepEnds=[[-.1275,51.49944],[-.1196765,51.5033416]];
export const CITY_SWEEP_MS=52_000;

export function localCityWindow(elapsed, still, district, axes, [from,to]) {
  const amount=still?.5:.5-.5*Math.cos((elapsed%CITY_SWEEP_MS)*2*Math.PI/CITY_SWEEP_MS);
  const magnification=1.81+.14*Math.sin(Math.PI*amount);
  const target=(axis)=>from[axis]+(to[axis]-from[axis])*amount;
  const margin=extent=>Math.max(0,extent*axes.scale*.5-(CUBE_HALF-.06)/magnification);
  const xLimit=margin(district.width),zLimit=margin(district.depth);
  const x=-magnification*clamp(target(0),-xLimit,xLimit);
  const z=-magnification*clamp(target(2),-zLimit,zLimit);
  return {magnification,x,y:axes.lift(0)*(1-magnification),z};
}

export function createCity(layers,pixelRatio) {
  if(!layers.district)return {group:new T.Group(),update(){},station:()=>null};
  const {district}=layers;
  const {group,axes,update:scan}=createDistrict(district,pixelRatio);
  addLandmarks(group,layers.landmarks,axes,pixelRatio);
  const station=point=>axes.contains(point)?axes.place(point,(axes.groundAt(point)??0)+1):null;
  const ends=sweepEnds.map(point=>axes.place(point));
  const windows=group.children.map(item=>item.material.uniforms.cityWindow.value);
  function update(elapsed,still){
    const {magnification,x,y,z}=localCityWindow(elapsed,still,district,axes,ends);
    group.scale.setScalar(magnification);
    group.position.set(x,y,z);
    for(const window of windows)window.set(magnification,x,z,CUBE_HALF);
    scan(elapsed,still);
  }
  return {group,update,station};
}
