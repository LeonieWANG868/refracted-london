import {colours, mapPoint, stopPoint, clamp} from './journey.js';
import {prepareRoute,routeSlice} from './route-timing.js';

function polyline(context, points) {
  context.beginPath();
  points.forEach(([x,y],index)=>index ? context.lineTo(x,y) : context.moveTo(x,y));
}

export function geographicProjection(width,height,data) {
  const padding = 66;
  const mapped = [...Object.values(data.stops).map(stopPoint),
    ...data.journeys.flatMap(journey=>journey.legs.flatMap(leg=>[...leg.points,...leg.stops.map(stop=>stop.point)]))];
  const longitude=mapped.map(point=>point[0]), latitude=mapped.map(point=>point[1]);
  const bounds={
    west:Math.min(...longitude)-.006, east:Math.max(...longitude)+.006,
    south:Math.min(...latitude)-.004, north:Math.max(...latitude)+.004,
  };
  const geographicAspect = (bounds.east-bounds.west) * Math.cos((bounds.north+bounds.south)/2*Math.PI/180)
    /(bounds.north-bounds.south);
  const mapHeight = Math.min(height-2*padding,(width-2*padding)/geographicAspect);
  const mapWidth = mapHeight*geographicAspect;
  const project = point => {
    const [x,y] = mapPoint(point,bounds);
    return [(width-mapWidth)/2+x*mapWidth,(height-mapHeight)/2+y*mapHeight];
  };
  function firstLight(journey) {
    const [x,y]=project(stopPoint(data.stops[journey.from]));
    return [x/width,1-y/height];
  }
  return {project,firstLight};
}

export function createProjection(canvas, data) {
  const context=canvas.getContext('2d',{alpha:false});
  const {width,height}=canvas;
  const {project,firstLight}=geographicProjection(width,height,data);
  const layers=new Map(data.journeys.map(journey=>[journey.id,prepareRoute(journey,project)]));
  const land=document.createElement('canvas');
  land.width=width;land.height=height;
  const landContext=land.getContext('2d');
  landContext.beginPath();
  landContext.rect(23,23,width-46,height-46);
  landContext.clip();
  landContext.strokeStyle='#111f24';
  landContext.lineWidth=1.25;
  for(const polygon of data.thames)for(const ring of polygon){
    polyline(landContext,ring.map(project));
    landContext.closePath();
    landContext.stroke();
  }
  const base=document.createElement('canvas');
  base.width=width;base.height=height;
  const backing=base.getContext('2d',{alpha:false});

  function drawNode(surface,node,bright,active) {
    const endpoint=node.kind==='origin'||node.kind==='destination';
    const radius=endpoint?6.3:node.kind==='transfer'?5.5:4.1;
    surface.globalAlpha=bright;
    surface.beginPath();surface.arc(...node.point,active?radius:radius*.78,0,Math.PI*2);
    surface.fillStyle=active&&endpoint?'#c6eff8':'#050e14';
    surface.fill();
    surface.lineWidth=endpoint?2.15:1.6;
    surface.strokeStyle=node.kind==='transfer'?'#ecd1ff':'#d9f4ff';
    surface.stroke();
    surface.globalAlpha=1;
  }

  function route(surface,journey,progress,active,age=0) {
    const {legs,total,nodes}=layers.get(journey.id);
    const amount=total*clamp(progress);
    let tip;
    const brightness=active?1:Math.max(.20,.57*Math.pow(.67,age));
    surface.lineCap='round';surface.lineJoin='round';
    for(const leg of legs) {
      if(leg.start>=amount)break;
      const points=progress===1?leg.points:routeSlice(leg,leg.start,amount);
      if(points.length<2)continue;
      tip=points.at(-1);
      const colour=colours[leg.line]||colours.walking;
      surface.setLineDash(leg.mode==='walking'||leg.geometry==='sequence'?[9,8]:[]);
      surface.globalAlpha=brightness;
      surface.shadowColor=active?'#a1d9ea':'transparent';
      surface.shadowBlur=active?7:0;
      surface.strokeStyle=active?'#badde6':'#78939d';
      surface.lineWidth=active?5.4:5.8;
      polyline(surface,points);surface.stroke();
      surface.shadowBlur=0;
      surface.strokeStyle=colour;surface.lineWidth=active?3.4:2.2;surface.stroke();
    }
    surface.setLineDash([]);surface.shadowBlur=0;surface.globalAlpha=1;
    if(active&&tip&&progress<1){
      surface.fillStyle='#eafaff';surface.beginPath();surface.arc(...tip,3.4,0,Math.PI*2);surface.fill();
    }
    for(const node of nodes)if(node.at<=amount)drawNode(surface,node,brightness,active);
  }

  function pulse(point,age,colour) {
    const phase=age/.64;
    if(phase<0||phase>=1)return;
    context.globalAlpha=(1-phase)*.62;
    context.beginPath();context.arc(...point,6+8*phase,0,Math.PI*2);
    context.strokeStyle=colour;context.lineWidth=1.45;context.stroke();
    context.globalAlpha=1;
  }

  function flow(active,elapsed) {
    const {legs,total}=layers.get(active.id);
    const cycle=(elapsed*.22)%1;
    const head=cycle*(total+22);
    for(const leg of legs) {
      const points=routeSlice(leg,head-22,head);
      if(points.length<2)continue;
      const first=points[0],last=points.at(-1);
      if(Math.hypot(last[0]-first[0],last[1]-first[1])<.1)continue;
      const highlight=context.createLinearGradient(...first,...last);
      highlight.addColorStop(0,'rgba(196, 239, 255, 0)');
      highlight.addColorStop(1,'rgba(222, 246, 255, .63)');
      context.strokeStyle=highlight;
      context.lineWidth=3.5;
      context.lineCap='round';
      polyline(context,points);context.stroke();
    }
  }

  let lastBase='',lastActive,visibleNodes=new Map();
  function draw(history,active,progress,now=0,age=0,animate=true) {
    if(lastActive!==active||progress===0){visibleNodes=new Map();lastActive=active;}
    const previous=history.filter(journey=>journey.id!==active?.id);
    const complete=Boolean(active&&progress===1);
    const key=JSON.stringify([previous.map(journey=>journey.id),complete?active.id:null,Boolean(history.length||progress>0)]);
    if(lastBase!==key){
      backing.fillStyle='#000000';backing.fillRect(0,0,width,height);
      if(history.length||progress>0)backing.drawImage(land,0,0);
      previous.forEach((journey,index)=>route(backing,journey,1,false,previous.length-index-1));
      if(complete)route(backing,active,1,true);
      lastBase=key;
    }
    context.drawImage(base,0,0);
    if(!active||progress===0)return;
    if(!complete)route(context,active,progress,true);
    if(!animate)return;

    const {nodes,total}=layers.get(active.id);
    for(const node of nodes) {
      if(node.at>total*progress||(node.kind!=='transfer'&&node.kind!=='destination'))continue;
      if(!visibleNodes.has(node))visibleNodes.set(node,now);
      pulse(node.point,now-visibleNodes.get(node),node.kind==='transfer'?'#d6adff':'#b7e9f4');
    }
    if(complete)flow(active,age);
  }
  return {draw,canvas,firstLight};
}
