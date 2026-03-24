/**
 * ROOM RENDERER v8 — Immersive 3D Engine
 * Proper mesh archetypes, room state changes, ambient audio, NPC, pickup anim
 */
(function(){
'use strict';
let renderer,scene,camera,container,clock;
let animCBs=[],running=false;
let objects={},objMeshes=[];
let yaw=0,pitch=0,tYaw=0,tPitch=0,locked=false,dragging=false,dragS={x:0,y:0};
let inspecting=false,savedPos=null,savedQuat=null;
let roomDims={width:8,height:3.5,depth:6};
let ambNodes=[];
const SENS=0.003,DSENS=0.004,PLIM=Math.PI*0.38;
const ac=new(window.AudioContext||window.webkitAudioContext)();

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════

function init(el){
  container=el;clock=new THREE.Clock();
  renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setSize(el.clientWidth,el.clientHeight);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.6;
  el.appendChild(renderer.domElement);
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(58,el.clientWidth/el.clientHeight,0.1,50);
  camera.position.set(0,1.6,3);
  window.addEventListener('resize',onResize);
  initCam();addCrosshair();
  running=true;animate();
}

function onResize(){if(!container)return;const w=container.clientWidth,h=container.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h)}
function animate(){if(!running)return;requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),0.05),t=clock.getElapsedTime();animCBs.forEach(cb=>cb(dt,t));renderer.render(scene,camera)}

function clearScene(){
  scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose()}});
  while(scene.children.length)scene.remove(scene.children[0]);
  animCBs=animCBs.filter(cb=>cb._perm);objects={};objMeshes=[];stopAmb();
}

// ═══════════════════════════════════════════════════════
// CAMERA — first person, pointer lock + drag
// ═══════════════════════════════════════════════════════

function initCam(){
  const cvs=renderer.domElement;
  cvs.addEventListener('click',()=>{if(!inspecting&&!locked)cvs.requestPointerLock?.()});
  document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===cvs});
  document.addEventListener('mousemove',e=>{
    if(inspecting)return;
    if(locked){tYaw-=e.movementX*SENS;tPitch-=e.movementY*SENS;tPitch=Math.max(-PLIM,Math.min(PLIM,tPitch))}
    else if(dragging){tYaw-=(e.clientX-dragS.x)*DSENS;tPitch-=(e.clientY-dragS.y)*DSENS;tPitch=Math.max(-PLIM,Math.min(PLIM,tPitch));dragS={x:e.clientX,y:e.clientY}}
  });
  cvs.addEventListener('mousedown',e=>{if(!inspecting&&!locked&&e.button===0){dragging=true;dragS={x:e.clientX,y:e.clientY}}});
  document.addEventListener('mouseup',()=>{dragging=false});
  let lt=null;
  cvs.addEventListener('touchstart',e=>{if(e.touches.length===1)lt={x:e.touches[0].clientX,y:e.touches[0].clientY}});
  cvs.addEventListener('touchmove',e=>{if(!lt||e.touches.length!==1)return;tYaw-=(e.touches[0].clientX-lt.x)*DSENS;tPitch-=(e.touches[0].clientY-lt.y)*DSENS;tPitch=Math.max(-PLIM,Math.min(PLIM,tPitch));lt={x:e.touches[0].clientX,y:e.touches[0].clientY}});
  cvs.addEventListener('touchend',()=>{lt=null});
  const cu=function(dt){if(inspecting)return;yaw+=(tYaw-yaw)*Math.min(1,dt*14);pitch+=(tPitch-pitch)*Math.min(1,dt*14);camera.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'))};
  cu._perm=true;animCBs.push(cu);
}

// Entrance pan: slow arc on room entry
function entrancePan(){
  const startYaw=0.4,endYaw=0;
  tYaw=yaw=startYaw;tPitch=pitch=-0.1;
  let t=0;
  animCBs.push(function ep(dt){
    t+=dt;const p=Math.min(1,t/1.2);
    tYaw=startYaw+(endYaw-startYaw)*ease(p);
    tPitch=-0.1*(1-ease(p));
    if(p>=1){const i=animCBs.indexOf(ep);if(i!==-1)animCBs.splice(i,1)}
  });
}

// ═══════════════════════════════════════════════════════
// ROOM BUILDER
// ═══════════════════════════════════════════════════════

function buildRoom(palette){
  const W=8,H=3.5,D=6;roomDims={width:W,height:H,depth:D};
  const wc=new THREE.Color(palette.wall||'#1a1a1a').multiplyScalar(1.5);
  const fc=new THREE.Color(palette.floor||'#0d0d0d').multiplyScalar(1.4);

  const wallMat=new THREE.MeshStandardMaterial({color:wc,roughness:0.92,metalness:0.05,side:THREE.BackSide});
  const floorMat=new THREE.MeshStandardMaterial({color:fc,roughness:0.8,metalness:0.1});
  const ceilMat=new THREE.MeshStandardMaterial({color:wc.clone().multiplyScalar(0.5),roughness:0.95});

  // Walls
  mk(new THREE.PlaneGeometry(W,H),wallMat,0,H/2,-D/2).receiveShadow=true;
  const lw=mk(new THREE.PlaneGeometry(D,H),wallMat.clone(),-W/2,H/2,0);lw.rotation.y=Math.PI/2;lw.receiveShadow=true;
  const rw=mk(new THREE.PlaneGeometry(D,H),wallMat.clone(),W/2,H/2,0);rw.rotation.y=-Math.PI/2;rw.receiveShadow=true;
  // Floor + ceiling
  const fl=mk(new THREE.PlaneGeometry(W,D),floorMat,0,0,0);fl.rotation.x=-Math.PI/2;fl.receiveShadow=true;
  const cl=mk(new THREE.PlaneGeometry(W,D),ceilMat,0,H,0);cl.rotation.x=Math.PI/2;

  // Baseboards
  const bbm=new THREE.MeshStandardMaterial({color:wc.clone().multiplyScalar(0.35),roughness:0.6});
  mk(new THREE.BoxGeometry(W,0.1,0.05),bbm,0,0.05,-D/2+0.025);
  mk(new THREE.BoxGeometry(0.05,0.1,D),bbm.clone(),-W/2+0.025,0.05,0);
  mk(new THREE.BoxGeometry(0.05,0.1,D),bbm.clone(),W/2-0.025,0.05,0);

  return roomDims;
}

function mk(geo,mat,x,y,z){const m=new THREE.Mesh(geo,mat);m.position.set(x||0,y||0,z||0);scene.add(m);return m}

// ═══════════════════════════════════════════════════════
// 3D MESH ARCHETYPES — proper geometry per object type
// ═══════════════════════════════════════════════════════

function buildArchetype(type, dims, color, color2) {
  const c1=new THREE.Color(color||'#444');
  const c2=new THREE.Color(color2||'#222');
  const mat=()=>new THREE.MeshStandardMaterial({color:c1,roughness:0.7,metalness:0.15});
  const mat2=()=>new THREE.MeshStandardMaterial({color:c2,roughness:0.8,metalness:0.1});
  const group=new THREE.Group();

  switch(type){
    case 'bookshelf': {
      const w=dims[0]||0.8,h=dims[1]||1.5,d=dims[2]||0.3;
      group.add(mkBox(w,h,d,mat(),0,h/2,0)); // body
      for(let i=1;i<4;i++){group.add(mkBox(w-0.04,0.03,d,mat2(),0,i*(h/4),0))} // shelves
      // Books on shelves
      for(let i=0;i<3;i++){for(let j=0;j<3;j++){
        const bw=0.06+Math.random()*0.04,bh=0.12+Math.random()*0.08;
        const bk=mkBox(bw,bh,d*0.7,new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(Math.random(),0.4,0.25),roughness:0.9}));
        bk.position.set(-w/3+j*w/3,i*(h/4)+0.08+bh/2,0);group.add(bk);
      }}
      break;
    }
    case 'desk': {
      const w=dims[0]||1.2,h=dims[1]||0.75,d=dims[2]||0.6;
      group.add(mkBox(w,0.06,d,mat(),0,h,0)); // top
      group.add(mkBox(0.06,h,0.06,mat2(),-w/2+0.05,h/2,-d/2+0.05)); // legs
      group.add(mkBox(0.06,h,0.06,mat2(),w/2-0.05,h/2,-d/2+0.05));
      group.add(mkBox(0.06,h,0.06,mat2(),-w/2+0.05,h/2,d/2-0.05));
      group.add(mkBox(0.06,h,0.06,mat2(),w/2-0.05,h/2,d/2-0.05));
      // Drawer
      const dw=mkBox(w*0.4,h*0.25,d*0.8,mat2(),0,h*0.7,0.05);
      group.add(dw);group.userData={drawer:dw};
      break;
    }
    case 'door': {
      const w=dims[0]||0.85,h=dims[1]||2.1,d=dims[2]||0.08;
      // Frame
      group.add(mkBox(w+0.12,0.08,0.1,mat2(),0,h,0));
      group.add(mkBox(0.06,h,0.1,mat2(),-w/2-0.03,h/2,0));
      group.add(mkBox(0.06,h,0.1,mat2(),w/2+0.03,h/2,0));
      // Door panel (pivots from left edge)
      const panel=mkBox(w,h,d,mat(),0,h/2,0);
      const pivot=new THREE.Group();pivot.position.set(-w/2,0,0);
      panel.position.set(w/2,0,0);pivot.add(panel);
      group.add(pivot);group.userData={pivot,panel,isOpen:false};
      // Handle
      const handle=mkBox(0.04,0.12,0.06,new THREE.MeshStandardMaterial({color:0x886633,metalness:0.6,roughness:0.3}));
      handle.position.set(w/2-0.1,h/2,d/2+0.03);pivot.add(handle);
      break;
    }
    case 'pedestal': {
      const r=dims[0]/2||0.2,h=dims[1]||0.9;
      group.add(new THREE.Mesh(new THREE.CylinderGeometry(r*1.3,r*1.3,0.08,8),mat()));
      group.userData.stem=new THREE.Mesh(new THREE.CylinderGeometry(r*0.6,r*0.8,h-0.15,8),mat2());
      group.userData.stem.position.y=h/2;group.add(group.userData.stem);
      const top=new THREE.Mesh(new THREE.CylinderGeometry(r,r,0.08,16),mat());
      top.position.y=h-0.04;group.add(top);
      // Slot for item (glows when filled)
      group.userData.slot=new THREE.Mesh(new THREE.CylinderGeometry(r*0.5,r*0.5,0.04,16),new THREE.MeshStandardMaterial({color:c1,emissive:c1,emissiveIntensity:0.2,transparent:true,opacity:0.5}));
      group.userData.slot.position.y=h;group.add(group.userData.slot);
      break;
    }
    case 'fountain': {
      const r=dims[0]/2||0.4,h=dims[1]||1;
      // Column
      group.add(new THREE.Mesh(new THREE.CylinderGeometry(r*0.3,r*0.4,h*0.6,8),mat2()));
      group.children[0].position.y=h*0.3;
      // Bowl
      const bowl=new THREE.Mesh(new THREE.CylinderGeometry(r,r*0.7,h*0.3,12,1,true),mat());
      bowl.position.y=h*0.6+h*0.15;group.add(bowl);
      // Water surface
      const water=new THREE.Mesh(new THREE.CircleGeometry(r*0.85,16),new THREE.MeshStandardMaterial({color:0x4488cc,emissive:0x2244aa,emissiveIntensity:0.3,transparent:true,opacity:0.7}));
      water.rotation.x=-Math.PI/2;water.position.y=h*0.7;group.add(water);
      break;
    }
    case 'cauldron': {
      const r=dims[0]/2||0.35,h=dims[1]||0.6;
      group.add(new THREE.Mesh(new THREE.SphereGeometry(r,12,8,0,Math.PI*2,0,Math.PI*0.6),mat()));
      group.children[0].position.y=r*0.4;
      // Glow inside
      const glow=new THREE.Mesh(new THREE.CircleGeometry(r*0.7,12),new THREE.MeshStandardMaterial({color:0x22aa22,emissive:0x22aa22,emissiveIntensity:0.5,transparent:true,opacity:0.6}));
      glow.rotation.x=-Math.PI/2;glow.position.y=r*0.6;group.add(glow);
      break;
    }
    case 'crystal': {
      const s=dims[0]/2||0.15;
      const crys=new THREE.Mesh(new THREE.OctahedronGeometry(s),new THREE.MeshStandardMaterial({color:c1,emissive:c1,emissiveIntensity:0.6,transparent:true,opacity:0.85}));
      crys.position.y=s;group.add(crys);
      // Rotate animation
      animCBs.push((dt,t)=>{crys.rotation.y=t*0.5;crys.rotation.x=Math.sin(t*0.3)*0.1});
      break;
    }
    case 'orb': {
      const s=dims[0]/2||0.2;
      const orb=new THREE.Mesh(new THREE.SphereGeometry(s,16,12),new THREE.MeshStandardMaterial({color:c1,emissive:c1,emissiveIntensity:0.5,transparent:true,opacity:0.8}));
      orb.position.y=s+0.1;group.add(orb);
      animCBs.push((dt,t)=>{orb.position.y=s+0.1+Math.sin(t*1.5)*0.05});
      break;
    }
    case 'scroll': {
      const r=0.04,l=dims[0]||0.3;
      group.add(new THREE.Mesh(new THREE.CylinderGeometry(r,r,l,8),mat()));
      group.children[0].rotation.z=Math.PI/2;group.children[0].position.y=0.1;
      // Knobs
      group.add(new THREE.Mesh(new THREE.SphereGeometry(r*1.5,6,4),mat2()));
      group.children[1].position.set(-l/2,0.1,0);
      const k2=group.children[1].clone();k2.position.set(l/2,0.1,0);group.add(k2);
      break;
    }
    case 'lock': {
      const r=dims[0]/2||0.15;
      group.add(new THREE.Mesh(new THREE.TorusGeometry(r,r*0.3,8,16),mat()));
      group.children[0].position.y=r*2;
      group.add(mkBox(r*1.5,r*1.5,r*0.8,mat2(),0,r*0.75,0));
      break;
    }
    case 'keystone': {
      const s=dims[0]/2||0.2;
      const ks=new THREE.Mesh(new THREE.OctahedronGeometry(s),new THREE.MeshStandardMaterial({color:c1,emissive:0x443300,emissiveIntensity:0.3}));
      ks.position.y=s+0.1;ks.rotation.y=Math.PI/4;group.add(ks);
      break;
    }
    case 'lectern': {
      const w=dims[0]||0.5,h=dims[1]||1;
      group.add(new THREE.Mesh(new THREE.CylinderGeometry(w*0.15,w*0.25,h*0.7,6),mat2()));
      group.children[0].position.y=h*0.35;
      const surf=mkBox(w,0.04,w*0.7,mat(),0,h*0.75,0);
      surf.rotation.x=-0.3;group.add(surf);
      break;
    }
    case 'shelf': {
      const w=dims[0]||0.8,h=dims[1]||0.8,d=dims[2]||0.25;
      group.add(mkBox(w,h,d,mat(),0,h/2,0));
      for(let i=1;i<3;i++)group.add(mkBox(w-0.02,0.02,d,mat2(),0,i*h/3,0));
      break;
    }
    case 'papers': {
      for(let i=0;i<4;i++){
        const p=mkBox(0.2,0.005,0.28,new THREE.MeshStandardMaterial({color:0xd4c8a0,roughness:0.95}));
        p.position.set((Math.random()-0.5)*0.15,0.005*i+0.01,(Math.random()-0.5)*0.1);
        p.rotation.y=Math.random()*0.5;group.add(p);
      }
      break;
    }
    case 'wall_panel':
    case 'rune_wall': {
      const w=dims[0]||1,h=dims[1]||0.8;
      const panel=mkBox(w,h,0.05,new THREE.MeshStandardMaterial({color:c1,roughness:0.85,emissive:c2,emissiveIntensity:0.15}),0,h/2,0);
      group.add(panel);
      // Rune marks
      for(let i=0;i<5;i++){
        const rm=new THREE.Mesh(new THREE.PlaneGeometry(0.08,0.08),new THREE.MeshStandardMaterial({color:c1,emissive:c1,emissiveIntensity:0.4,transparent:true,opacity:0.6}));
        rm.position.set(-w/3+i*w/6,h*0.3+Math.sin(i)*h*0.15,0.03);group.add(rm);
      }
      break;
    }
    case 'workbench': {
      const w=dims[0]||1,h=dims[1]||0.85,d=dims[2]||0.5;
      group.add(mkBox(w,0.08,d,mat(),0,h,0)); // surface
      group.add(mkBox(w-0.1,h*0.5,0.04,mat2(),0,h*0.5,-d/2+0.02)); // back panel
      group.add(mkBox(0.06,h,0.06,mat2(),-w/2+0.05,h/2,d/2-0.05));
      group.add(mkBox(0.06,h,0.06,mat2(),w/2-0.05,h/2,d/2-0.05));
      // Tools on top
      group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.15,6),mat2()));
      group.children[4].position.set(w*0.2,h+0.08,0);group.children[4].rotation.z=0.3;
      break;
    }
    default: {
      group.add(mkBox(dims[0]||0.5,dims[1]||0.5,dims[2]||0.3,mat(),0,(dims[1]||0.5)/2,0));
    }
  }

  group.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true}});
  return group;
}

function mkBox(w,h,d,mat,x,y,z){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x||0,y||0,z||0);return m}

// ═══════════════════════════════════════════════════════
// OBJECT CREATION — maps hotspot data → 3D archetype
// ═══════════════════════════════════════════════════════

function hsTo3D(hs){
  const W=roomDims.width,H=roomDims.height,D=roomDims.depth;
  const x=((hs.x+(hs.w||14)/2)/100-0.5)*(W*0.85);
  const isDoor=hs.interaction?.type==='door'||hs.label?.toLowerCase().match(/door|exit|gate/);
  if(isDoor)return{x:Math.max(-W/2+1,Math.min(W/2-1,x)),y:0,z:-D/2+0.08};
  const yPct=hs.y/100;
  if(yPct<0.22)return{x,y:1.2+(0.22-yPct)*2,z:-D/2+0.3};
  return{x,y:0,z:((hs.y+(hs.h||20)/2)/100-0.5)*(-D*0.7)};
}

function createObject(hs){
  const vis=hs.visual||{};const scale=vis.scale||1;
  const isDoor=hs.interaction?.type==='door'||hs.label?.toLowerCase().match(/door|exit|gate/);
  const type=vis.objectType||(isDoor?'door':'rect');

  // Calculate dimensions
  const bW=Math.max(0.3,((hs.w||14)/100)*roomDims.width*0.4)*scale;
  const bH=Math.max(0.25,((hs.h||20)/100)*roomDims.height*0.5)*scale;
  const dims=isDoor?[0.85,2.1,0.08]:[Math.min(bW,1.4),Math.min(bH,1.6),bW*0.5];

  // Build 3D archetype
  const group=buildArchetype(type,dims,vis.primaryColor,vis.secondaryColor);
  const pos=hsTo3D(hs);
  group.position.set(pos.x,pos.y,pos.z);
  if(!isDoor)group.rotation.y=(Math.random()-0.5)*0.08;
  group.userData={id:hs.id,hotspot:hs,type:'interactable'};
  scene.add(group);

  // Find all meshes for raycasting
  const meshes=[];group.traverse(c=>{if(c.isMesh)meshes.push(c)});
  meshes.forEach(m=>{m.userData={id:hs.id,hotspot:hs,type:'interactable'};objMeshes.push(m)});

  // Label sprite (hidden until hover)
  const label=makeLabelSprite(hs.label||'Object');
  const labelY=isDoor?2.3:(dims[1]+0.3);
  label.position.set(pos.x,pos.y+labelY,pos.z+0.3);
  label.visible=false;scene.add(label);

  // Glow light
  const gc=vis.glowColor?parseRGBA(vis.glowColor):{color:new THREE.Color('#fff'),alpha:0.15};
  const glow=new THREE.PointLight(gc.color,gc.alpha*0.5,2.5);
  glow.position.set(pos.x,pos.y+dims[1]*0.6,pos.z+0.2);scene.add(glow);

  // Idle animation (subtle float for non-door, non-heavy items)
  const smallTypes=['crystal','orb','scroll','keystone','papers','lock'];
  if(smallTypes.includes(type)){
    const by=group.position.y;
    animCBs.push((dt,t)=>{if(!objects[hs.id])return;group.position.y=by+Math.sin(t*1.5+pos.x*3)*0.02});
  }

  const entry={group,meshes,label,glow,data:hs,dims,originalGlow:gc.alpha*0.5,type};
  objects[hs.id]=entry;
  return entry;
}

// ═══════════════════════════════════════════════════════
// ROOM STATE CHANGES — visual updates when puzzles solve
// ═══════════════════════════════════════════════════════

function animateDoorOpen(id){
  const entry=objects[id];if(!entry)return;
  const pivot=entry.group.userData?.pivot;if(!pivot)return;
  if(entry.group.userData.isOpen)return;
  entry.group.userData.isOpen=true;
  let t=0;
  animCBs.push(function doorAnim(dt){
    t+=dt*1.5;const ang=Math.min(Math.PI*0.45,t*Math.PI*0.45);
    pivot.rotation.y=ang;
    if(t>=1){const i=animCBs.indexOf(doorAnim);if(i!==-1)animCBs.splice(i,1)}
  });
  // Increase glow
  entry.glow.intensity=2;entry.glow.color=new THREE.Color(0x44ff44);
}

function animatePedestalFill(id,color){
  const entry=objects[id];if(!entry)return;
  const slot=entry.group.userData?.slot;if(!slot)return;
  slot.material.emissiveIntensity=1.5;slot.material.opacity=0.9;
  slot.material.emissive=new THREE.Color(color||0xffffff);
  entry.glow.intensity=2;entry.glow.color=new THREE.Color(color||0xffffff);
  // Pulse
  let t=0;
  animCBs.push(function pPulse(dt){
    t+=dt*3;slot.material.emissiveIntensity=1.5+Math.sin(t)*0.3;
    if(t>12){slot.material.emissiveIntensity=1.2;const i=animCBs.indexOf(pPulse);if(i!==-1)animCBs.splice(i,1)}
  });
}

// ═══════════════════════════════════════════════════════
// PICKUP ANIMATION — shrink + fly to bottom corner
// ═══════════════════════════════════════════════════════

function animatePickup(id){
  const entry=objects[id];if(!entry)return;
  const g=entry.group;
  const startPos=g.position.clone();
  const startScale=g.scale.clone();
  let t=0;
  animCBs.push(function pickAnim(dt){
    t+=dt*2.5;const p=Math.min(1,t);
    g.scale.setScalar(1-p*0.9);
    g.position.y=startPos.y+p*0.5;
    g.rotation.y+=dt*4;
    if(p>=1){
      g.visible=false;
      const i=animCBs.indexOf(pickAnim);if(i!==-1)animCBs.splice(i,1);
    }
  });
}

// ═══════════════════════════════════════════════════════
// NPC — simple 3D cat mesh
// ═══════════════════════════════════════════════════════

let npcGroup=null;

function showNPC(hsId){
  if(npcGroup){scene.remove(npcGroup)}
  npcGroup=new THREE.Group();
  // Body
  const bodyMat=new THREE.MeshStandardMaterial({color:0x444444,roughness:0.9});
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.15,0.3),bodyMat);body.position.y=0.2;npcGroup.add(body);
  // Head
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.1,8,6),bodyMat);head.position.set(0,0.35,0.12);npcGroup.add(head);
  // Ears
  const earMat=new THREE.MeshStandardMaterial({color:0x555555});
  const ear1=new THREE.Mesh(new THREE.ConeGeometry(0.04,0.08,4),earMat);ear1.position.set(-0.06,0.45,0.12);npcGroup.add(ear1);
  const ear2=ear1.clone();ear2.position.x=0.06;npcGroup.add(ear2);
  // Eyes
  const eyeMat=new THREE.MeshStandardMaterial({color:0xffcc00,emissive:0xffcc00,emissiveIntensity:0.5});
  const eye1=new THREE.Mesh(new THREE.SphereGeometry(0.02,6,4),eyeMat);eye1.position.set(-0.04,0.37,0.2);npcGroup.add(eye1);
  const eye2=eye1.clone();eye2.position.x=0.04;npcGroup.add(eye2);

  // Position near blocked hotspot
  const hs=objects[hsId];
  if(hs){npcGroup.position.copy(hs.group.position);npcGroup.position.x+=0.5;npcGroup.position.z+=0.3}
  else{npcGroup.position.set(0,0,0)}

  scene.add(npcGroup);

  // Idle bob
  const by=npcGroup.position.y;
  animCBs.push(function npcBob(dt,t){
    if(!npcGroup)return;
    npcGroup.position.y=by+Math.sin(t*2)*0.02;
    npcGroup.rotation.y=Math.sin(t*0.5)*0.1;
  });
}

function hideNPC(){if(npcGroup){scene.remove(npcGroup);npcGroup=null}}

// ═══════════════════════════════════════════════════════
// ATMOSPHERE — lighting, fog, particles
// ═══════════════════════════════════════════════════════

function buildAtmosphere(visual,palette){
  const lighting=visual.lighting||'dim';
  const accent=new THREE.Color(visual.accentLightColor||palette.accent||'#fff');
  const ambInt={dim:0.4,flickering:0.3,bright:0.6,colored:0.45,moonlit:0.3,firelit:0.25};

  scene.add(new THREE.AmbientLight(0xffffff,ambInt[lighting]||0.4));
  scene.add(new THREE.HemisphereLight(accent.clone().multiplyScalar(0.3),new THREE.Color(palette.floor||'#111'),0.2));

  const main=new THREE.PointLight(0xffeedd,1.2,roomDims.width*2.5);main.position.set(0,roomDims.height-0.3,0);main.castShadow=true;main.shadow.mapSize.set(512,512);scene.add(main);
  scene.add(new THREE.PointLight(accent,0.35,roomDims.width*1.5).position.set(-2,2,-1.5)||scene.children[scene.children.length-1]);
  const al=new THREE.PointLight(accent,0.6,roomDims.width*1.5);al.position.set(-2,2,-1.5);scene.add(al);
  const al2=new THREE.PointLight(new THREE.Color(palette.accent2||'#fff'),0.5,roomDims.width*1.5);al2.position.set(2,1.5,1);scene.add(al2);

  if(lighting==='flickering'||lighting==='firelit'){
    animCBs.push((dt,t)=>{main.intensity=1.2*(0.85+Math.sin(t*9)*0.08+Math.sin(t*14)*0.04+Math.random()*0.06)})}

  scene.fog=new THREE.FogExp2(new THREE.Color(palette.bg||'#080808'),0.03);
  buildParticles(visual.particles||'dust');
  startAmb(visual.lighting);
}

function buildParticles(type){
  if(type==='none')return;
  const count=80,W=roomDims.width,H=roomDims.height,D=roomDims.depth;
  const pos=new Float32Array(count*3),vels=[];
  const isUp=type==='embers'||type==='sparks',isDown=type==='snow'||type==='rain';
  for(let i=0;i<count;i++){
    pos[i*3]=(Math.random()-0.5)*W;pos[i*3+1]=Math.random()*H;pos[i*3+2]=(Math.random()-0.5)*D;
    vels.push({x:(Math.random()-0.5)*0.012,y:isUp?Math.random()*0.012+0.003:isDown?-(Math.random()*0.006+0.002):(Math.random()-0.5)*0.003,z:(Math.random()-0.5)*0.012});
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const colors={dust:'#888',embers:'#ff5500',snow:'#bbccee',rain:'#7788aa',spores:'#55aa33',sparks:'#ffbb00',mist:'#667788'};
  const mat=new THREE.PointsMaterial({color:new THREE.Color(colors[type]||'#888'),size:type==='mist'?0.05:0.02,transparent:true,opacity:type==='mist'?0.1:0.4,depthWrite:false});
  const pts=new THREE.Points(geo,mat);scene.add(pts);
  animCBs.push(()=>{const p=pts.geometry.attributes.position.array;for(let i=0;i<count;i++){p[i*3]+=vels[i].x;p[i*3+1]+=vels[i].y;p[i*3+2]+=vels[i].z;if(p[i*3+1]>H)p[i*3+1]=0;if(p[i*3+1]<0)p[i*3+1]=H;if(Math.abs(p[i*3])>W/2)p[i*3]*=-0.9;if(Math.abs(p[i*3+2])>D/2)p[i*3+2]*=-0.9}pts.geometry.attributes.position.needsUpdate=true});
}

// ═══════════════════════════════════════════════════════
// AMBIENT SOUND — layered oscillators per room
// ═══════════════════════════════════════════════════════

function startAmb(lighting){
  stopAmb();if(ac.state==='suspended')return;
  try{
    const master=ac.createGain();master.gain.value=0.015;master.connect(ac.destination);
    // Base drone
    const o1=ac.createOscillator(),g1=ac.createGain();o1.type='sine';o1.frequency.value=lighting==='firelit'?45:lighting==='colored'?55:50;g1.gain.value=0.8;o1.connect(g1);g1.connect(master);o1.start();
    // LFO for wobble
    const lfo=ac.createOscillator(),lfoG=ac.createGain();lfo.type='sine';lfo.frequency.value=0.15;lfoG.gain.value=1.5;lfo.connect(lfoG);lfoG.connect(o1.frequency);lfo.start();
    // Upper harmonic
    const o2=ac.createOscillator(),g2=ac.createGain();o2.type='sine';o2.frequency.value=lighting==='firelit'?90:lighting==='flickering'?75:100;g2.gain.value=0.3;o2.connect(g2);g2.connect(master);o2.start();
    // Texture layer (filtered noise simulated with detuned oscillator)
    const o3=ac.createOscillator(),g3=ac.createGain();o3.type='sawtooth';o3.frequency.value=lighting==='firelit'?30:40;g3.gain.value=0.05;o3.connect(g3);g3.connect(master);o3.start();
    ambNodes=[{o:o1,g:g1},{o:lfo,g:lfoG},{o:o2,g:g2},{o:o3,g:g3},{g:master}];
  }catch(e){console.warn('Ambient sound failed:',e)}
}

function stopAmb(){ambNodes.forEach(n=>{try{n.o?.stop()}catch{}});ambNodes=[]}

// ═══════════════════════════════════════════════════════
// INTERACTION — raycasting, hover, click
// ═══════════════════════════════════════════════════════

let ray=new THREE.Raycaster(),mouse=new THREE.Vector2(-9,-9),hovered=null,hoverCB=null,clickCB=null;

function initInteraction(onHover,onClick){
  hoverCB=onHover;clickCB=onClick;
  renderer.domElement.addEventListener('mousemove',e=>{const r=renderer.domElement.getBoundingClientRect();mouse.x=((e.clientX-r.left)/r.width)*2-1;mouse.y=-((e.clientY-r.top)/r.height)*2+1});
  renderer.domElement.addEventListener('click',e=>{
    if(dragging)return;ray.setFromCamera(mouse,camera);
    const hits=ray.intersectObjects(objMeshes);
    if(hits.length&&clickCB){const obj=hits[0].object;document.exitPointerLock?.();clickCB(obj.userData.id,obj.userData.hotspot)}
  });
  renderer.domElement.addEventListener('touchend',e=>{if(e.changedTouches.length===1){const t=e.changedTouches[0],r=renderer.domElement.getBoundingClientRect();mouse.x=((t.clientX-r.left)/r.width)*2-1;mouse.y=-((t.clientY-r.top)/r.height)*2+1;ray.setFromCamera(mouse,camera);const h=ray.intersectObjects(objMeshes);if(h.length&&clickCB)clickCB(h[0].object.userData.id,h[0].object.userData.hotspot)}});

  animCBs.push(()=>{
    if(inspecting)return;ray.setFromCamera(mouse,camera);
    const hits=ray.intersectObjects(objMeshes);
    if(hits.length){
      const id=hits[0].object.userData.id;
      if(!hovered||hovered!==id){if(hovered)unhover(hovered);hovered=id;hover(id);if(hoverCB)hoverCB(id,true);renderer.domElement.style.cursor='pointer'}
    }else{
      if(hovered){unhover(hovered);if(hoverCB)hoverCB(hovered,false);hovered=null;renderer.domElement.style.cursor=locked?'none':'crosshair'}
    }
  });
}

function hover(id){
  const e=objects[id];if(!e)return;
  e.label.visible=true;e.glow.intensity=e.originalGlow*4;
  e.group.traverse(c=>{if(c.isMesh&&c.material){c.material.emissiveIntensity=(c.material.emissiveIntensity||0)+0.3}});
  e.group.scale.set(1.06,1.06,1.06);
}

function unhover(id){
  const e=objects[id];if(!e)return;
  e.label.visible=false;e.glow.intensity=e.originalGlow;
  e.group.traverse(c=>{if(c.isMesh&&c.material){c.material.emissiveIntensity=Math.max(0,(c.material.emissiveIntensity||0)-0.3)}});
  e.group.scale.set(1,1,1);
}

// ═══════════════════════════════════════════════════════
// INSPECTION — camera zoom
// ═══════════════════════════════════════════════════════

function zoomTo(id){
  const e=objects[id];if(!e)return;
  inspecting=true;savedPos=camera.position.clone();savedQuat=camera.quaternion.clone();
  const target=e.group.position.clone();target.y+=e.dims[1]*0.4;
  const dir=target.clone().sub(camera.position).normalize();
  const zPos=target.clone().sub(dir.multiplyScalar(1.3));
  zPos.y=Math.max(1.1,target.y);
  const startPos=camera.position.clone();let lerp=0;
  animCBs.push(function zi(dt){if(!inspecting)return;lerp=Math.min(1,lerp+dt*2.8);const t=ease(lerp);camera.position.lerpVectors(startPos,zPos,t);camera.lookAt(target);if(lerp>=1){const i=animCBs.indexOf(zi);if(i!==-1)animCBs.splice(i,1)}});
}

function zoomOut(){
  if(!inspecting||!savedPos)return;
  const startPos=camera.position.clone(),targetPos=savedPos;let lerp=0;
  animCBs.push(function zo(dt){lerp=Math.min(1,lerp+dt*3.5);const t=ease(lerp);camera.position.lerpVectors(startPos,targetPos,t);camera.quaternion.slerpQuaternions(camera.quaternion,savedQuat,t*0.3);if(lerp>=1){inspecting=false;const eu=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');tYaw=yaw=eu.y;tPitch=pitch=eu.x;const i=animCBs.indexOf(zo);if(i!==-1)animCBs.splice(i,1)}});
}

function ease(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function makeLabelSprite(text){
  const c=document.createElement('canvas');c.width=512;c.height=56;
  const x=c.getContext('2d');x.fillStyle='rgba(0,0,0,0.85)';x.fillRect(0,0,512,56);
  x.fillStyle='#ffffff';x.font='600 24px monospace';x.textAlign='center';x.textBaseline='middle';
  x.fillText(text.substring(0,28),256,30);
  const t=new THREE.CanvasTexture(c);t.minFilter=THREE.LinearFilter;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false}));
  s.scale.set(1.6,0.18,1);return s;
}

function parseRGBA(str){const m=str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);if(m){const a=str.match(/,([\d.]+)\)/)?.[1]||'1';return{color:new THREE.Color(+m[1]/255,+m[2]/255,+m[3]/255),alpha:parseFloat(a)}}return{color:new THREE.Color('#fff'),alpha:0.2}}

function addCrosshair(){const d=document.createElement('div');d.id='xhair';d.style.cssText='position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:20px;height:20px;pointer-events:none;z-index:5;opacity:0.35';d.innerHTML='<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="3" fill="none" stroke="white" stroke-width="1"/><line x1="10" y1="1" x2="10" y2="6" stroke="white" stroke-width="0.7"/><line x1="10" y1="14" x2="10" y2="19" stroke="white" stroke-width="0.7"/><line x1="1" y1="10" x2="6" y2="10" stroke="white" stroke-width="0.7"/><line x1="14" y1="10" x2="19" y2="10" stroke="white" stroke-width="0.7"/></svg>';container.appendChild(d)}

// ═══════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════

window.Renderer={
  init(el){init(el)},
  loadRoom(visual,hsData,palette,callbacks){
    clearScene();
    camera.position.set(0,1.6,3);tYaw=yaw=0;tPitch=pitch=0;inspecting=false;
    buildRoom(palette);
    buildAtmosphere(visual||{},palette);
    (hsData||[]).forEach(hs=>createObject(hs));
    initInteraction(callbacks?.onHover,callbacks?.onClick);
    entrancePan();
  },
  zoomToObject(id){zoomTo(id)},
  zoomOut(){zoomOut()},
  resetView(){
    if(inspecting){inspecting=false}
    camera.position.set(0,1.6,3);tYaw=yaw=0;tPitch=pitch=0;
    camera.quaternion.setFromEuler(new THREE.Euler(0,0,0,'YXZ'));
  },
  isZoomed(){return inspecting},

  // Room state change animations
  openDoor(id){animateDoorOpen(id)},
  fillPedestal(id,color){animatePedestalFill(id,color)},
  pickupAnim(id){animatePickup(id)},

  // NPC
  showNPC(hsId){showNPC(hsId)},
  hideNPC(){hideNPC()},

  // Relevance dimming
  setRelevance(ids){
    Object.entries(objects).forEach(([id,e])=>{
      const rel=ids.includes(id);
      e.group.traverse(c=>{if(c.isMesh){c.material.opacity=rel?1:0.35;c.material.transparent=!rel}});
      e.glow.intensity=rel?e.originalGlow*1.5:e.originalGlow*0.15;
    });
  },
  clearRelevance(){Object.values(objects).forEach(e=>{e.group.traverse(c=>{if(c.isMesh){c.material.opacity=1;c.material.transparent=false}});e.glow.intensity=e.originalGlow})},
  nudgeObject(id){
    const e=objects[id];if(!e)return;let t=0;
    animCBs.push(function nd(dt){t+=dt*3;e.glow.intensity=e.originalGlow+Math.sin(t)*1.5;if(t>10){e.glow.intensity=e.originalGlow;const i=animCBs.indexOf(nd);if(i!==-1)animCBs.splice(i,1)}});
  },
  flashObject(id,color){
    const e=objects[id];if(!e)return;
    e.group.traverse(c=>{if(c.isMesh)c.material.emissive=new THREE.Color(color||'#ff0')});
    e.glow.intensity=3;e.glow.color=new THREE.Color(color||'#ff0');
    setTimeout(()=>{e.group.traverse(c=>{if(c.isMesh)c.material.emissive=new THREE.Color(e.data.visual?.secondaryColor||'#222').multiplyScalar(0.1)});e.glow.intensity=e.originalGlow},700);
  },
  resumeAudio(){if(ac.state==='suspended')ac.resume()},
  dispose(){running=false;clearScene();if(renderer){renderer.dispose();renderer.domElement.remove()}window.removeEventListener('resize',onResize)}
};
})();
