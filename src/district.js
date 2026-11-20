import * as T from '../vendor/three.module.js';
import {createPointCloud,sampleSegment} from './city-points.js';
import {CUBE_HALF} from './optics.js';

const datum=-CUBE_HALF+.060;
const palette=[[.35,.79,.87],[.71,.77,1]];

export const decodeMetres=encoded=>{
  const bytes=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));
  const view=new DataView(bytes.buffer);
  return Float32Array.from({length:bytes.length/2},(_,index)=>view.getInt16(index*2,true)/10);
};

export function districtCoordinates(district) {
  const {origin,metres,extent,terrain,step,width,depth}=district;
  const scale=(CUBE_HALF*2-.12)/Math.max(width,depth);
  const samples=decodeMetres(terrain.samples);
  const horizontal=([lon,lat])=>[(lon-origin[0])*metres[0],(origin[1]-lat)*metres[1]];
  const lift=elevation=>datum+elevation*scale;
  function groundAt(point) {
    const [x,z]=horizontal(point);
    const column=Math.round((x-terrain.west)/step[0]),row=Math.round((z-terrain.north)/step[1]);
    if(column<0||row<0||column>=terrain.cols||row>=terrain.rows)return null;
    const altitude=samples[row*terrain.cols+column];
    return altitude<=-3000?null:altitude;
  }
  function place(point,elevation=groundAt(point)) {
    const [x,z]=horizontal(point);
    return [x*scale,lift(elevation??0),z*scale];
  }
  const contains=([lon,lat])=>lon>=extent.west&&lon<=extent.east&&lat>=extent.south&&lat<=extent.north;
  return {scale,lift,groundAt,place,contains};
}

export function createDistrict(district,pixelRatio) {
  const axes=districtCoordinates(district);
  const {scale,lift}=axes;
  const dots=[],appearance=[],facings=[];

  function add([x,y,z],brightness,tint,size,normal) {
    dots.push(x*scale,lift(y),z*scale);
    appearance.push(brightness,tint,size);
    facings.push(...normal);
  }

  const neutral=[0,0];
  function ringPoints(ring,grade,height,character,inner=false) {
    const top=grade+height;
    const winding=Math.sign(ring.reduce((sum,x,i)=>{
      if(i%2)return sum;
      const next=(i+2)%ring.length;
      return sum+x*ring[next+1]-ring[i+1]*ring[next];
    },0));
    for(let i=0;i<ring.length;i+=2){
      const next=(i+2)%ring.length;
      const x=ring[i],z=ring[i+1],dx=ring[next]-x,dz=ring[next+1]-z;
      const width=Math.hypot(dx,dz);
      if(width<.12)continue;
      const orientation=inner?-winding:winding;
      const facing=[orientation*dz/width,-orientation*dx/width];

      sampleSegment([x,top,z],[x+dx,top,z+dz],6.3,
        point=>add(point,.84,.38+character*.3,1.28,neutral));
      sampleSegment([x,grade,z],[x,top,z],5.6,
        point=>add(point,.73,.29,1.17,facing));

      const columns=Math.max(1,Math.round(width/7.3));
      const rows=Math.max(1,Math.round(height/6.2));
      for(let column=0;column<columns;column++)for(let row=0;row<rows;row++){
        const variation=((i*11+column*19+row*17)%29)/28;
        const t=(column+.20+.56*variation)/columns;
        const altitude=grade+height*(row+.26+.50*((column*7+row*23+i)%17)/16)/rows;
        add([x+dx*t,altitude,z+dz*t],.58+.30*variation,.12+character*.34,1.02+.28*variation,facing);
      }
    }
  }

  for(const building of district.buildings){
    const {grade,height}=building;
    const character=(Number(building.id)%23)/22;
    ringPoints(building.shape,grade,height,character);
    for(const courtyard of building.holes)ringPoints(courtyard,grade,height,character,true);
  }
  const measured=decodeMetres(district.roofPoints);
  for(let i=0;i<measured.length;i+=3){
    const hash=Math.imul(Math.round(measured[i]*10),0x45d9f3b)^Math.imul(Math.round(measured[i+2]*10),0x27d4eb2d);
    if((hash>>>0)%100>=57)continue;
    const variation=((hash>>>16)%17)/16;
    add([measured[i],measured[i+1],measured[i+2]],.54+.40*variation,.43+.32*variation,.94+.48*variation,neutral);
  }

  const cloud=createPointCloud(dots,appearance,facings,pixelRatio,palette);
  const group=new T.Group();
  group.add(cloud.mesh);
  const update=(milliseconds,still)=>{
    cloud.scan.value=still?-5:-2.25+4.50*((milliseconds%15300)/15300);
  };
  return {group,axes,update};
}
