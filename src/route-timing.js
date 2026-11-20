import {clamp} from './journey.js';

const distance = (a,b) => Math.hypot(b[0]-a[0],b[1]-a[1]);
const mix = (a,b,t) => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];

function nearestDistance(leg, point, minimum) {
  let closest=Infinity, result=minimum;
  for(let index=1;index<leg.points.length;index++) {
    const start=leg.offsets[index-1],end=leg.offsets[index],length=end-start;
    if(length<=0||end<minimum)continue;
    const a=leg.points[index-1],b=leg.points[index];
    const fraction=((point[0]-a[0])*(b[0]-a[0])+(point[1]-a[1])*(b[1]-a[1]))/(length*length);
    const t=clamp(fraction,Math.max(0,(minimum-start)/length),1);
    const error=distance(point,mix(a,b,t));
    if(error<closest){closest=error;result=start+length*t;}
  }
  return result;
}

export function prepareRoute(journey,project) {
  let total=0;
  const legs=journey.legs.filter(leg=>leg.points.length>=2).map(leg=>{
    const points=leg.points.map(project);
    const start=total;
    const offsets=points.map((point,index)=>index ? (total+=distance(points[index-1],point)) : start);
    return {...leg,points,offsets,start,end:total};
  });
  const transfers=new Set(journey.transfers.map(stop=>stop.id));
  const nodes=[];
  for(const [legIndex,leg] of legs.entries()){
    let minimum=leg.start;
    for(const [index,stop] of leg.stops.entries()){
      if(index===0&&nodes.at(-1)?.id===stop.id)continue;
      const point=project(stop.point);
      const last=index===leg.stops.length-1;
      const kind=legIndex===0&&index===0?'origin':
        legIndex===legs.length-1&&last?'destination':transfers.has(stop.id)?'transfer':'intermediate';
      const at=index===0?leg.start:last?leg.end:nearestDistance(leg,point,minimum);
      nodes.push({...stop,point,kind,at});
      minimum=at;
    }
  }
  return {legs,total,nodes};
}

export function routeSlice(leg,start,end) {
  const points=[];
  for(let i=1;i<leg.points.length;i++) {
    const a=leg.offsets[i-1],b=leg.offsets[i];
    if(b<=start||b<=a)continue;
    if(a>=end)break;
    if(!points.length)points.push(mix(leg.points[i-1],leg.points[i],clamp((start-a)/(b-a))));
    points.push(mix(leg.points[i-1],leg.points[i],clamp((end-a)/(b-a))));
  }
  return points;
}
