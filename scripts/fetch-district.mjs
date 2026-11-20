import {readFile,writeFile,mkdir} from 'node:fs/promises';

const raw=new URL('../data/raw/',import.meta.url);
const root=new URL('district/',raw);
const extent=[-.133,51.4955,-.113,51.508];
const requests=await Promise.all(['dsm','dtm'].map(async id=>{
  const catalog=JSON.parse(await readFile(new URL(id+'-source.json',raw),'utf8'));
  const url=new URL(catalog.url);
  url.searchParams.delete('subset');
  url.searchParams.append('subset','Lat('+extent[1]+','+extent[3]+')');
  url.searchParams.append('subset','Long('+extent[0]+','+extent[2]+')');
  url.searchParams.set('scaleFactor','0.32');
  return {id,format:'asc',url};
}));
const split=[-.133,-.123,-.113], rows=[51.4955,51.50175,51.508];
for(let col=0;col<2;col++)for(let row=0;row<2;row++){
  const bbox=[split[col],rows[row],split[col+1],rows[row+1]].join(',');
  requests.push({id:'osm-'+col+'-'+row,format:'osm',url:new URL('https://api.openstreetmap.org/api/0.6/map?bbox='+bbox)});
}
await mkdir(root,{recursive:true});
async function acquire(group) {
  for(const {id,format,url} of group){
    const response=await fetch(url,{headers:{'User-Agent':'Refracted-London research prototype (local data preparation)'},signal:AbortSignal.timeout(40000)});
    if(!response.ok)throw Error(id+' · HTTP '+response.status);
    const body=await response.text();
    if(!(format==='asc'?body.includes('Band 0:'):body.includes('<way id=')))throw Error('Unexpected '+id+' response');
    const checkedAt=new Date().toISOString();
    await writeFile(new URL(id+'.'+format,root),body);
    await writeFile(new URL(id+'.json',root),JSON.stringify({url:url.href,checkedAt}));
    console.log(id,response.status,body.length);
  }
}
const results=await Promise.allSettled([acquire(requests.slice(0,2)),process.argv.includes('--raster-only')?Promise.resolve():acquire(requests.slice(2))]);
for(const r of results)if(r.status==='rejected'){console.error(r.reason);process.exitCode=1;}
