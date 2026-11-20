import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';

const dir=new URL('../dist/',import.meta.url);
const mime={html:'text/html; charset=utf-8',svg:'image/svg+xml',css:'text/css; charset=utf-8',
  js:'text/javascript; charset=utf-8',json:'application/json; charset=utf-8'};
const port=8784;
createServer(async(request,response)=>{
  if(request.method!=='GET'||!['127.0.0.1:'+port,'localhost:'+port].includes(request.headers.host)){
    response.writeHead(403).end();return;
  }
  try {
    const url=new URL(request.url,'http://localhost');
    const path=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(!/^(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+$/i.test(path)||path.includes('..'))throw Error();
    const contentType=mime[path.split('.').at(-1)];
    if(!contentType)throw Error();
    const data=await readFile(new URL(path,dir));
    response.writeHead(200,{'Content-Type':contentType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    response.end(data);
  } catch {
    response.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});
    response.end('Not found. Run npm run build if the static bundle is missing.');
  }
}).listen(port,'127.0.0.1',()=>console.log('Refracted London · http://127.0.0.1:'+port+'/'));
