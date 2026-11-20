import {readFile,writeFile} from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {MeshoptDecoder} from '../data/raw/landmarks/meshopt_decoder.mjs';

const root=new URL('../data/',import.meta.url);
const directory=new URL('raw/landmarks/',root);
const ids=['london-eye','palace-of-westminster','westminster-abbey'];
await MeshoptDecoder.ready;

function encode(positions) {
  const packed=Buffer.alloc(positions.length*2);
  positions.forEach((value,index)=>packed.writeInt16LE(Math.round(value*100),index*2));
  return packed.toString('base64');
}

function unpack(bytes) {
  if(bytes.readUInt32LE(0)!==0x46546c67)throw Error('Expected a GLB asset');
  const binaryHeader=20+bytes.readUInt32LE(12);
  const gltf=JSON.parse(bytes.toString('utf8',20,binaryHeader));
  const binary=bytes.subarray(binaryHeader+8);
  const views=gltf.bufferViews.map(view=>{
    const compressed=view.extensions.EXT_meshopt_compression;
    const {count,byteStride,byteOffset,byteLength,mode,filter}=compressed;
    const decoded=new Uint8Array(count*byteStride);
    MeshoptDecoder.decodeGltfBuffer(decoded,count,byteStride,binary.subarray(byteOffset,byteOffset+byteLength),mode,filter);
    return new DataView(decoded.buffer);
  });

  function accessor(index) {
    const item=gltf.accessors[index];
    const bytes=gltf.bufferViews[item.bufferView].byteStride || (item.componentType===5125?4:2);
    const view=views[item.bufferView];
    return {item,bytes,view,offset:item.byteOffset||0};
  }

  function visit(index,matrix) {
    const node=gltf.nodes[index];
    const transform=new T.Matrix4().compose(new T.Vector3(...(node.translation||[0,0,0])),
      new T.Quaternion(...(node.rotation||[0,0,0,1])),new T.Vector3(...(node.scale||[1,1,1])));
    const world=matrix.clone().multiply(transform);
    const meshes=node.mesh===undefined?[]:gltf.meshes[node.mesh].primitives.map(primitive=>{
      const source=accessor(primitive.attributes.POSITION);
      if(source.item.componentType!==5122||!source.item.normalized)throw Error('Unexpected landmark position encoding');
      const point=new T.Vector3();
      const points=[];
      for(let i=0;i<source.item.count;i++){
        const offset=source.offset+i*source.bytes;
        point.set(...[0,2,4].map(delta=>Math.max(-1,source.view.getInt16(offset+delta,true)/32767))).applyMatrix4(world);
        points.push(...point.toArray());
      }
      const sourceIndices=accessor(primitive.indices);
      const read=sourceIndices.bytes===4?'getUint32':'getUint16';
      const indices=Array.from({length:sourceIndices.item.count},(_,i)=>sourceIndices.view[read](sourceIndices.offset+i*sourceIndices.bytes,true));
      return {points,indices,material:gltf.materials[primitive.material].name};
    });
    return meshes.concat((node.children||[]).flatMap(child=>visit(child,world)));
  }

  return gltf.scenes[gltf.scene||0].nodes.flatMap(node=>visit(node,new T.Matrix4()));
}

function sample(positions,indices,active) {
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
  const ab=new T.Vector3(),ac=new T.Vector3();
  const points=[];
  let state=0x8fe353;
  const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<indices.length;i+=3){
    a.fromArray(positions,indices[i]*3);b.fromArray(positions,indices[i+1]*3);c.fromArray(positions,indices[i+2]*3);
    if(Math.max(a.y,b.y,c.y)<1)continue;
    const area=ab.subVectors(b,a).cross(ac.subVectors(c,a)).length()*.5;
    const weight=area*(active?.12:.047);
    const max=Math.min(36,Math.floor(weight)+Number(random()<weight%1));
    for(let j=0;j<max;j++){
      const root=Math.sqrt(random()),portion=random();
      points.push(a.x*(1-root)+root*(b.x*(1-portion)+c.x*portion),
        a.y*(1-root)+root*(b.y*(1-portion)+c.y*portion),
        a.z*(1-root)+root*(b.z*(1-portion)+c.z*portion));
    }
  }
  return points;
}

const landmarks=[];
for(const id of ids) {
  const metadata=JSON.parse(await readFile(new URL(id+'.json',directory),'utf8'));
  if(metadata.license!=='CC-BY-4.0')throw Error('Unexpected model licence');
  const bytes=await readFile(new URL(id+'-near.glb',directory));
  const bands={};
  for(const {points,indices,material} of unpack(bytes)){
    if(['concrete','deck','sign','red'].includes(material))continue;
    const accent=['gold','glow','light','glass','clock'].includes(material);
    const band=accent?'accent':material==='cable'?'cables':'structure';
    const target=bands[band]??={lines:[],dots:[]};
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));
    geometry.setIndex(indices);
    const edges=new T.EdgesGeometry(geometry,id==='london-eye'?27:33);
    const coordinates=edges.attributes.position.array;
    for(let i=0;i<coordinates.length;i+=6){
      if(Math.max(coordinates[i+1],coordinates[i+4])<.66)continue;
      const length=Math.hypot(coordinates[i]-coordinates[i+3],coordinates[i+1]-coordinates[i+4],coordinates[i+2]-coordinates[i+5]);
      if(length<(accent?.22:.76))continue;
      target.lines.push(...coordinates.subarray(i,i+6));
    }
    for(const value of sample(points,indices,accent))target.dots.push(value);
    edges.dispose();geometry.dispose();
  }
  landmarks.push({id,name:metadata.name,origin:metadata.origin,parts:Object.fromEntries(Object.entries(bands).map(([name,{lines,dots}])=>{
    console.log(id,name,lines.length/6+' segments',dots.length/3+' points');
    return [name,{lines:encode(lines),dots:encode(dots)}];
  }))});
}
await writeFile(new URL('landmarks.json',root),JSON.stringify({
  landmarks,
  credit:'London Eye, Westminster Abbey, and Palace of Westminster and Elizabeth Tower by Codriver / 9570-6198 Québec inc. · CC BY 4.0. Adapted as point clouds at a shared metre scale. Geographic data © OpenStreetMap contributors · ODbL 1.0.',
  sources:[
    {name:'London Eye · Codriver model and geographic placement',url:'https://3d-assets.codriver.io/?country=United%20Kingdom&asset=london-eye#library'},
    {name:'Palace of Westminster and Elizabeth Tower · Codriver model and geographic placement',url:'https://3d-assets.codriver.io/?country=United%20Kingdom&asset=palace-of-westminster#library'},
    {name:'Westminster Abbey · Codriver model and geographic placement',url:'https://3d-assets.codriver.io/?country=United%20Kingdom&asset=westminster-abbey#library'},
    {name:'Codriver model attribution and licence',url:'https://3d-assets.codriver.io/licenses.html'},
    {name:'Creative Commons Attribution 4.0',url:'https://creativecommons.org/licenses/by/4.0/'},
    {name:'OpenStreetMap geographic data · ODbL 1.0',url:'https://www.openstreetmap.org/copyright'},
    {name:'Elizabeth Tower · OpenStreetMap footprint',url:'https://www.openstreetmap.org/way/123557148'},
    {name:'London Eye · OpenStreetMap footprint',url:'https://www.openstreetmap.org/way/204068874'},
    {name:'Palace of Westminster · OpenStreetMap footprint',url:'https://www.openstreetmap.org/relation/1567699'},
    {name:'Elizabeth Tower · UK Parliament',url:'https://www.parliament.uk/about/living-heritage/building/palace/big-ben/'},
    {name:'London Eye · Operator history',url:'https://www.londoneye.com/about-us/history/'},
  ],
}));
