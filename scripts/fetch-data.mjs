import {readFile,writeFile} from 'node:fs/promises';

const requests=['stops','KSX-WLO','SKS-OXC','WSM-LNB','river'];
const directory=new URL('../data/raw/',import.meta.url);
const date=process.argv[2];
if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')){
  throw new Error('Usage: node scripts/fetch-data.mjs YYYY-MM-DD');
}

const snapshots=[];
for(const id of requests){
  const file=new URL(id+'.json',directory);
  const original=JSON.parse(await readFile(file,'utf8'));
  const source=new URL(original.source);
  if(source.pathname.includes('/Journey/'))source.searchParams.set('date',date.replaceAll('-',''));
  const response=await fetch(source,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(16000)});
  if(!response.ok)throw new Error(id+' · HTTP '+response.status+'. The existing snapshots were preserved.');
  const data=await response.json();
  if(!data.journeys?.length&&!data.features?.length&&!Array.isArray(data)) {
    throw new Error(id+' did not return the expected data. The existing snapshots were preserved.');
  }
  snapshots.push({file,record:{source:source.href,checkedAt:new Date().toISOString(),data}});
}

const flatten=items=>items.flatMap(stop=>[stop,...flatten(stop.children||[])]);
const known=new Set(flatten(snapshots[0].record.data).map(stop=>stop.naptanId));
const needed=new Set(snapshots.slice(1,4).flatMap(({record})=>record.data.journeys[0].legs.flatMap(leg=>(leg.path?.stopPoints||[]).map(stop=>stop.id))).filter(id=>!known.has(id)));
if(needed.size){
  const source='https://api.tfl.gov.uk/StopPoint/'+[...needed].join(',');
  const response=await fetch(source,{signal:AbortSignal.timeout(16000)});
  if(!response.ok)throw Error('Intermediate StopPoint · HTTP '+response.status);
  const data=await response.json();
  const verified=new Set(flatten(data).filter(stop=>Number.isFinite(stop.lon)&&Number.isFinite(stop.lat)).map(stop=>stop.naptanId));
  if([...needed].some(id=>!verified.has(id)))throw Error('Incomplete TfL intermediate station response');
  snapshots.push({file:new URL('intermediate-stops.json',directory),record:{source,checkedAt:new Date().toISOString(),data}});
}

for(const {file,record} of snapshots){
  await writeFile(file,JSON.stringify(record));
  console.log('Verified acquisition:',file.pathname.split('/').at(-1));
}
console.log('Run npm run prepare, npm test and npm run build to publish the next validated snapshot.');
