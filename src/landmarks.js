import {createPointCloud,sampleSegment} from './city-points.js';

const palettes={
  'london-eye':[[.50,.78,1],[.87,.78,1]],
  'palace-of-westminster':[[.42,.81,.89],[.80,.87,1]],
  'westminster-abbey':[[.44,.76,.88],[.76,.81,1]],
};

function sourceMetres(encoded) {
  const bytes=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));
  const view=new DataView(bytes.buffer);
  return Float32Array.from({length:bytes.length/2},(_,index)=>view.getInt16(index*2,true)*.01);
}

export function addLandmarks(group,bundle,axes,pixelRatio) {
  if(!bundle)return;
  for(const landmark of bundle.landmarks){
    const center=axes.place(landmark.origin);
    const positions=[],appearance=[],facings=[];
    const seen=new Set();

    function add(point,part,edge) {
      const key=point.map(value=>Math.round(value/3.25)).join(',');
      if(seen.has(key))return;
      seen.add(key);
      positions.push(...point.map((value,index)=>center[index]+value*axes.scale));
      const accent=part==='accent',cable=part==='cables';
      appearance.push(accent?.92:cable?.32:edge?.65:.38,accent?.88:edge?.32:.23,accent?1.32:edge?1.09:1.0);
      facings.push(0,0);
    }

    const parts=Object.entries(landmark.parts);
    for(const [part,encoded] of parts.sort(([a],[b])=>Number(b==='accent')-Number(a==='accent'))){
      const accent=part==='accent';
      const edges=sourceMetres(encoded.lines);
      for(let i=0;i<edges.length;i+=6){
        sampleSegment([...edges.subarray(i,i+3)],[...edges.subarray(i+3,i+6)],accent?2.9:part==='cables'?5.9:4.1,
          point=>add(point,part,true));
      }
      const surfaces=sourceMetres(encoded.dots);
      for(let i=0;i<surfaces.length;i+=3)add([...surfaces.subarray(i,i+3)],part,false);
    }
    const {mesh}=createPointCloud(positions,appearance,facings,pixelRatio,palettes[landmark.id]);
    mesh.renderOrder=1;
    group.add(mesh);
  }
}
