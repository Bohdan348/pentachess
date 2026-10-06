import {handle,Room,Store} from './rooms.ts';
import {html} from './shell.ts';
declare const __APP_JS__:string;
declare const __APP_CSS__:string;
type Statement={bind(...args:unknown[]):Statement;first<T>():Promise<T|null>;run():Promise<{meta:{changes:number}}>};
type Database={prepare(sql:string):Statement;withSession?(mode:string):Database};
export default {async fetch(request:Request,env:{DB?:Database}){
 const url=new URL(request.url);const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
 if(url.pathname==='/app.js')return new Response(__APP_JS__,{headers:{...security,'Content-Type':'text/javascript; charset=utf-8'}});
 if(url.pathname==='/app.css')return new Response(__APP_CSS__,{headers:{...security,'Content-Type':'text/css; charset=utf-8'}});
 if(url.pathname==='/ws')return new Response('Hosted transport uses authoritative HTTP synchronization',{status:426});
 if(url.pathname==='/api'){
  try {
   if(request.method!=='POST')return new Response('Method not allowed',{status:405});
   if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)throw new Error('Origin rejected');
   if(!env.DB)throw new Error('Хранилище комнат не подключено');
   const db=env.DB.withSession?.('first-primary')??env.DB;
   const store:Store={async get(code){const row=await db.prepare('SELECT payload FROM rooms WHERE code = ?').bind(code).first<{payload:string}>();return row?JSON.parse(row.payload):undefined},async save(room:Room,v:number){
    const statement=v===0?db.prepare('INSERT OR IGNORE INTO rooms (code, version, payload) VALUES (?, ?, ?)').bind(room.code,room.version,JSON.stringify(room)):db.prepare('UPDATE rooms SET version = ?, payload = ? WHERE code = ? AND version = ?').bind(room.version,JSON.stringify(room),room.code,v);
    return (await statement.run()).meta.changes===1;
   }};
   const body=await request.text();if(body.length>8192)throw new Error('Слишком большой запрос');const {action,...data}=JSON.parse(body);
   const result=await handle(store,action,data,request.headers.get('X-Session')??'');return Response.json(result,{headers:{...security,'Cache-Control':'no-store'}});
  }catch(e){return Response.json({error:e instanceof Error?e.message:'Ошибка сервера'},{status:400,headers:{...security,'Cache-Control':'no-store'}});}
 }
 return new Response(html,{headers:{...security,'Content-Type':'text/html; charset=utf-8'}});
}};
