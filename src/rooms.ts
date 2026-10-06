import {createGame,play,legalMoves,advanceClock,eliminate,nextTurn,Game,Move} from './engine.ts';
export type Member={token:string;name:string;ready:boolean;seat?:number;seen:number};
export type Room={code:string;members:Member[];mode:string;game?:Game;version:number;practice:boolean;created:number;chat:{name:string;text:string;at:number}[]};
export interface Store {get(code:string):Promise<Room|undefined>;save(room:Room,previous:number):Promise<boolean>}
const fail=(text:string):never=>{throw new Error(text)};
export const roomCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(6)),v=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[v%32]).join('');
const nickname=(value:unknown)=> typeof value==='string'&&value.trim().length>=1&&value.trim().length<=20?value.trim():fail('Имя должно содержать от 1 до 20 символов');
export function view(room:Room,token:string){const member=room.members.find(p=>p.token===token);return {...room,members:room.members.map(({token,...p})=>p),you:member?.seat,joined:!!member};}
function start(room:Room,now:number){const members=[...room.members];for(let i=4;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[members[i],members[j]]=[members[j],members[i]];}
 members.forEach((m,i)=>m.seat=i);room.game=createGame(members.map(m=>m.name),room.mode,now);}
function maintain(room:Room,now:number){if(room.game?.status==='playing'){
 advanceClock(room.game,now);
 if(!room.practice)for(const m of room.members)if(m.seat!==undefined&&room.game.players[m.seat].alive&&now-m.seen>90000){const turn=room.game.turn;eliminate(room.game,m.seat,'DISCONNECTED');if(turn===m.seat)nextTurn(room.game,now);}
}}
export async function handle(store:Store,action:string,data:Record<string,any>,token:string,now=Date.now()){
 if(token.length<24||token.length>128)fail('Сессия недействительна');
 if(action==='create'){
  if(!['clock','casual','rapid','blitz'].includes(data.mode))fail('Выберите контроль времени');
  for(let i=0;i<5;i++){const code=roomCode();if(await store.get(code))continue;
   const room:Room={code,members:[{token,name:nickname(data.name),ready:false,seen:now}],mode:data.mode,version:1,practice:data.practice===true,created:now,chat:[]};
   if(room.practice){room.members=[nickname(data.name),'Alex','Mika','Denis','Sasha'].map((name,i)=>({token:i===0?token:crypto.randomUUID(),name,ready:true,seen:now,seat:i}));room.game=createGame(room.members.map(m=>m.name),room.mode,now);}
   if(await store.save(room,0))return view(room,token);
  }fail('Не удалось создать комнату');
 }
 const code=typeof data.code==='string'?data.code.toUpperCase():'';if(!/^[A-Z2-9]{6}$/.test(code))fail('Неверный код комнаты');
 for(let attempt=0;attempt<5;attempt++){
  const original=await store.get(code);if(!original)fail('Комната не найдена');
  const room=structuredClone(original!);const member=room.members.find(p=>p.token===token);
  if(action==='join'&&!member){if(room.game||room.members.length===5)fail('Комната заполнена');room.members.push({token,name:nickname(data.name),ready:false,seen:now});}
  else if(action!=='spectate'&&!member)fail('Сначала присоединитесь к комнате');
  maintain(room,now);if(member)member.seen=now;
  if(action==='ready'){if(room.game)fail('Партия уже началась');member!.ready=!member!.ready;if(room.members.length===5&&room.members.every(m=>m.ready))start(room,now);}
  if(action==='moves'){
   if(!room.game)fail('Партия ещё не началась');const p=room.game!.board[data.from];
   const moves=p&&(room.practice||member!.seat===p.owner)&&p.owner===room.game!.turn?legalMoves(room.game!,data.from):[];
   room.version++;if(await store.save(room,original!.version))return {moves,room:view(room,token)};continue;
  }
  if(action==='move'){if(!room.game)fail('Партия ещё не началась');room.game=play(room.game!,data.move as Move,room.practice?room.game!.turn:member!.seat!,now);}
  if(action==='resign'){if(!room.game||member!.seat===undefined)fail('Партия ещё не началась');const current=room.game!.turn;eliminate(room.game!,room.practice?current:member!.seat!,'RESIGNED');if(room.practice||current===member!.seat)nextTurn(room.game!,now);}
  if(action==='chat'){if(typeof data.text!=='string'||!data.text.trim()||data.text.length>240)fail('Сообщение должно быть короче 240 символов');const previous=room.chat.filter(m=>m.name===member!.name).at(-1);if(previous&&now-previous.at<1500)fail('Подождите перед следующим сообщением');room.chat.push({name:member!.name,text:data.text.trim(),at:now});room.chat=room.chat.slice(-80);}
  if(!['sync','join','ready','move','resign','chat','spectate'].includes(action))fail('Неизвестное действие');
  room.version++;if(await store.save(room,original!.version))return view(room,token);
 }fail('Позиция обновилась. Повторите действие');
}
