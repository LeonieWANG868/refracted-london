export const CUBE_HALF = 2.21;
export const GLASS_RADIUS = .20;
export const ROTATION_SECONDS = 54;
export const INITIAL_YAW = 2.35;
export const PROJECTION_START = .58;
export const PLATE_WIDTH = 4.1;
export const PLATE_HEIGHT = 2.79;
export const PLATE_YAW = .12;

export function exhibitLayout(compact) {
  return {
    center:[compact?-.55:-.86,0,0],
    source:[compact?-3.18:-4.55,-.46,compact?3.05:2.34],
    plate:[compact?1.74:4.30,compact?2.08:.70,compact?-4.88:-4.72],
    plateScale:compact?.76:1,
  };
}

export function projectionTarget(layout,[u,v]) {
  const local=[(u-.5)*PLATE_WIDTH,(v-.5)*PLATE_HEIGHT,.015].map(value=>value*layout.plateScale);
  return add(rotateY(local,PLATE_YAW),layout.plate);
}

export const rotationAt = milliseconds => INITIAL_YAW + milliseconds * Math.PI * 2 / (ROTATION_SECONDS * 1000);
export const rotateY = ([x,y,z],angle) => {
  const sin=Math.sin(angle), cos=Math.cos(angle);
  return [cos*x+sin*z,y,cos*z-sin*x];
};
export const rotateX = ([x,y,z],angle) => {
  const sin=Math.sin(angle), cos=Math.cos(angle);
  return [x,cos*y-sin*z,sin*y+cos*z];
};
const add = (a,b) => a.map((value,i)=>value+b[i]);
const sub = (a,b) => a.map((value,i)=>value-b[i]);
const interpolate = (a,b,t) => a.map((value,i)=>value+(b[i]-value)*t);
const length = (a,b) => Math.hypot(...sub(b,a));

export function glassDistance(point,half=CUBE_HALF) {
  const [x,y,z]=point.map(value=>Math.abs(value)-(half-GLASS_RADIUS));
  return Math.hypot(Math.max(0,x),Math.max(0,y),Math.max(0,z))+Math.min(0,Math.max(x,y,z))-GLASS_RADIUS;
}

export function cubeBoundary(inside, outside, half = CUBE_HALF) {
  let t = 1;
  for (let axis=0;axis<3;axis++) {
    const travel = outside[axis] - inside[axis];
    if (Math.abs(travel) < 1e-9) continue;
    const face = travel > 0 ? half : -half;
    t = Math.min(t, (face - inside[axis]) / travel);
  }
  const face=interpolate(inside,outside,t);
  if(glassDistance(face,half)<=1e-9)return face;
  let low=0,high=t;
  for(let step=0;step<23;step++){
    const middle=(low+high)/2;
    if(glassDistance(interpolate(inside,outside,middle),half)>0)high=middle;
    else low=middle;
  }
  return interpolate(inside,outside,(low+high)/2);
}

export function opticalPath({source, target, center, angle, pitch=0, guides, transferIndices}) {
  const local = point => rotateX(rotateY(sub(point,center),-angle),-pitch);
  const toWorld = point => add(rotateY(rotateX(point,pitch),angle),center);
  const start = local(source), end = local(target);
  const entry = cubeBoundary(guides[0],start);
  const exit = cubeBoundary(guides.at(-1),end);
  const points = [start,entry,...guides,exit,end];
  const distances = [0];

  for (let i=1;i<points.length;i++) {
    distances.push(distances[i-1]+length(points[i-1],points[i]));
  }
  const enterAt=distances[1], exitAt=distances.at(-2), total=distances.at(-1);
  const transfers=transferIndices.map(index=>distances[index+2]);

  function read(distance) {
    const next = distances.findIndex((value,i)=>i>0 && value>=distance);
    const i = next<0 ? distances.length-1 : next;
    const span = distances[i]-distances[i-1];
    return interpolate(points[i-1],points[i],span ? Math.min(1,Math.max(0,(distance-distances[i-1])/span)) : 0);
  }

  return {entry,exit,enterAt,exitAt,total,transfers,distances,read,toWorld};
}
