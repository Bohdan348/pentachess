export type Kind = 'K'|'Q'|'R'|'B'|'N'|'P';
export type Piece = {kind:Kind; owner:number; moved?:boolean; destination?:number};
export type Move = {from:string; to:string; destination?:number; promotion?:Kind};
export type Player = {name:string; alive:boolean; time:number; captures:number; queens:number; mates:number; place?:number};
export type Event = {number:number; owner:number; text:string; from?:string; to?:string; at:number};
export type Game = {board:Record<string,Piece>; players:Player[]; turn:number; round:number; moves:number; events:Event[]; lastMove?:Move; started:number; tick:number; mode:string; status:'playing'|'finished'; winner?:number};
export const COLORS=['#73a9ef','#ef837a','#e9bd67','#79bca5','#b295da'];
export const COLOR_NAMES=['Blue','Coral','Gold','Jade','Violet'];
export const id=(s:number,r:number,c:number)=>`${s}:${r}:${c}`;
export const parse=(cell:string)=>cell.split(':').map(Number);
export const CELLS=Array.from({length:5},(_,s)=>Array.from({length:5},(_,r)=>Array.from({length:8},(_,c)=>id(s,r,c)))).flat(2);
const cellSet=new Set(CELLS);
type Step={cell:string;dr:number;dc:number};
// All movement is defined by this graph. Rendering coordinates never enter the rules.
export function step(cell:string,dr:number,dc:number):Step[]{
 const [s,r,c]=parse(cell);
 if(dr<0&&r===0){return [2,3].map(offset=>({cell:id((s+offset)%5,0,((7-c-dc)%8+8)%8),dr:1,dc:-dc}));}
 const nr=r+dr;if(nr<0||nr>4)return [];
 const lane=s*8+c+dc;return [{cell:id(((Math.floor(lane/8)%5)+5)%5,nr,((lane%8)+8)%8),dr,dc}];
}
const ORTH=[[1,0],[-1,0],[0,1],[0,-1]];
const DIAG=[[1,1],[1,-1],[-1,1],[-1,-1]];
export const GRAPH=Object.fromEntries(CELLS.map(cell=>[cell,{orthogonal:ORTH.flatMap(([a,b])=>step(cell,a,b).map(x=>x.cell)),diagonal:DIAG.flatMap(([a,b])=>step(cell,a,b).map(x=>x.cell))}]));
export function createGame(names:string[],mode='clock',now=Date.now()):Game{
 const board:Record<string,Piece>={};const back:Kind[]=['R','N','B','Q','K','B','N','R'];
 for(let s=0;s<5;s++)for(let c=0;c<8;c++){board[id(s,4,c)]={kind:back[c],owner:s};board[id(s,3,c)]={kind:'P',owner:s};}
 return {board,players:names.map(name=>({name,alive:true,time:mode==='clock'?600000:({casual:45000,rapid:20000,blitz:8000}[mode]??600000),captures:0,queens:0,mates:0})),turn:0,round:1,moves:0,events:[],started:now,tick:now,mode,status:'playing'};
}
function rays(g:Game,from:string,dirs:number[][]):string[]{
 const out=new Set<string>();const owner=g.board[from].owner;
 for(const [dr,dc] of dirs){const queue=step(from,dr,dc);const seen=new Set<string>([from]);
 while(queue.length){const p=queue.shift()!;if(seen.has(p.cell))continue;seen.add(p.cell);const piece=g.board[p.cell];
 if(piece?.owner===owner)continue;out.add(p.cell);if(!piece)queue.push(...step(p.cell,p.dr,p.dc));}}
 return [...out];
}
// Knights use a precomputed undirected graph. Include reversed 2+1 paths at junctions.
function knightLinks(from:string){const out:string[]=[];for(const [a,b] of ORTH)for(const x of step(from,a,b))for(const y of step(x.cell,x.dr,x.dc))for(const sign of [-1,1])out.push(...step(y.cell,y.dc*sign,y.dr*sign).map(z=>z.cell));return out.filter(c=>c!==from);}
export const KNIGHT_GRAPH:Record<string,string[]>=Object.fromEntries(CELLS.map(c=>[c,[]]));
for(const from of CELLS)for(const to of knightLinks(from)){if(!KNIGHT_GRAPH[from].includes(to))KNIGHT_GRAPH[from].push(to);if(!KNIGHT_GRAPH[to].includes(from))KNIGHT_GRAPH[to].push(from);}
export function pseudo(g:Game,from:string,attack=false):Move[]{
 const piece=g.board[from];if(!piece)return [];const [s,r,c]=parse(from);let cells:string[]=[];
 if(['R','B','Q'].includes(piece.kind))cells=rays(g,from,piece.kind==='R'?ORTH:piece.kind==='B'?DIAG:[...ORTH,...DIAG]);
 if(piece.kind==='K')cells=[...ORTH,...DIAG].flatMap(([a,b])=>step(from,a,b).map(x=>x.cell));
 if(piece.kind==='N')cells=KNIGHT_GRAPH[from];
 if(piece.kind==='P'){
  const moves:Move[]=[];const dir=piece.destination===undefined?-1:1;
  for(const dc of attack?[-1,1]:[0,-1,1])for(const next of step(from,dir,dc)){
   const target=g.board[next.cell];const dest=parse(next.cell)[0];
   if(attack || (dc===0?!target:!!target&&target.owner!==piece.owner))moves.push({from,to:next.cell,...(r===0&&dir<0?{destination:dest}:{})});
  }
  if(!attack&&r===3&&s===piece.owner&&!piece.moved&&piece.destination===undefined&&!g.board[id(s,2,c)]&&!g.board[id(s,1,c)])moves.push({from,to:id(s,1,c)});
  return moves.filter(m=>attack||g.board[m.to]?.kind!=='K');
 }
 return [...new Set(cells)].filter(to=>to!==from&&g.board[to]?.owner!==piece.owner&&(attack||g.board[to]?.kind!=='K')).map(to=>({from,to}));
}
export function inCheck(g:Game,owner:number){
 const king=Object.keys(g.board).find(c=>g.board[c].owner===owner&&g.board[c].kind==='K');if(!king)return true;
 return Object.entries(g.board).some(([cell,p])=>p.owner!==owner&&g.players[p.owner].alive&&pseudo(g,cell,true).some(m=>m.to===king));
}
function applyBoard(g:Game,m:Move){const board={...g.board};const p={...board[m.from],moved:true};delete board[m.from];if(m.destination!==undefined)p.destination=m.destination;
 if(p.kind==='P'&&p.destination!==undefined&&parse(m.to)[1]===4)p.kind=m.promotion??'Q';board[m.to]=p;return board;}
export function legalMoves(g:Game,from:string):Move[]{const p=g.board[from];if(!p||!g.players[p.owner].alive||g.status!=='playing')return [];
 return pseudo(g,from).filter(m=>!inCheck({...g,board:applyBoard(g,m)},p.owner));}
export function hasEscape(g:Game,owner:number){return Object.keys(g.board).some(c=>g.board[c].owner===owner&&legalMoves(g,c).length>0);}
export function eliminate(g:Game,owner:number,reason:string,killer?:number){if(!g.players[owner].alive)return;
 const remaining=g.players.filter(p=>p.alive).length;g.players[owner].alive=false;g.players[owner].place=remaining;
 for(const c of Object.keys(g.board))if(g.board[c].owner===owner)delete g.board[c];if(killer!==undefined&&reason==='CHECKMATE')g.players[killer].mates++;
 g.events.push({number:g.moves,owner,text:reason,at:Date.now()});
 const alive=g.players.map((p,i)=>p.alive?i:-1).filter(i=>i>=0);if(alive.length<=1){g.status='finished';g.winner=alive[0];if(g.winner!==undefined)g.players[g.winner].place=1;}
}
export function nextTurn(g:Game,now:number){if(g.status!=='playing')return;const before=g.turn;do{g.turn=(g.turn+1)%5;}while(!g.players[g.turn].alive);if(g.turn<=before)g.round++;
 g.tick=now;if(g.mode!=='clock')g.players[g.turn].time=({casual:45000,rapid:20000,blitz:8000}[g.mode]??45000);
 // Stalemated active player is eliminated: no legal action is available.
 if(!hasEscape(g,g.turn)){eliminate(g,g.turn,inCheck(g,g.turn)?'CHECKMATE':'STALEMATE');nextTurn(g,now);}}
export function advanceClock(g:Game,now=Date.now()){if(g.status!=='playing')return false;const elapsed=Math.max(0,now-g.tick);g.players[g.turn].time=Math.max(0,g.players[g.turn].time-elapsed);g.tick=now;
 if(g.players[g.turn].time===0){eliminate(g,g.turn,'TIME OUT');nextTurn(g,now);return true;}return false;}
export function play(g:Game,m:Move,owner:number,now=Date.now()):Game{
 const next=structuredClone(g);advanceClock(next,now);if(next.status!=='playing'||next.turn!==owner)throw new Error('Сейчас ход другого игрока');
 if(!cellSet.has(m.from)||!cellSet.has(m.to)||next.board[m.from]?.owner!==owner)throw new Error('Выберите свою фигуру');
 if(m.promotion&&!['Q','R','B','N'].includes(m.promotion))throw new Error('Недопустимое превращение');
 const valid=legalMoves(next,m.from).find(x=>x.to===m.to&&(x.destination??undefined)===(m.destination??undefined));if(!valid)throw new Error('Этот ход недопустим');
 const piece=next.board[m.from],captured=next.board[m.to];next.board=applyBoard(next,m);next.moves++;next.lastMove=m;
 if(captured){next.players[owner].captures++;if(captured.kind==='Q')next.players[owner].queens++;}
 next.events.push({number:next.moves,owner,text:`${piece.kind}${captured?' × ':' · '}${notation(m.from)} → ${notation(m.to)}${m.destination!==undefined?' ↗ '+COLOR_NAMES[m.destination]:''}`,from:m.from,to:m.to,at:now});
 if(next.mode==='clock')next.players[owner].time+=3000;
 // Evaluate each surviving king immediately. Iterate after removals because lines open.
 let changed=true;while(changed&&next.status==='playing'){changed=false;for(let i=0;i<5;i++)if(next.players[i].alive&&inCheck(next,i)&&!hasEscape(next,i)){eliminate(next,i,'CHECKMATE',i===owner?undefined:owner);changed=true;}}
 nextTurn(next,now);return next;
}
export function notation(c:string){const [s,r,l]=parse(c);return `${'ABCDE'[s]}${'abcdefgh'[l]}${5-r}`;}
