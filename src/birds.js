import * as T from '../vendor/three.module.js';
import {clamp} from './journey.js';
import {createPointCloud,sampleSegment} from './city-points.js';

const palette=[[.55,.78,.89],[.87,.84,1]];
const beatsPerSecond=2.8;
const formation=[
  {along:0,side:0,lift:0,scale:1,phase:0},
  {along:.34,side:.32,lift:.28,scale:.80,phase:1.7},
  {along:.46,side:-.28,lift:-.24,scale:.73,phase:3.2},
];

function birdShape() {
  const points=[];
  // The beak faces positive Z, with wing hinges parallel to the body.
  for(const [z,radius] of [[-.070,.016],[-.042,.024],[-.010,.030],[.026,.026],[.058,.018],[.079,.015]]){
    for(let angle=0;angle<6;angle++){
      const turn=angle*Math.PI/3;
      points.push([radius*Math.cos(turn),.68*radius*Math.sin(turn),z]);
    }
  }
  points.push([0,.006,.106]);
  for(const side of [-1,1]){
    sampleSegment([side*.009,0,-.062],[side*.049,-.020,-.132],.020,point=>points.push(point));
    for(const [reach,leading,trailing] of [[.033,.027,-.072],[.060,.045,-.080],[.092,.049,-.085],[.124,.034,-.088],[.155,.009,-.079],[.181,-.024,-.058]]){
      const cells=Math.max(2,Math.round((leading-trailing)/.026));
      for(let cell=0;cell<cells;cell++){
        const z=leading+(trailing-leading)*(cell/(cells-1));
        points.push([side*reach,.009*Math.sin(Math.PI*cell/(cells-1)),z]);
      }
    }
    points.push([side*.202,0,-.049]);
  }
  return points;
}

export function flockFlight(seconds) {
  const period=18;
  const pass=Math.floor(seconds/period);
  const time=seconds-pass*period-(pass%2===0?2.5:5);
  const duration=4.2;
  if(time<=0||time>=duration)return null;
  const u=time/duration;
  const turn=1-2*(pass%2);
  const route=pass%3;
  return {
    count:route===1?3:2,
    time,
    x:turn*(-1.46+2.92*u),
    y:.69+.19*Math.sin(u*Math.PI)+(route===2?.18:0),
    z:turn*(.90-1.65*u)+.13*Math.sin(u*Math.PI),
    vx:2.92*turn,
    vz:-1.65*turn+.13*Math.PI*Math.cos(u*Math.PI),
    fade:Math.min(clamp(u/.15),clamp((1-u)/.17)),
  };
}

export function createBirds(pixelRatio) {
  const shape=birdShape();
  const group=new T.Group();
  group.name='Point-cloud birds';
  group.visible=false;

  const birds=formation.map(configuration=>{
    const position=shape.flat();
    const appearance=shape.flatMap(([x],index)=>{
      const outer=Math.abs(x)>.080;
      return [outer?.78:.91,outer?.72:.44,1.40+.24*(index%4)/3];
    });
    const {mesh}=createPointCloud(position,appearance,shape.flatMap(()=>[0,0]),pixelRatio,palette);
    mesh.geometry.attributes.position.setUsage(T.DynamicDrawUsage);
    mesh.geometry.boundingSphere=new T.Sphere(new T.Vector3(),.26);
    mesh.scale.setScalar(configuration.scale);
    mesh.renderOrder=1;
    group.add(mesh);
    return {mesh,configuration,positions:mesh.geometry.attributes.position};
  });

  function update(milliseconds,still,journeyPlaying) {
    const flight=still?null:flockFlight(milliseconds/1000);
    group.visible=Boolean(flight);
    if(!flight)return;
    const heading=Math.atan2(flight.vx,flight.vz);
    const forwardX=Math.sin(heading),forwardZ=Math.cos(heading);
    const dim=journeyPlaying?.39:1;
    for(const [index,{mesh,configuration,positions}] of birds.entries()){
      mesh.visible=index<flight.count;
      if(!mesh.visible)continue;
      const {along,side,lift,phase}=configuration;
      const beat=flight.time*beatsPerSecond*Math.PI*2+phase;
      mesh.position.set(
        flight.x-along*forwardX+side*forwardZ,
        flight.y+lift+.026*Math.sin(beat-.8),
        flight.z-along*forwardZ-side*forwardX,
      );
      mesh.rotation.set(.13*Math.cos(beat),heading,.18*Math.sin(flight.time*2+phase),'YXZ');
      mesh.material.uniforms.opacity.value=dim*flight.fade;
      for(const [i,[x,y,z]] of shape.entries()){
        const reach=Math.max(0,Math.abs(x)-.032);
        const flap=.82*Math.sin(beat-reach*4.5)-.13;
        positions.setXYZ(i,Math.sign(x)*(Math.abs(x)-reach+reach*Math.cos(flap)),
          y+reach*Math.sin(flap),z-.12*reach*(1-Math.cos(flap)));
      }
      positions.needsUpdate=true;
    }
  }
  return {group,update};
}
