import {handle,Room,Store} from './rooms.ts';
import {html} from './shell.ts';

type IncomingLike={method?:string;url?:string;headers:Record<string,string|string[]|undefined>;body?:unknown;[Symbol.asyncIterator]?():AsyncIterator<Uint8Array>};
type ResponseLike={statusCode:number;setHeader(name:string,value:string):void;end(chunk?:string):void};

// Account-free storage: any visitor can play. Rooms live in process memory on the
// serverless instance and, when a Vercel KV / Upstash Redis REST endpoint is
// configured, are mirrored to Redis so state survives cold starts and scaling.
const memory=new Map<string,Room>();

type Rest={url:string;token:string};
function rest():Rest|undefined{
 const url=process.env.KV_REST_API_URL??process.env.UPSTASH_REDIS_REST_URL;
 const token=process.env.KV_REST_API_TOKEN??process.env.UPSTASH_REDIS_REST_TOKEN;
 return url&&token?{url,token}:undefined;
}
async function command(rest_:Rest,args:(string|number)[]):Promise<unknown>{
 const response=await fetch(rest_.url,{method:'POST',headers:{Authorization:`Bearer ${rest_.token}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
 if(!response.ok)throw new Error('Хранилище недоступно');
 return (await response.json() as {result?:unknown}).result;
}
function store():Store{
 const remote=rest();
 if(!remote)return {
  async get(code){return memory.get(code)},
  async save(room,previous){if((memory.get(room.code)?.version??0)!==previous)return false;memory.set(room.code,room);return true;},
 };
 return {
  async get(code){const raw=await command(remote,['GET',`pentachess:${code}`]);return typeof raw==='string'&&raw?JSON.parse(raw) as Room:undefined;},
  async save(room,previous){
   const key=`pentachess:${room.code}`;
   const raw=await command(remote,['GET',key]);
   const version=typeof raw==='string'&&raw?(JSON.parse(raw) as Room).version:0;
   if(version!==previous)return false;
   await command(remote,['SET',key,JSON.stringify(room)]);
   return true;
  },
 };
}
function send(res:ResponseLike,status:number,body:string,type='application/json'){res.statusCode=status;res.setHeader('Content-Type',`${type}; charset=utf-8`);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.end(body);}
export default async function handler(req:IncomingLike,res:ResponseLike){
 const host=Array.isArray(req.headers.host)?req.headers.host[0]:req.headers.host??'localhost';
 const url=new URL(req.url??'/','http://'+host);
 if(url.pathname==='/ws'){send(res,426,'Hosted transport uses authoritative HTTP synchronization','text/plain');return;}
 if(req.method!=='POST'){send(res,405,'Method not allowed','text/plain');return;}
 try{
  const origin=Array.isArray(req.headers.origin)?req.headers.origin[0]:req.headers.origin;
  if(origin&&new URL(origin).host!==host)throw new Error('Origin rejected');
  let payload:Record<string,unknown>;
  if(req.body&&typeof req.body==='object')payload=req.body as Record<string,unknown>;
  else{
   let raw=typeof req.body==='string'?req.body:'';
   if(!raw&&req[Symbol.asyncIterator])for await(const chunk of req as AsyncIterable<Uint8Array>)raw+=chunk;
   if(raw.length>8192)throw new Error('Слишком большой запрос');
   payload=JSON.parse(raw||'{}') as Record<string,unknown>;
  }
  const {action,...data}=payload;
  const session=Array.isArray(req.headers['x-session'])?req.headers['x-session'][0]:req.headers['x-session']??'';
  const result=await handle(store(),String(action),data,String(session));
  send(res,200,JSON.stringify(result));
 }catch(e){send(res,400,JSON.stringify({error:e instanceof Error?e.message:'Ошибка сервера'}));}
}
export {html};
