(function(){'use strict';
let sid,S,world,hotspots,roomVis,selItem=null,invOpen=false,storyOpen=false,cShift=0,dVals=[0,0,0],wcInt=null,inspHs=null;
const $=s=>document.querySelector(s);
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}

// ═══ SARCASTIC STORY NARRATION for each step ═══
const STORY_TEXT={
  find_note:"You found a glowing book. Inside: the world's most obvious sticky note. The Archmage hid his password in a BOOK. In a LIBRARY. Genius-level security.",
  examine_crystal:"The crystal ball showed you a vision. Three items needed. Because apparently one key would have been too simple for an Archmage who grades students D-.",
  get_crystal:"You pulled a crystal out of a crumbling wall. The tower is literally falling apart and you're looting it. Priorities: correct.",
  solve_desk:"Password: ARCTURUS. The first star he taught you. And you still got a D-. The drawer slid open — inside, the counter-scroll.",
  open_door_1:"Door to the lab: open. Behind you, the study continues its slow structural collapse. No pressure.",
  examine_runes:"Encoded runes on the wall. It's ROT-3. The Archmage called this 'encryption'. Thalia, the last apprentice, called it 'laziness'. Thalia is now a frog.",
  solve_cipher:"Cipher cracked: the code is 4812. You feel smart for approximately three seconds before remembering it was a children's substitution cipher.",
  get_moonwater:"Moonwater: collected. The fountain still works despite the building actively imploding. Magical plumbing is underrated.",
  get_key:"A crescent key, hidden among herbs. Also a note saying 'DO NOT DRINK' from the cauldron. You briefly considered it anyway.",
  open_door_2:"The crescent key fits. Wards dissolve. The ritual chamber awaits — your final exam. Except failure means architecture.",
  place_fire:"Flame crystal placed. First segment of the ritual circle blazes to life. Only two more catastrophically dangerous steps to go.",
  place_water:"Moonwater placed. Silver light floods the second segment. The circle is responding. The ceiling is also responding — by cracking more.",
  read_notes:"The Archmage's notes: three circled numbers. 3, 7, 1. He also left margin doodles of cats. Focus.",
  solve_combo:"Combination lock: opened. The keystone is revealed. You're genuinely getting close to not dying.",
  enter_code:"7349 — the year of the First Convergence. Code accepted. The counter-spell is PRIMED. One more step.",
  escape:"YOU ESCAPED. The tower stabilizes. Stones stop falling. Somewhere, an Archmage is going to have a very awkward conversation about workplace safety."
};

// Audio
const ac=new(window.AudioContext||window.webkitAudioContext)();
function tn(f,d,ty='square',v=.04){const o=ac.createOscillator(),g=ac.createGain();o.type=ty;o.frequency.value=f;g.gain.setValueAtTime(v,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+d)}
const sfx={click:()=>tn(700,.03,'square',.03),pickup:()=>{tn(440,.08);setTimeout(()=>tn(660,.08),60)},unlock:()=>{tn(523,.12);setTimeout(()=>tn(659,.12),90);setTimeout(()=>tn(784,.18),180)},error:()=>tn(160,.1,'sawtooth',.03),room:()=>{tn(330,.2,'triangle',.04);setTimeout(()=>tn(440,.25,'triangle',.03),120)},escape:()=>[523,659,784,1047].forEach((f,i)=>setTimeout(()=>tn(f,.25,'triangle',.06),i*120)),hint:()=>tn(550,.1,'sine',.03),npc:()=>tn(180,.15,'sawtooth',.04),orb:()=>{tn(300,.3,'sine',.05);setTimeout(()=>tn(500,.5,'sine',.04),200)},dial:()=>tn(450,.02,'square',.02),done:()=>tn(300,.06,'sine',.02)};

async function api(ep,m='GET',b=null){const o={method:m,headers:{'Content-Type':'application/json'}};if(b)o.body=JSON.stringify(b);return(await fetch(ep,o)).json()}

// ═══ TOAST — FULL TEXT, no truncation, click to dismiss ═══
function toast(text,type='info',duration=3500){
  const area=$('#toast-area');if(!area||!text)return;
  const t=document.createElement('div');t.className=`toast ${type}`;t.textContent=text;
  t.style.cursor='pointer';
  t.addEventListener('click',()=>t.remove());
  area.appendChild(t);
  setTimeout(()=>{if(t.parentNode){t.classList.add('fading');setTimeout(()=>t.remove(),500)}},duration);
}

function addMsg(text,type='info'){const log=$('#msg-log');if(!log||!text)return;const d=document.createElement('div');d.className=`msg ${type}`;d.textContent=text;log.appendChild(d);log.scrollTop=log.scrollHeight}
function show(id){document.querySelectorAll('.scr').forEach(s=>{s.classList.remove('active');s.style.display='none'});const e=$('#'+id);if(e){e.classList.add('active');e.style.display=id==='game-scr'?'block':'flex'}}
function setPal(p){if(!p)return;const s=document.documentElement.style;['accent','accent2','fog','text'].forEach(k=>{if(p[k])s.setProperty('--'+k,p[k])})}

// ═══ THEME SELECT ═══
async function loadThemes(){
  const st=$('#ts-st'),ld=$('#ts-ld'),cards=$('#ts-cards'),err=$('#ts-err'),retry=$('#ts-retry');
  st.textContent='Generating worlds...';ld.classList.remove('hidden');cards.innerHTML='';err.classList.add('hidden');retry.classList.add('hidden');
  try{const d=await api('/api/themes');if(!d.ok)throw new Error(d.error);ld.classList.add('hidden');st.textContent='Choose your world:';
    d.themes.forEach(th=>{const c=document.createElement('div');c.className='ts-card';c.style.setProperty('--card-c',th.palette?.accent||'#666');
      c.innerHTML=`<span class="tc-i">${esc(th.icon||'🎮')}</span><div class="tc-n" style="color:${th.palette?.accent||'#fff'}">${esc(th.name)}</div><div class="tc-tg">${esc(th.tagline)}</div><div class="tc-pal">${['bg','wall','accent','accent2','floor'].map(k=>`<div class="tc-sw" style="background:${th.palette?.[k]||'#333'}"></div>`).join('')}</div>`;
      c.onclick=()=>pickTheme(th);cards.appendChild(c)});
  }catch(e){ld.classList.add('hidden');st.textContent='';err.textContent=`Error: ${e.message}`;err.classList.remove('hidden');retry.classList.remove('hidden')}}

async function pickTheme(theme){
  show('load-scr');$('#ld-t').textContent=`Building "${theme.name}"...`;
  sid=crypto.randomUUID();localStorage.setItem('msid',sid);
  try{const d=await api('/api/create','POST',{sessionId:sid,theme});if(!d.ok)throw new Error(d.error||'Failed');
    S=d.state;world=d.world;hotspots=d.hotspots;roomVis=d.roomVisual;setPal(world.theme.palette);showIntro();
  }catch(e){console.error(e);const lt=$('#ld-t');lt.style.cssText='max-width:500px;text-align:center';
    const sp=lt.parentElement.querySelector('.spin');if(sp)sp.style.display='none';
    lt.innerHTML='<span style="color:#f44">Generation failed</span><br><br><span style="font-size:11px;color:#999">'+esc(e.message)+'</span>';
    const btn=document.createElement('button');btn.textContent='BACK';btn.className='btn-g';btn.style.marginTop='14px';btn.onclick=()=>{show('theme-scr');loadThemes()};lt.parentElement.appendChild(btn)}}

function showIntro(){
  show('game-scr');
  $('#intro-icon').textContent=world.theme?.icon||'🚪';
  $('#intro-title').textContent=world.theme?.name||'ESCAPE ROOM';
  $('#intro-premise').textContent=world.narrative?.premise||world.theme?.tagline||'Find a way out.';
  $('#intro-obj-t').textContent=world.narrative?.objective||'Escape.';
  $('#intro-ov')?.classList.remove('hidden');
  $('#intro-go').onclick=()=>{$('#intro-ov').classList.add('hidden');startGame()};
}

// ═══ GAME START ═══
function startGame(){
  if(!window.Renderer){addMsg('3D engine failed.','error');return}
  Renderer.init($('#cvs-wrap'));
  loadRoom3D();updateHUD();renderStory();drawMinimap();bindEvents();
  // Load saved notes
  const saved=localStorage.getItem('escape_notes_'+sid);
  if(saved)$('#note-ta').value=saved;
}

function loadRoom3D(){
  Renderer.loadRoom(roomVis||{},hotspots||[],world.theme.palette||{},{onHover:()=>{},onClick:(id,hs)=>inspectObject(id,hs)});
  const room=world.rooms.find(r=>r.id===S.currentRoom);
  if(room){$('#rname').textContent=room.name?.toUpperCase();$('#h-title').textContent=world.theme?.name?.toUpperCase()||'ESCAPE';$('#h-icon').textContent=world.theme?.icon||'🚪'}
  const hint=$('#click-hint');if(hint)setTimeout(()=>hint.style.display='none',5000);
  updateRelevance();drawMinimap();
}

// ═══ MINIMAP — circular bird's-eye of 3 rooms ═══
function drawMinimap(){
  const cvs=$('#minimap-cvs');if(!cvs||!S||!world)return;
  const ctx=cvs.getContext('2d');const w=120,h=120;ctx.clearRect(0,0,w,h);
  const rooms=world.rooms||[];const ci=rooms.map(r=>r.id).indexOf(S.currentRoom);
  const cx=w/2,cy=h/2,rr=20;
  // Draw connections
  const positions=[[cx,cy-32],[cx+34,cy+20],[cx-34,cy+20]];
  ctx.strokeStyle='rgba(123,104,238,0.2)';ctx.lineWidth=1;
  for(let i=0;i<positions.length-1;i++){ctx.beginPath();ctx.moveTo(positions[i][0],positions[i][1]);ctx.lineTo(positions[i+1][0],positions[i+1][1]);ctx.stroke()}

  rooms.forEach((room,i)=>{
    if(i>=3)return;
    const [px,py]=positions[i];
    const isCurrent=i===ci;const isVisited=i<ci;const isLocked=i>ci;
    // Room circle
    ctx.beginPath();ctx.arc(px,py,rr,0,Math.PI*2);
    ctx.fillStyle=isCurrent?'rgba(123,104,238,0.3)':isVisited?'rgba(0,255,136,0.15)':'rgba(40,40,60,0.4)';
    ctx.fill();
    ctx.strokeStyle=isCurrent?'#7b68ee':isVisited?'#0f8':'#333';ctx.lineWidth=isCurrent?2:1;ctx.stroke();
    // Room number
    ctx.fillStyle=isCurrent?'#fff':isVisited?'#0f8':'#555';
    ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(isVisited?'✓':(i+1).toString(),px,py-4);
    // Room name (short)
    ctx.fillStyle=isCurrent?'#c8bfe0':'#666';ctx.font='7px monospace';
    const name=(room.name||'Room').split(' ').slice(-1)[0].substring(0,8);
    ctx.fillText(name,px,py+8);
    // Door indicator
    if(i<rooms.length-1){
      const locked=i>=ci;
      ctx.fillStyle=locked?'#f44':'#0f8';ctx.font='8px serif';
      const dx=(positions[i][0]+positions[Math.min(i+1,2)][0])/2;
      const dy=(positions[i][1]+positions[Math.min(i+1,2)][1])/2;
      ctx.fillText(locked?'🔒':'🚪',dx,dy);
    }
    // Item hints for unvisited rooms
    if(isLocked){
      ctx.fillStyle='rgba(200,150,255,0.5)';ctx.font='7px monospace';
      ctx.fillText('???',px,py+16);
    }
    // Check count for visited rooms
    if(isVisited){
      const roomSteps=(world.progression||[]).filter(p=>p.room===room.id);
      const done=roomSteps.filter(p=>S.completedSteps.includes(p.id)).length;
      ctx.fillStyle='#0f8';ctx.font='6px monospace';
      ctx.fillText(`${done}/${roomSteps.length}`,px,py+16);
    }
  });
}

// ═══ STORY PROGRESS — sarcastic narration of completed steps ═══
function renderStory(){
  const list=$('#story-list');if(!list||!world)return;
  list.innerHTML='';
  const prog=world.progression||[];
  const currentRoom=S?.currentRoom;
  prog.forEach(step=>{
    const done=S?.completedSteps?.includes(step.id);
    const isCurrent=step.room===currentRoom&&!done;
    const d=document.createElement('div');
    d.className='story-item'+(done?' done':'')+(isCurrent?' active':'');
    const check=done?'✓':isCurrent?'▸':'○';
    const text=done?(STORY_TEXT[step.id]||step.objective):step.objective;
    d.innerHTML=`<span class="si-check">${check}</span> <span class="si-text">${esc(text)}</span>`;
    list.appendChild(d);
  });
  list.scrollTop=list.scrollHeight;
}

function toggleStory(){storyOpen=!storyOpen;$('#story-pan')?.classList.toggle('collapsed',!storyOpen);if(storyOpen)renderStory()}

// ═══ NOTEPAD ═══
function toggleNotes(){const ov=$('#note-ov');if(!ov)return;ov.classList.toggle('hidden')}
function saveNotes(){const ta=$('#note-ta');if(ta&&sid)localStorage.setItem('escape_notes_'+sid,ta.value)}

// ═══ RELEVANCE ═══
function updateRelevance(ids){
  if(!Renderer||!S)return;
  if(ids&&ids.length>0){
    const all=[...ids];(hotspots||[]).forEach(hs=>{if(hs.interaction?.type==='door'||hs.interaction?.type==='flavor'||hs.interaction?.type==='email')all.push(hs.id)});
    Renderer.setRelevance(all);
  }else{Renderer.clearRelevance?.()}
}

function checkStuck(r){
  if(!r||!Renderer)return;
  if((r.stuckCount||0)>=3&&r.nextStep){
    const step=(world.progression||[]).find(p=>p.id===r.nextStep);
    if(step){Renderer.nudgeObject(step.hotspot);toast('Look for the glowing object...','info',3000)}
  }
}

// ═══ INSPECTION ═══
function inspectObject(id,hs){
  sfx.click();inspHs=hs;Renderer.zoomToObject(id);
  const vis=hs.visual||{};
  $('#insp-e').textContent=vis.emoji||'❓';
  $('#insp-n').textContent=hs.label||'Object';
  $('#insp-d').textContent=hs.description||'';
  const btns=$('#insp-btns');btns.innerHTML='';
  const inter=hs.interaction||{};
  const mk=(txt,cls)=>{const b=document.createElement('button');b.textContent=txt;if(cls)b.className=cls;return b};

  const ib=mk('INTERACT');ib.onclick=async()=>{closeInspect();handle(await act({type:'interact',target:id}))};btns.appendChild(ib);
  if(inter.type==='email'){const eb=mk('READ DOCUMENT');eb.onclick=async()=>{const r=await act({type:'read_email',target:S.currentRoom});if(r.data?.from)openEmail(r.data);else handle(r)};btns.appendChild(eb)}
  if(hs.label?.toLowerCase().match(/cipher|decode|rune|workbench/)){const cb=mk('USE CIPHER DEVICE');cb.onclick=()=>{closeInspect();openCipher()};btns.appendChild(cb)}
  if(hs.label?.toLowerCase().match(/lock|dial|combin|arcane/)){const db=mk('OPEN LOCK');db.onclick=()=>{closeInspect();openDial()};btns.appendChild(db)}
  if(selItem){const item=S.inventory?.find(i=>i.id===selItem);const ub=mk(`USE ${item?.name||'ITEM'}`,'warn');
    ub.onclick=async()=>{const iid=selItem;selItem=null;$('#use-m')?.classList.add('hidden');closeInspect();handle(await act({type:'use_item',target:id,payload:iid}))};btns.appendChild(ub)}

  $('#inspect')?.classList.remove('hidden');
}

function closeInspect(){inspHs=null;$('#inspect')?.classList.add('hidden');Renderer.zoomOut()}

// ═══ ACTIONS ═══
async function act(action){const d=await api('/api/action','POST',{sessionId:sid,action});if(d.state){S=d.state;hotspots=d.hotspots;roomVis=d.roomVisual}return d}

function handle(r){
  if(!r)return;const ev=r.event||'info',msg=r.message||'';
  if(msg){
    switch(ev){
      case 'pickup':    toast(`✓ ${msg}`,'pickup');sfx.pickup();break;
      case 'examine':   toast(msg,'info');sfx.click();break;
      case 'unlock':    toast(`✓ ${msg}`,'success');sfx.unlock();break;
      case 'error':     toast(`✗ ${msg}`,'error');sfx.error();break;
      case 'locked':    toast(`🔒 ${msg}`,'warning');sfx.error();break;
      case 'already_done':toast(msg,'info',1500);sfx.done();break;
      case 'room_change':toast(`→ ${world.rooms.find(rm=>rm.id===S.currentRoom)?.name||'Next room'}`,'success');sfx.room();loadRoom3D();break;
      case 'escape':    toast('🎉 ESCAPED!','success',5000);sfx.escape();break;
      case 'hint':      toast(msg,'info',5000);sfx.hint();break;
      case 'npc':       toast(msg,'warning');sfx.npc();break;
      case 'npc_leave': toast(msg,'success');sfx.click();break;
      case 'orb_found': toast(`Found: ${world.wild_card?.name||'Artifact'}!`,'pickup');sfx.orb();break;
      case 'orb_used':  toast(msg,'warning',4000);sfx.orb();loadRoom3D();break;
      case 'puzzle_prompt':toast(msg,'info');break;
      case 'flavor':    toast(msg,'info',2500);break;
      case 'burnout':   toast(msg,'error',5000);break;
      default:if(msg)toast(msg,'info');
    }
    addMsg(msg,ev);
  }
  if(r.entityArrived&&r.entityMessage){toast(r.entityMessage,'warning',4000);addMsg(r.entityMessage,'npc')}

  // Visual feedback
  if(inspHs){
    if(ev==='unlock'){
      Renderer.flashObject(inspHs.id,'#00ff88');
      if(inspHs.interaction?.type==='door'||inspHs.label?.toLowerCase().match(/door|exit|gate/))Renderer.openDoor(inspHs.id);
      if(inspHs.id?.includes('fire_pedestal'))Renderer.fillPedestal(inspHs.id,0xff4400);
      if(inspHs.id?.includes('water_pedestal'))Renderer.fillPedestal(inspHs.id,0x4488ff);
    }else if(ev==='pickup'){Renderer.pickupAnim(inspHs.id)}
    else if(ev==='error'||ev==='locked'){Renderer.flashObject(inspHs.id,'#ff3333')}
  }

  if(r.relevantHotspots)updateRelevance(r.relevantHotspots);
  checkStuck(r);
  updateHUD();renderStory();drawMinimap();
}

// ═══ HUD ═══
function updateHUD(){
  if(!S||!world)return;
  const objEl=$('#obj-text');
  if(objEl&&S.currentObjective&&objEl.textContent!==S.currentObjective){
    objEl.textContent=S.currentObjective;$('#obj-panel')?.classList.add('updated');setTimeout(()=>$('#obj-panel')?.classList.remove('updated'),800)}
  const rooms=world.rooms.map(r=>r.id),ci=rooms.indexOf(S.currentRoom);
  $('#prog')?.querySelectorAll('.pn').forEach((n,i)=>{n.classList.toggle('done',i<ci);n.classList.toggle('current',i===ci)});
  $('#prog')?.querySelectorAll('.pl').forEach((l,i)=>l.classList.toggle('done',i<ci));
  const p=S.patience??100;const pf=$('#pat-f');if(pf){pf.style.width=p+'%';pf.classList.toggle('low',p<=40&&p>15);pf.classList.toggle('crit',p<=15)}
  $('#pat-v').textContent=p;
  const po=$('#pat-ov');if(po){po.className='pat-ov';if(S.patienceEffects?.includes('dread'))po.classList.add('dread');if(S.patienceEffects?.includes('despair'))po.classList.add('despair')}
  $('#inv-ct').textContent=S.inventory?.length||0;
  const has=S.inventory?.some(i=>i.type==='wild_card');$('#wc-btn')?.classList.toggle('hidden',!has||S.wildCardUsed);
  renderWC();
  const nb=$('#npc-bub');
  if(nb){if(S.npcState?.present){nb.classList.remove('hidden');nb.textContent=`${world.npc?.emoji||'👤'} ${world.npc?.name}: "${world.npc?.dialogues?.[Math.floor(Math.random()*world.npc.dialogues.length)]||'...'}"`; Renderer.showNPC?.(S.npcState.blockingHotspot)}else{nb.classList.add('hidden');Renderer.hideNPC?.()}}
  if(S.escaped||S.ending==='burnout')showVic();
}

function renderWC(){const t=$('#wc-tmr');if(!t)return;if(!S.wildCardConsequence||!S.wildCardTimer){t.classList.add('hidden');if(wcInt){clearInterval(wcInt);wcInt=null}return}
  t.classList.remove('hidden');$('#wc-l').textContent=world.wild_card?.consequence_name||'ENTITY';
  if(!wcInt){wcInt=setInterval(()=>{const rem=Math.max(0,Math.ceil(S.wildCardTimerSecs-(Date.now()-S.wildCardTimer)/1000));$('#wc-n').textContent=rem;t.classList.toggle('urg',rem<=20)},500)}}

function renderInv(){
  const items=S.inventory||[];const list=$('#inv-list');if(!list)return;list.innerHTML='';
  if(!items.length){list.innerHTML='<div style="color:#444;font-size:8px;padding:6px">Empty. Explore to find items.</div>';return}
  items.forEach(item=>{const el=document.createElement('div');el.className='ii'+(selItem===item.id?' sel':'');
    el.innerHTML=`<span class="ii-e">${item.emoji||'📦'}</span><div class="ii-info"><div class="ii-n">${esc(item.name)}</div><div class="ii-d">${esc(item.desc)}</div></div>`;
    el.onclick=()=>{if(selItem===item.id){selItem=null;$('#use-m')?.classList.add('hidden')}else{selItem=item.id;const m=$('#use-m');if(m){m.textContent=`USE: ${item.name} — click an object`;m.classList.remove('hidden')}}renderInv()};
    list.appendChild(el)})}

// ═══ CHAT ═══
async function sendChat(msg){
  if(!msg.trim())return;addMsg(`You: ${msg}`,'user-chat');
  const upper=msg.trim().toUpperCase();
  if(upper.match(/^\d{4}$/)||upper.match(/^[A-Z]{4,}$/)){handle(await act({type:'submit',payload:msg}));return}
  const btn=$('#chat-send');if(btn){btn.textContent='…';btn.disabled=true}
  try{const r=await api('/api/chat','POST',{sessionId:sid,message:msg});if(r.reply){addMsg(r.reply,'gm');toast(r.reply,'info',4000)}}
  catch{addMsg('The narrator pauses...','sys')}
  finally{if(btn){btn.textContent='⏎';btn.disabled=false}}}

// ═══ OVERLAYS ═══
function openEmail(d){$('#em-f').textContent=d.from;$('#em-s').textContent=d.subject;$('#em-b').textContent=d.body;$('#email-ov')?.classList.remove('hidden')}
function openCipher(){cShift=0;updCi();$('#cipher-ov')?.classList.remove('hidden')}
function updCi(){const A='ABCDEFGHIJKLMNOPQRSTUVWXYZ';$('#ci-out').innerHTML=A.split('').map(c=>`<span>${c}</span>`).join('');
  const sh=A.slice(cShift)+A.slice(0,cShift);$('#ci-inn').innerHTML=sh.split('').map(c=>`<span>${c}</span>`).join('');
  $('#ci-sh').textContent=cShift;const ct=world.puzzles?.cipher?.encoded_text||'';$('#ci-enc').textContent=ct;
  const dc=ct.split('').map(c=>{const A2='ABCDEFGHIJKLMNOPQRSTUVWXYZ',i=A2.indexOf(c.toUpperCase());if(i===-1)return c;const n=(i-cShift+26)%26;return c===c.toUpperCase()?A2[n]:A2[n].toLowerCase()}).join('');
  $('#ci-dec').textContent=dc||'...'}
async function subCi(){const d=$('#ci-dec')?.textContent||'',nums=d.match(/\d+/),ans=nums?nums[0]:d;const r=await act({type:'cipher_wheel',payload:{answer:ans}});handle(r);if(r.ok&&(r.event==='unlock'))$('#cipher-ov')?.classList.add('hidden')}
function openDial(){dVals=[0,0,0];buildDial();$('#dial-ov')?.classList.remove('hidden')}
function buildDial(){const box=$('#dial-box');if(!box)return;box.innerHTML='';dVals.forEach((v,i)=>{const d=document.createElement('div');d.className='dd';d.innerHTML=`<div class="db" data-i="${i}" data-d="up">▲</div><div class="dv" id="dv${i}">${v}</div><div class="db" data-i="${i}" data-d="down">▼</div>`;box.appendChild(d)});
  box.querySelectorAll('.db').forEach(b=>{b.onclick=()=>{const i=+b.dataset.i;dVals[i]=b.dataset.d==='up'?(dVals[i]+1)%10:(dVals[i]+9)%10;document.getElementById(`dv${i}`).textContent=dVals[i];sfx.dial()}})}
async function subDi(){const r=await act({type:'puzzle_dial',payload:{combo:[...dVals]}});handle(r);if(r.ok&&r.event==='unlock')$('#dial-ov')?.classList.add('hidden')}

const AM={speed_demon:{i:'⚡',n:'Speed Demon'},no_hints:{i:'🧠',n:'Skeptic'},hoarder:{i:'🎒',n:'Hoarder'},wild_card_user:{i:'🔮',n:'Wild Card'},npc_briber:{i:'☕',n:'Charmer'},zen_master:{i:'🧘',n:'Zen'},lore_hound:{i:'📧',n:'Lore'},burnout:{i:'💀',n:'Burnout'},entity_survived:{i:'👁️',n:'Survivor'}};
function showVic(){const el=Math.round((Date.now()-S.startTime)/1000),m=Math.floor(el/60),s=el%60;
  const ed=world.endings?.[S.ending]||{title:'ESCAPED',text:'Out.'};
  $('#vi-i').textContent={standard:'🏆',speedrun:'⚡',wild_card:'🔮',burnout:'💀'}[S.ending]||'🏆';
  $('#vi-t').textContent=ed.title;$('#vi-s').textContent=S.ending?.replace(/_/g,' ')?.toUpperCase()||'';$('#vi-tx').textContent=ed.text;
  $('#vi-st').innerHTML=`<div class="st"><span class="sv">${m}:${s.toString().padStart(2,'0')}</span>TIME</div><div class="st"><span class="sv">${S.hintCount}</span>HINTS</div><div class="st"><span class="sv">${S.patience}%</span>PAT</div>`;
  $('#vi-a').innerHTML=(S.achievements||[]).map((id,i)=>{const a=AM[id]||{i:'🏅',n:id};return`<div class="ach" style="animation-delay:${i*.1}s"><span>${a.i}</span>${a.n}</div>`}).join('');
  $('#vic-ov')?.classList.remove('hidden')}

// ═══ EVENTS ═══
function bindEvents(){
  $('#inv-btn')?.addEventListener('click',()=>{invOpen=!invOpen;$('#inv-pan')?.classList.toggle('open',invOpen);if(invOpen)renderInv()});
  $('#inv-x')?.addEventListener('click',()=>{invOpen=false;$('#inv-pan')?.classList.remove('open')});
  $('#hint-btn')?.addEventListener('click',async()=>handle(await act({type:'hint'})));
  $('#note-btn')?.addEventListener('click',toggleNotes);
  $('#note-x')?.addEventListener('click',toggleNotes);
  $('#note-ta')?.addEventListener('input',saveNotes);
  $('#story-btn')?.addEventListener('click',toggleStory);
  $('#reset-view')?.addEventListener('click',()=>{Renderer.resetView?.();toast('View reset','info',1200)});
  $('#chat-send')?.addEventListener('click',()=>{const i=$('#chat-in');sendChat(i.value);i.value=''});
  $('#chat-in')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();sendChat(e.target.value);e.target.value=''}});
  $('#em-x')?.addEventListener('click',()=>$('#email-ov')?.classList.add('hidden'));
  $('#ci-l')?.addEventListener('click',()=>{cShift=(cShift+25)%26;updCi();sfx.dial()});
  $('#ci-r')?.addEventListener('click',()=>{cShift=(cShift+1)%26;updCi();sfx.dial()});
  $('#ci-ok')?.addEventListener('click',subCi);$('#ci-no')?.addEventListener('click',()=>$('#cipher-ov')?.classList.add('hidden'));
  $('#dial-ok')?.addEventListener('click',subDi);$('#dial-no')?.addEventListener('click',()=>$('#dial-ov')?.classList.add('hidden'));
  $('#wc-btn')?.addEventListener('click',async()=>handle(await act({type:'use_wildcard'})));
  $('#insp-back')?.addEventListener('click',closeInspect);
  $('#vi-btn')?.addEventListener('click',()=>{$('#vic-ov')?.classList.add('hidden');Renderer.dispose();if(wcInt){clearInterval(wcInt);wcInt=null}show('theme-scr');loadThemes()});
  [$('#email-ov'),$('#cipher-ov'),$('#dial-ov'),$('#note-ov')].forEach(ov=>{ov?.addEventListener('click',e=>{if(e.target===ov)ov.classList.add('hidden')})});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){if(inspHs){closeInspect();return}['#cipher-ov','#dial-ov','#email-ov','#note-ov'].forEach(s=>{if(!$(s)?.classList.contains('hidden'))$(s).classList.add('hidden')});if(invOpen){invOpen=false;$('#inv-pan')?.classList.remove('open')}if(selItem){selItem=null;$('#use-m')?.classList.add('hidden');renderInv()}document.exitPointerLock?.();return}
    if(document.activeElement===$('#chat-in')||document.activeElement===$('#note-ta'))return;
    if(e.key==='h'||e.key==='H'){e.preventDefault();(async()=>handle(await act({type:'hint'})))()}
    if(e.key==='i'||e.key==='I'){e.preventDefault();invOpen=!invOpen;$('#inv-pan')?.classList.toggle('open',invOpen);if(invOpen)renderInv()}
    if(e.key==='r'||e.key==='R'){e.preventDefault();Renderer.resetView?.()}
    if(e.key==='n'||e.key==='N'){e.preventDefault();toggleNotes()}
  });
}

// ═══ INIT ═══
document.addEventListener('click',()=>{if(ac.state==='suspended')ac.resume();Renderer.resumeAudio?.()},{once:true});
$('#ts-retry')?.addEventListener('click',loadThemes);
(async()=>{const esid=localStorage.getItem('msid');if(esid){try{const d=await api(`/api/state?sessionId=${esid}`);
  if(d.ok&&d.world){sid=esid;S=d.state;world=d.world;hotspots=d.hotspots;roomVis=d.roomVisual;setPal(world.theme?.palette);show('game-scr');startGame();return}}catch{}}loadThemes()})();
})();
