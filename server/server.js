const http = require('http');
const fs = require('fs');
const path = require('path');
const GameEngine = require('./gameEngine');
const { generateThemes, generateWorld, chat } = require('./gameMaster');

const engine = new GameEngine();
const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, '..', 'public');
const MIME = { '.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' };
function json(res,c,d){const b=JSON.stringify(d);res.writeHead(c,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)});res.end(b)}
function body(req){return new Promise(r=>{const c=[];req.on('data',d=>c.push(d));req.on('end',()=>{try{r(JSON.parse(Buffer.concat(c).toString()))}catch{r({})}})})}
function stat(res,p){let fp=path.normalize(path.join(PUB,p==='/'?'index.html':p));if(!fp.startsWith(PUB)){res.writeHead(403);res.end();return}
  fs.stat(fp,(e,st)=>{if(e||!st.isFile())fp=path.join(PUB,'index.html');const s=fs.createReadStream(fp);s.on('open',()=>{res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});s.pipe(res)});s.on('error',()=>{res.writeHead(404);res.end()})})}

function sanitize(w){return{
  theme:w.theme,narrative:w.narrative,game_master_personality:w.game_master_personality,
  rooms:w.rooms.map(r=>({id:r.id,name:r.name,description:r.description,visual:r.visual,objective:r.objective,hotspots:r.hotspots})),
  npc:w.npc?{name:w.npc.name,description:w.npc.description,emoji:w.npc.emoji,dialogues:w.npc.dialogues,bribe_item:w.npc.bribe_item}:null,
  wild_card:w.wild_card?{name:w.wild_card.name,emoji:w.wild_card.emoji,consequence_name:w.wild_card.consequence_name,timer_seconds:w.wild_card.timer_seconds}:null,
  endings:w.endings,items:w.items,
  puzzles:{cipher:w.puzzles?.cipher?{encoded_text:w.puzzles.cipher.encoded_text,type:w.puzzles.cipher.type}:null,combination:w.puzzles?.combination?{combo_length:w.puzzles.combination.combo.length}:null}}}

http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host}`);const p=url.pathname;
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}

  if(p==='/api/themes'&&req.method==='GET'){
    try{const themes=await generateThemes();return json(res,200,{ok:true,themes})}
    catch(e){console.error('[THEMES]',e.message);return json(res,500,{ok:false,error:e.message})}}

  if(p==='/api/create'&&req.method==='POST'){
    const b=await body(req);if(!b.sessionId||!b.theme)return json(res,400,{error:'Need sessionId+theme'});
    try{console.log(`[CREATE] "${b.theme.name}"...`);const w=await generateWorld(b.theme);engine.create(b.sessionId,w);const room=w.rooms[0];
      console.log(`[CREATE] OK: ${room.hotspots.length} hotspots in "${room.name}"`);
      return json(res,200,{ok:true,state:engine.get(b.sessionId).state,world:sanitize(w),hotspots:room.hotspots,roomVisual:room.visual,roomDesc:room.description})}
    catch(e){console.error('[CREATE] FAIL:',e.message);return json(res,500,{ok:false,error:e.message})}}

  if(p==='/api/state'&&req.method==='GET'){
    const sid=url.searchParams.get('sessionId');const entry=engine.get(sid);
    if(!entry)return json(res,404,{ok:false,error:'Session not found.'});
    const{state,world}=entry;const room=world.rooms.find(r=>r.id===state.currentRoom);
    return json(res,200,{ok:true,state,world:sanitize(world),hotspots:room?.hotspots||[],roomVisual:room?.visual,roomDesc:room?.description})}

  if(p==='/api/action'&&req.method==='POST'){
    const b=await body(req);if(!b.sessionId||!b.action)return json(res,400,{error:'Need sessionId+action'});
    const entry=engine.get(b.sessionId);if(!entry)return json(res,404,{error:'Session expired.'});
    let r=engine.processAction(b.sessionId,b.action);const room=entry.world.rooms.find(rm=>rm.id===r.state.currentRoom);
    r.hotspots=room?.hotspots||[];r.roomVisual=room?.visual;r.roomDesc=room?.description;r.world=sanitize(entry.world);
    return json(res,200,r)}

  if(p==='/api/chat'&&req.method==='POST'){
    const b=await body(req);if(!b.sessionId||!b.message)return json(res,400,{error:'Need sessionId+message'});
    const entry=engine.get(b.sessionId);if(!entry)return json(res,404,{error:'Session not found.'});
    try{const result=await chat(entry.world,entry.state,b.message);return json(res,200,{ok:true,reply:result.reply})}
    catch{return json(res,200,{ok:true,reply:"The narrator pauses, distracted."})}}

  stat(res,p);
}).listen(PORT,()=>{console.log(`\n  Escape Room v6 — port ${PORT}\n  API Key: ${process.env.CLAUDE_API_KEY?'SET':'MISSING (wizard tower only)'}\n  http://localhost:${PORT}\n`)});
