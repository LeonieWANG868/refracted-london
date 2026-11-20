import * as T from '../vendor/three.module.js';
import {clamp} from './journey.js';
import {cityPoint} from './city.js';
import {opticalPath,PROJECTION_START} from './optics.js';

const stepCount=160;

export function pointTexture() {
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=72;
  const context=canvas.getContext('2d');
  const halo=context.createRadialGradient(36,36,0,36,36,36);
  halo.addColorStop(0,'rgba(255,255,255,1)');
  halo.addColorStop(.11,'rgba(255,255,255,.94)');
  halo.addColorStop(.17,'rgba(255,255,255,.35)');
  halo.addColorStop(.42,'rgba(255,255,255,.08)');
  halo.addColorStop(1,'rgba(255,255,255,0)');
  context.fillStyle=halo;
  context.fillRect(0,0,72,72);
  return new T.CanvasTexture(canvas);
}

export function opticalPoint(texture,colour,size,opacity) {
  const item=new T.Sprite(new T.SpriteMaterial({
    map:texture,color:colour,opacity,transparent:true,depthWrite:false,
    blending:T.AdditiveBlending,toneMapped:false,
  }));
  item.scale.set(size,size,1);
  item.renderOrder=12;
  return item;
}

function ribbon(resolution, rgb, width) {
  const vertices=(stepCount+1)*2;
  const coordinates=new Float32Array(vertices*3);
  const tangents=new Float32Array(vertices*3);
  const strength=new Float32Array(vertices);
  const sides=new Float32Array(vertices);
  const indices=[];
  for(let i=0;i<=stepCount;i++){
    sides[i*2]=-1;
    sides[i*2+1]=1;
    if(i<stepCount)indices.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);
  }
  const geometry=new T.BufferGeometry();
  const dynamic=(data,size)=>new T.BufferAttribute(data,size).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('position',dynamic(coordinates,3));
  geometry.setAttribute('tangentPos',dynamic(tangents,3));
  geometry.setAttribute('strength',dynamic(strength,1));
  geometry.setAttribute('side',new T.BufferAttribute(sides,1));
  geometry.setIndex(indices);
  const material=new T.ShaderMaterial({
    side:T.DoubleSide,transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    uniforms:{resolution:{value:resolution}, rgb:{value:new T.Vector3(...rgb)}, width:{value:width}, power:{value:1}},
    vertexShader:'attribute vec3 tangentPos; attribute float strength; attribute float side; uniform vec2 resolution; uniform float width; varying float vEdge; varying float vStrength; void main(){vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);vec4 q=projectionMatrix*modelViewMatrix*vec4(tangentPos,1.);vec2 axis=(q.xy/q.w-p.xy/p.w)*resolution;vec2 normal=length(axis)<0.00001?vec2(0.,1.):normalize(vec2(-axis.y,axis.x));p.xy+=normal*side*width*2.0/resolution*p.w;vEdge=side;vStrength=strength;gl_Position=p;}',
    fragmentShader:'uniform vec3 rgb; uniform float power; varying float vEdge; varying float vStrength; void main(){float edge=abs(vEdge);float feather=exp(-8.5*edge*edge)*(1.-smoothstep(.72,1.,edge));gl_FragColor=vec4(rgb,feather*vStrength*power);}',
  });
  const mesh=new T.Mesh(geometry,material);
  mesh.frustumCulled=false;mesh.renderOrder=10;mesh.visible=false;
  function write(points,weights,power) {
    for(let i=0;i<points.length;i++){
      const next=points[Math.min(i+1,points.length-1)];
      const prior=points[Math.max(0,i-1)];
      const tangent=points[i].map((value,j)=>value+next[j]-prior[j]);
      coordinates.set(points[i],i*6);coordinates.set(points[i],i*6+3);
      tangents.set(tangent,i*6);tangents.set(tangent,i*6+3);
      strength[i*2]=weights[i];strength[i*2+1]=weights[i];
    }
    geometry.attributes.position.needsUpdate=true;
    geometry.attributes.tangentPos.needsUpdate=true;
    geometry.attributes.strength.needsUpdate=true;
    material.uniforms.power.value=power;
    mesh.visible=true;
  }
  return {mesh,write};
}

export function journeyGuides(journey,bounds) {
  const guides=[],transferIndices=[];
  for(const [legIndex,leg] of journey.legs.entries()){
    const step=Math.max(1,Math.ceil(leg.points.length/8));
    const choose=leg.points.filter((_,index)=>index%step===0||index===leg.points.length-1);
    for(const [index,point] of choose.entries()){
      const pitch=(legIndex+index/Math.max(1,choose.length-1))/journey.legs.length;
      const [x,y,z]=cityPoint(point,bounds,-1.61+pitch*.36);
      guides.push([clamp(x,-1.9,1.9),y,clamp(z,-1.67,1.67)]);
    }
    if(legIndex<journey.legs.length-1 && journey.transfers.some(item=>item.name===leg.to)){
      transferIndices.push(guides.length-1);
    }
  }
  return {guides,transferIndices};
}

export function createBeam(texture,resolution) {
  const group=new T.Group();
  const main=ribbon(resolution,[.84,.99,1],2.65);
  const cool=ribbon(resolution,[.28,.72,.97],1.45);
  const warm=ribbon(resolution,[.79,.52,1],1.42);
  const head=opticalPoint(texture,0xe5fcff,.43,.85);
  group.add(main.mesh,cool.mesh,warm.mesh,head);
  group.visible=false;
  let guideData, split=0;

  function setJourney(journey,metrics,bounds){
    guideData=journeyGuides(journey,bounds);
    split=metrics.separation;
  }
  function reset(){group.visible=false;guideData=null;}

  function update(progress,source,target,center,angle,pitch){
    if(!guideData||progress<=0||progress>=1){group.visible=false;return;}
    group.visible=true;
    const path=opticalPath({source,target,center,angle,pitch,...guideData});
    const shown=clamp(progress/PROJECTION_START);
    const at=shown*path.total;
    const dim=1-.86*clamp((progress-PROJECTION_START)/(1-PROJECTION_START));
    const centers=[],top=[],bottom=[],weights=[],spectral=[];
    const distances=Array.from({length:stepCount+1},(_,i)=>i*at/stepCount);
    for(const knot of path.distances.slice(1,-1)){
      if(knot<at) distances[Math.min(stepCount-1,Math.max(1,Math.round(knot*stepCount/at)))]=knot;
    }
    distances.sort((a,b)=>a-b);
    for(const [i,distance] of distances.entries()){
      const [x,y,z]=path.read(distance);
      const inGlass=distance>path.enterAt&&distance<path.exitAt;
      const local=inGlass?(distance-path.enterAt)/(path.exitAt-path.enterAt):0;
      const strength=inGlass ? Math.sin(local*Math.PI)**1.35 : 0;
      const offset=split*.098*strength;
      centers.push(path.toWorld([x,y,z]));
      top.push(path.toWorld([x,y+offset,z]));
      bottom.push(path.toWorld([x,y-offset,z]));
      weights.push(.61+.39*(i/stepCount)**1.8);
      spectral.push(strength*(.23+split*.60));
    }
    main.write(centers,weights,dim);
    cool.write(top,spectral,dim*.60);
    warm.write(bottom,spectral,dim*.59);
    const pulse=Math.max(0,...path.transfers.map(distance=>Math.max(0,1-Math.abs(at-distance)/.40)));
    head.position.fromArray(centers.at(-1));
    head.scale.setScalar(.35+.19*pulse);
    head.material.color.set(pulse>.36?0xebcdff:0xd5ffff);
    head.material.opacity=dim*(.69+.25*pulse);
  }
  return {group,setJourney,update,reset};
}
