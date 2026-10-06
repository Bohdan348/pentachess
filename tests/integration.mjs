import assert from 'node:assert/strict';import {WebSocket} from 'ws';
const origin=process.env.TEST_ORIGIN??'http://localhost:3000';const tokens=Array.from({length:5},()=>crypto.randomUUID());
async function api(token,action,data={}){const r=await fetch(origin+'/api',{method:'POST',headers:{'Content-Type':'application/json','X-Session':token},body:JSON.stringify({action,...data})});const result=await r.json();if(!r.ok)throw new Error(result.error);return result;}
let r=await api(tokens[0],'create',{name:'Test0',mode:'clock'});const code=r.code;
for(let i=1;i<5;i++)await api(tokens[i],'join',{code,name:'Test'+i});for(const token of tokens)r=await api(token,'ready',{code});
assert.ok(r.game);const clients=[];const latest=[];
for(let i=0;i<5;i++){const ws=new WebSocket(origin.replace('http','ws')+'/ws');clients.push(ws);await new Promise((resolve,reject)=>{ws.on('open',resolve);ws.on('error',reject)});ws.on('message',bytes=>{const d=JSON.parse(bytes);if(d.room?.game)latest[i]=d.room;});ws.send(JSON.stringify({action:'sync',code,token:tokens[i]}));}
async function waitFor(test){const start=Date.now();while(!test()){if(Date.now()-start>5000)throw new Error('Synchronization timeout');await new Promise(resolve=>setTimeout(resolve,30));}}
await waitFor(()=>latest.filter(Boolean).length===5);
for(let turn=0;turn<5;turn++){const player=r.members.find(m=>m.seat===turn);const token=tokens[Number(player.name.slice(4))];r=await api(token,'move',{code,move:{from:`${turn}:3:0`,to:`${turn}:2:0`}});await waitFor(()=>latest.every(s=>s.game.moves===turn+1));for(const s of latest)assert.deepEqual(s.game.board,r.game.board);}
assert.equal(r.game.round,2);await assert.rejects(()=>api(tokens[0],'move',{code,move:{from:'4:3:1',to:'4:2:1'}}));
const reconnect=await api(tokens[0],'sync',{code});assert.equal(reconnect.game.moves,5);
for(let seat=0;seat<4;seat++){const name=r.members.find(m=>m.seat===seat).name;r=await api(tokens[Number(name.slice(4))],'resign',{code});}
assert.equal(r.game.status,'finished');assert.equal(r.game.winner,4);assert.equal(r.game.players[4].place,1);await waitFor(()=>latest.every(s=>s.game.status==='finished'));
for(const ws of clients)ws.close();console.log('PASS: five independent HTTP/WebSocket clients, five moves, synchronized state, invalid move rejection, reconnect and winner.');
