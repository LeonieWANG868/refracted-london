import {readFile,readdir,writeFile} from 'node:fs/promises';

const folder=new URL('../data/raw/district/',import.meta.url);
const extent={west:-.133,east:-.113,south:51.4955,north:51.508};
const lat=(extent.north+extent.south)/2*Math.PI/180;
const metres=[111320*Math.cos(lat),110574];
const width=(extent.east-extent.west)*metres[0],depth=(extent.north-extent.south)*metres[1];
const origin=[(extent.west+extent.east)/2,(extent.south+extent.north)/2];
const local=(lon,latitude)=>[(lon-origin[0])*metres[0],(origin[1]-latitude)*metres[1]];
const round=value=>Math.round(value*10)/10;
const load=name=>readFile(new URL(name,folder),'utf8');
const source=async name=>JSON.parse(await load(name+'.json'));

function readRaster(text) {
  const match=text.match(/GridEnvelope2D\[(-?\d+)\.\.(-?\d+), (-?\d+)\.\.(-?\d+)\]/);
  if(!match)throw Error('Unrecognised district raster geometry');
  const [minX,maxX,minY,maxY]=match.slice(1).map(Number);
  const cols=maxX-minX+1,rows=maxY-minY+1;
  const [,band]=text.split(/Band 0:\s*/);
  const transform=Object.fromEntries([...text.matchAll(/PARAMETER\["(elt_[0-9]_[0-9])", ([-\d.Ee+]+)\]/g)].map(([,key,value])=>[key,Number(value)]));
  const dx=transform.elt_0_0,dy=transform.elt_1_1;
  const grid={cols,rows,x0:transform.elt_0_2+minX*dx,y0:transform.elt_1_2+minY*dy,dx,dy};
  const values=Float32Array.from(band.trim().split(/\s+/),Number);
  if(cols<350||rows<350||values.length!==cols*rows)throw Error('Expected the detailed district raster');
  return {grid,values};
}

const [surface,terrain]=await Promise.all(['dsm.asc','dtm.asc'].map(async name=>readRaster(await load(name))));
const grid=surface.grid;
if(JSON.stringify(grid)!==JSON.stringify(terrain.grid))throw Error('District rasters do not align');
const [west,north]=local(grid.x0,grid.y0);
const step=[grid.dx*metres[0],-grid.dy*metres[1]];
const elevations=new Int16Array(grid.cols*grid.rows);
for(let i=0;i<elevations.length;i++){
  const height=terrain.values[i];
  elevations[i]=Math.abs(height)<420?Math.round(height*10):-32768;
}

const osmNames=(await readdir(folder)).filter(name=>/^osm-\d-\d\.osm$/.test(name));
if(osmNames.length!==4)throw Error('Expected four matching OpenStreetMap extracts');
const nodes=new Map(),ways=new Map(),relations=new Map();
const attr=(tag,key)=>tag.match(new RegExp('\\b'+key+'="([^"]+)"'))?.[1];
const tags=raw=>Object.fromEntries([...raw.matchAll(/<tag k="([^"]+)" v="([^"]*)"/g)].map(([,key,value])=>[key,value]));
for(const name of osmNames) {
  const xml=await load(name);
  for(const [tag] of xml.matchAll(/<node\b[^>]*>/g)){
    const id=attr(tag,'id'),lon=+attr(tag,'lon'),lat=+attr(tag,'lat');
    if(Number.isFinite(lon)&&Number.isFinite(lat))nodes.set(id,local(lon,lat));
  }
  for(const [,id,body] of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)){
    if(!ways.has(id)) ways.set(id,{tags:tags(body),refs:[...body.matchAll(/<nd ref="(\d+)"\//g)].map(match=>match[1])});
  }
  for(const [,id,body] of xml.matchAll(/<relation id="(\d+)"[^>]*>([\s\S]*?)<\/relation>/g)){
    const labels=tags(body);
    if(labels.type==='multipolygon'&&labels.building&&labels.building!=='no')
      relations.set(id,{tags:labels,members:[...body.matchAll(/<member type="way" ref="(\d+)" role="(outer|inner)"/g)].map(match=>match.slice(1))});
  }
}

function join(paths) {
  const pending=[...paths];
  const closed=[];
  while(pending.length){
    let loop=pending.shift();
    while(loop.at(-1)!==loop[0]){
      const index=pending.findIndex(path=>path[0]===loop.at(-1)||path.at(-1)===loop.at(-1));
      if(index<0)break;
      let next=pending.splice(index,1)[0];
      if(next.at(-1)===loop.at(-1))next=[...next].reverse();
      loop=loop.concat(next.slice(1));
    }
    if(loop.length>=4&&loop[0]===loop.at(-1))closed.push(loop.slice(0,-1));
  }
  return closed;
}

function ring(path) {
  const coordinates=path.map(id=>nodes.get(id));
  if(coordinates.some(point=>!point))return null;
  return coordinates;
}

function inside(x,z,loop){
  let match=false;
  for(let i=0,j=loop.length-1;i<loop.length;j=i++){
    const [a,b]=loop[i],[c,d]=loop[j];
    if((b>z)!==(d>z)&&x<(c-a)*(z-b)/(d-b)+a)match=!match;
  }
  return match;
}

function area(loop){
  return Math.abs(loop.reduce((sum,[x,z],index)=>{
    const [a,b]=loop[(index+1)%loop.length];
    return sum+x*b-z*a;
  },0))/2;
}

const models=new Set(['123557148','204068874','364313092','1567699']);
const relationWays=new Set();
const footprints=[];
for(const [id,relation] of relations) {
  const paths=role=>join(relation.members.filter(item=>item[1]===role).map(item=>ways.get(item[0])?.refs).filter(Boolean)).map(ring).filter(Boolean);
  const outer=paths('outer'),inner=paths('inner');
  if(!outer.length)continue;
  relation.members.forEach(([id])=>relationWays.add(id));
  for(const shape of outer)footprints.push({id,shape,holes:inner.filter(loop=>inside(...loop[0],shape)),tags:relation.tags});
}
for(const [id,way] of ways) {
  if(relationWays.has(id)||!way.tags.building||way.tags.building==='no'||way.refs.length<4||way.refs[0]!==way.refs.at(-1))continue;
  const shape=ring(way.refs.slice(0,-1));
  if(shape)footprints.push({id,shape,holes:[],tags:way.tags});
}
const landmarkAreas=footprints.filter(row=>models.has(row.id));
const buildings=[];
const survey=[];
const used=new Set();
const verifiedHeight=value=>/^\d+(?:\.\d+)?(?: ?m)?$/.test(value||'')?parseFloat(value):null;
const quantile=(values,q)=>values[Math.floor(q*(values.length-1))];
let omitted=0;
for(const building of footprints){
  const {id,shape,holes,tags}=building;
  if(models.has(id)||area(shape)<14)continue;
  const xs=shape.map(point=>point[0]),zs=shape.map(point=>point[1]);
  const min=[Math.min(...xs),Math.min(...zs)],max=[Math.max(...xs),Math.max(...zs)];
  if(min[0]<-width/2||max[0]>width/2||min[1]<-depth/2||max[1]>depth/2)continue;
  const middle=min.map((value,i)=>(value+max[i])/2);
  if(landmarkAreas.some(model=>inside(...middle,model.shape)&&!model.holes.some(hole=>inside(...middle,hole))))continue;

  const ground=[], roofs=[], samples=[];
  const ix=[Math.max(0,Math.ceil((min[0]-west)/step[0])),Math.min(grid.cols-1,Math.floor((max[0]-west)/step[0]))];
  const iz=[Math.max(0,Math.ceil((min[1]-north)/step[1])),Math.min(grid.rows-1,Math.floor((max[1]-north)/step[1]))];
  for(let r=iz[0];r<=iz[1];r++)for(let c=ix[0];c<=ix[1];c++){
    const x=west+c*step[0],z=north+r*step[1],i=r*grid.cols+c;
    const base=terrain.values[i],roof=surface.values[i],height=roof-base;
    if(!inside(x,z,shape)||holes.some(hole=>inside(x,z,hole))||Math.abs(base)>420||Math.abs(roof)>420)continue;
    ground.push(base);
    if(height>=2.3){roofs.push(height);samples.push([i,x,roof,z,height]);}
  }
  const mapped=verifiedHeight(tags.height);
  if(!ground.length||(roofs.length<2&&!(mapped>2.3))){omitted++;continue;}
  ground.sort((a,b)=>a-b);roofs.sort((a,b)=>a-b);
  const measured=roofs.length?quantile(roofs,.48):mapped;
  const documented=mapped>2.3&&(roofs.length<2||Math.abs(measured-mapped)<Math.max(3,measured*.26));
  const height=documented?mapped:measured;
  const grade=quantile(ground,.50);
  const name=tags.name?.replaceAll('&amp;','&');
  buildings.push({id,shape:shape.flat().map(round),holes:holes.map(ring=>ring.flat().map(round)),grade:round(grade),height:round(height),
    ...(name?{name}:{}),...(documented?{mapped:true}:{})});
  const high=roofs.length?Math.max(height+3,quantile(roofs,.96)+3):height+3;
  for(const [index,x,roof,z,h] of samples){
    if(used.has(index)||h<height-3||h>high)continue;
    used.add(index);survey.push(round(x),round(roof),round(z));
  }
}
if(buildings.length<250||survey.length<10000)throw Error('District coverage is unexpectedly sparse');
const encode=values=>{
  const bytes=Buffer.alloc(values.length*2);
  for(let i=0;i<values.length;i++)bytes.writeInt16LE(values[i],i*2);
  return bytes.toString('base64');
};
const raster=await Promise.all(['dsm','dtm'].map(source));
const osm=await Promise.all(osmNames.map(name=>source(name.slice(0,-4))));
const metadata={
  total:buildings.length,omitted,surveyPoints:survey.length/3,
  credit:'© Environment Agency copyright and/or database right 2022. Open Government Licence. Building footprints © OpenStreetMap contributors · ODbL 1.0.',
  sources:[
    {name:'Environment Agency 2022 LiDAR · surface model (OGL)',url:'https://www.data.gov.uk/dataset/cf3f1137-c12b-44a1-a835-e80fe4a60b92/lidar-composite-dsm-2022-1m',checkedAt:raster[0].checkedAt},
    {name:'Environment Agency 2022 LiDAR · terrain model (OGL)',url:'https://www.data.gov.uk/dataset/01b3ee39-da3f-47b6-83da-dc98e73a461f/lidar-composite-digital-terrain-model-dtm-1m',checkedAt:raster[1].checkedAt},
    {name:'OpenStreetMap footprint attribution · ODbL 1.0',url:'https://www.openstreetmap.org/copyright',checkedAt:osm[0].checkedAt},
    ...osm.map((item,index)=>({name:'OpenStreetMap · footprint extract '+(index+1),...item})),
  ],
  raster,osm,
};
const district={extent,origin,metres,width,depth,step,metadata,buildings,
  terrain:{cols:grid.cols,rows:grid.rows,west,north,samples:encode(elevations)},roofPoints:encode(survey.map(value=>Math.round(value*10)))};
console.log('District',JSON.stringify({grid:[grid.cols,grid.rows],step,buildings:buildings.length,omitted,survey:survey.length/3,
  named:buildings.filter(row=>['Shell Centre','County Hall','National Theatre'].includes(row.name)).map(x=>[x.name,x.height])}));
await writeFile(new URL('../data/london-district.json',import.meta.url),JSON.stringify(district));
