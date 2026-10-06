import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {WebSocketServer,WebSocket} from 'ws';
import {handle,Room,Store,view} from './rooms.ts';
import {html} from './shell.ts';
const rooms=new Map<string,Room>();await mkdir('.data',{recursive:true});
try {for(const r of JSON.parse(await readFile('.data/rooms.json','utf8')))rooms.set(r.code,r);}catch{}
let saving=Promise.resolve();
const persist=()=>{const payload=JSON.stringify([...rooms.values()]);saving=saving.then(async()=>{await writeFile('.data/rooms.tmp',payload);await rename('.data/rooms.tmp','.data/rooms.json');});return saving;};
const store:Store={async get(c){return rooms.get(c)},async save(r,v){if((rooms.get(r.code)?.version??0)!==v)return false;rooms.set(r.code,r);await persist();return true;}};
const sessions=new Map<WebSocket,{token:string;code:string}>();
function broadcast(code:string){const room=rooms.get(code);if(room)for(const [ws,s] of sessions)if(s.code===code&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({room:view(room,s.token)}));}
const server=createServer(async(req,res)=>{
 const url=new URL(req.url!,'http://localhost');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(url.pathname==='/api'&&req.method==='POST'){
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw new Error('Origin rejected');
   let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)throw new Error('Request too large');}
   const {action,...data}=JSON.parse(body);const result=await handle(store,action,data,String(req.headers['x-session']??''));
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));broadcast(data.code??(result&&'code'in result?result.code:''));return;
  }
  if(url.pathname==='/app.js'||url.pathname==='/app.css'){const type=url.pathname.endsWith('.js')?'text/javascript':'text/css';res.writeHead(200,{'Content-Type':type});res.end(await readFile('build'+url.pathname));return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);
 }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e instanceof Error?e.message:'Ошибка'}));}
});
const wss=new WebSocketServer({noServer:true,maxPayload:8192});
server.on('upgrade',(req,socket,head)=>{if(req.url!=='/ws'||(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));});
wss.on('connection',ws=>{ws.on('message',async bytes=>{try{const {action,token,...data}=JSON.parse(bytes.toString());const result=await handle(store,action,data,token);sessions.set(ws,{token,code:data.code});ws.send(JSON.stringify({room:result}));broadcast(data.code);}catch(e){ws.send(JSON.stringify({error:e instanceof Error?e.message:'Ошибка'}));}});ws.on('close',()=>sessions.delete(ws));});
setInterval(async()=>{for(const s of sessions.values()){try{await handle(store,'sync',{code:s.code},s.token);}catch{}}for(const code of new Set([...sessions.values()].map(s=>s.code)))broadcast(code);},1000).unref();
const port=Number(process.env.PORT??3000);server.listen(port,'0.0.0.0',()=>console.log(`PentaChess: http://localhost:${port}`));
