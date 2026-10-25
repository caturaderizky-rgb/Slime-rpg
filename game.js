const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
const $ = id => document.getElementById(id);
const W = canvas.width, H = canvas.height, TILE = 20;

const AREAS = [
  {name:"EMERALD WILDS",ground:"#4f9855",light:"#65ad61",dark:"#397447",accent:"#b5df78",enemy:"slime",count:5,intro:"Emerald Wilds — hutan mungil penuh rahasia!"},
  {name:"CURSED FOREST",ground:"#443b75",light:"#5b4b8c",dark:"#302c59",accent:"#db8bff",enemy:"mushroom",count:6,intro:"Cursed Forest — kabut ungu menyembunyikan monster!"},
  {name:"DRAGON'S REMAINS",ground:"#70463d",light:"#945444",dark:"#49313b",accent:"#ff9a50",enemy:"golem",count:1,intro:"Dragon's Remains — kalahkan penjaga naga!"}
];
const CARD_POOL = [
  {name:"Pedang Tajam",desc:"+1 damage untuk semua serangan.",apply:()=>player.damageBonus++},
  {name:"Sepatu Angin",desc:"Kecepatan bergerak +18%.",apply:()=>player.speed*=1.18},
  {name:"Jantung Hijau",desc:"Pulihkan 30 HP dan tambah HP maksimum 10.",apply:()=>{player.maxHp+=10;player.hp=Math.min(player.maxHp,player.hp+30)}},
  {name:"Jangkauan Panjang",desc:"Jarak serangan bertambah 12.",apply:()=>player.rangeBonus+=12},
  {name:"Kulit Baja",desc:"Damage yang diterima berkurang 2.",apply:()=>player.armor=Math.min(5,player.armor+2)},
  {name:"Koin Magnet",desc:"Koin bisa diambil dari jarak lebih jauh.",apply:()=>player.magnet+=28}
];

let player, enemies, coins, particles, slashes, areaIndex=0, kills=0, totalCoins=0;
let joystickX=0,joystickY=0,joyPointer=null,attacking=false,gameOver=false,pausedForCard=false;
let lastTime=0,attackCooldown=0,comboStage=0,comboTimer=0,shake=0,worldTime=0,messageTimer=0,messageText="";
let areaKills=0,spawned=0,gateOpen=false,keys=new Set(),cardChoices=[];

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const rand=(min,max)=>Math.random()*(max-min)+min;
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function setMessage(text,duration=1.8){messageText=text;messageTimer=duration;$("message").textContent=text}
function resetStick(){joystickX=0;joystickY=0;const stick=$("stick");if(stick)stick.style.transform="translate(-50%,-50%)"}
function burst(x,y,color,amount=8,force=65){
  for(let i=0;i<amount;i++){const a=Math.random()*Math.PI*2,s=rand(force*.3,force);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.18,.42),maxLife:.42,size:Math.random()<.5?2:3,color})}
}
function makeEnemy(type){
  let e={x:rand(28,W-28),y:rand(30,H-30),type,hp:3,maxHp:3,speed:rand(25,35),hit:0,flash:0,attackTimer:rand(.5,1.4),knockX:0,knockY:0,wobble:rand(0,6.28),shotTimer:rand(1.2,2.4),boss:type==="golem"};
  if(type==="mushroom"){e.hp=e.maxHp=4;e.speed=24}
  if(type==="bat"){e.hp=e.maxHp=3;e.speed=44}
  if(type==="plant"){e.hp=e.maxHp=5;e.speed=19}
  if(type==="golem"){e.hp=e.maxHp=24;e.speed=17;e.x=W/2;e.y=90;e.boss=true}
  let tries=0;while(distance(e,player)<95&&tries++<30){e.x=rand(25,W-25);e.y=rand(25,H-25)}
  return e;
}
function spawnArea(){
  enemies=[];coins=[];particles=[];slashes=[];areaKills=0;spawned=0;gateOpen=false;
  const area=AREAS[areaIndex];
  for(let i=0;i<area.count;i++){let type=area.enemy;if(areaIndex===0&&i===area.count-1)type="plant";if(areaIndex===1&&i%3===1)type="bat";enemies.push(makeEnemy(type));spawned++}
  $("areaName").textContent=`AREA ${areaIndex+1} · ${area.name}`;
  $("areaCount").textContent=`${areaIndex+1}/3`;
  $("areaBar").style.width="0%";
  setMessage(area.intro,3);
}
function resetGame(){
  player={x:W/2,y:H/2,hp:100,maxHp:100,speed:105,facingX:1,facingY:0,anim:0,invincible:0,damageBonus:0,rangeBonus:0,armor:0,magnet:0};
  areaIndex=0;kills=0;totalCoins=0;attackCooldown=0;comboStage=0;comboTimer=0;shake=0;worldTime=0;gameOver=false;pausedForCard=false;
  $("overlay").classList.add("hidden");$("cardOverlay").classList.add("hidden");
  spawnArea();updateHUD();resetStick();draw();
}
function updateHUD(){
  $("hp").textContent=`${Math.ceil(player.hp)}/${player.maxHp}`;
  $("hpBar").style.width=`${player.hp/player.maxHp*100}%`;
  $("coins").textContent=String(totalCoins);
  $("kills").textContent=String(kills);
  $("areaBar").style.width=`${Math.min(100,areaKills/AREAS[areaIndex].count*100)}%`;
}
function chooseCards(){
  pausedForCard=true;cardChoices=[];
  const pool=[...CARD_POOL];
  while(cardChoices.length<3&&pool.length){const i=Math.floor(Math.random()*pool.length);cardChoices.push(pool.splice(i,1)[0])}
  const container=$("cardChoices");container.innerHTML="";
  cardChoices.forEach((card,i)=>{
    const button=document.createElement("button");button.className="card-choice";
    button.innerHTML=`<strong>${i+1}. ${card.name}</strong><span>${card.desc}</span>`;
    button.addEventListener("click",()=>{card.apply();pausedForCard=false;$("cardOverlay").classList.add("hidden");setMessage(`Kartu aktif: ${card.name}`,2);updateHUD()});
    container.appendChild(button);
  });
  $("cardOverlay").classList.remove("hidden");
}
function startAttack(){
  if(gameOver||pausedForCard||attackCooldown>0)return;
  comboStage=comboTimer>0?(comboStage+1)%3:0;comboTimer=.72;
  attackCooldown=comboStage===2?.43:.25;
  const damage=[1,1,2][comboStage]+player.damageBonus,range=[43,47,55][comboStage]+player.rangeBonus;
  const base=Math.atan2(player.facingY,player.facingX),angle=base+[-.48,.48,0][comboStage];
  slashes.push({x:player.x,y:player.y-2,angle,stage:comboStage,life:.2,maxLife:.2,range});
  burst(player.x+Math.cos(angle)*18,player.y+Math.sin(angle)*18,comboStage===2?"#ffe58a":"#d9f8ff",comboStage===2?11:5,45);
  let landed=false;
  for(const e of enemies){
    const dx=e.x-player.x,dy=e.y-player.y,d=Math.hypot(dx,dy);if(d>range+(e.boss?8:0)||d<.01)continue;
    let diff=Math.atan2(dy,dx)-angle;while(diff>Math.PI)diff-=Math.PI*2;while(diff< -Math.PI)diff+=Math.PI*2;
    if(Math.abs(diff)>(comboStage===2?1.12:.84))continue;
    e.hp-=damage;e.hit=.16;e.flash=.1;
    const force=comboStage===2?190:125;e.knockX=Math.cos(angle)*force;e.knockY=Math.sin(angle)*force;
    burst(e.x,e.y,comboStage===2?"#ffe58a":"#f4b5ff",comboStage===2?13:7,comboStage===2?95:65);landed=true;
    if(e.hp<=0){kills++;areaKills++;coins.push({x:e.x,y:e.y,bob:rand(0,6)});burst(e.x,e.y,"#ffcf4f",14,80);setMessage(`${enemyName(e.type)} dikalahkan! +1 koin`)}
  }
  enemies=enemies.filter(e=>e.hp>0);
  if(landed){shake=comboStage===2?7:3.2;if(comboStage===2)setMessage("FINISHER!")}
  else shake=.8;
  if(enemies.length===0&&!gateOpen){gateOpen=true;setMessage(areaIndex<2?"Area bersih! Gerbang terbuka — dekati gerbang.":"Boss tumbang! Petualangan selesai.",3);if(areaIndex===2)winGame()}
  updateHUD();
}
function enemyName(type){return ({slime:"Slime",mushroom:"Jamur",bat:"Kelelawar Bayangan",plant:"Tanaman Pemangsa",golem:"Golem Bara"})[type]||"Monster"}
function damagePlayer(amount){
  if(player.invincible>0||gameOver)return;
  player.hp=Math.max(0,player.hp-Math.max(1,amount-player.armor));player.invincible=.65;shake=5;burst(player.x,player.y,"#ff7185",7,55);updateHUD();
  if(player.hp<=0){gameOver=true;$("overlayTitle").textContent="GAME OVER";$("overlayText").textContent=`Musuh dikalahkan: ${kills} · Koin: ${totalCoins}`;$("overlay").classList.remove("hidden");setMessage("Petualangan berakhir!")}
}
function winGame(){gameOver=true;$("overlayTitle").textContent="PETUALANGAN SELESAI!";$("overlayText").textContent=`Semua area ditaklukkan! Musuh: ${kills} · Koin: ${totalCoins}`;$("overlay").classList.remove("hidden")}
function update(dt){
  if(gameOver||pausedForCard)return;
  worldTime+=dt;attackCooldown=Math.max(0,attackCooldown-dt);comboTimer=Math.max(0,comboTimer-dt);player.invincible=Math.max(0,player.invincible-dt);shake=Math.max(0,shake-dt*24);messageTimer=Math.max(0,messageTimer-dt);if(comboTimer<=0)comboStage=0;
  let mx=joystickX,my=joystickY;
  if(keys.has("arrowleft")||keys.has("a"))mx=-1;else if(keys.has("arrowright")||keys.has("d"))mx=1;
  if(keys.has("arrowup")||keys.has("w"))my=-1;else if(keys.has("arrowdown")||keys.has("s"))my=1;
  const len=Math.hypot(mx,my);if(len>.08){mx/=Math.max(1,len);my/=Math.max(1,len);player.x+=mx*player.speed*dt;player.y+=my*player.speed*dt;player.facingX=mx;player.facingY=my;player.anim+=dt*10}
  player.x=clamp(player.x,14,W-14);player.y=clamp(player.y,20,H-15);
  for(const e of enemies){
    e.hit=Math.max(0,e.hit-dt);e.flash=Math.max(0,e.flash-dt);e.wobble+=dt*5;
    e.x+=e.knockX*dt;e.y+=e.knockY*dt;e.knockX*=Math.pow(.025,dt);e.knockY*=Math.pow(.025,dt);
    const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy)||1;
    if(e.type==="mushroom"){
      if(d>82&&e.hit<=0){e.x+=dx/d*e.speed*dt;e.y+=dy/d*e.speed*dt}
      e.shotTimer-=dt;
      if(e.shotTimer<=0&&d<165){particles.push({x:e.x,y:e.y,vx:dx/d*90,vy:dy/d*90,life:1.2,maxLife:1.2,size:5,color:"#b7ef69",projectile:true});e.shotTimer=2.1}
    }else if(d>(e.boss?32:22)&&e.hit<=0){e.x+=dx/d*e.speed*dt;e.y+=dy/d*e.speed*dt}
    e.x=clamp(e.x,12,W-12);e.y=clamp(e.y,18,H-12);
    if(d<(e.boss?31:23)&&e.attackTimer<=0){damagePlayer(e.boss?15:8);e.attackTimer=e.boss?1.05:.8}
    e.attackTimer-=dt;
  }
  for(const p of particles){
    if(p.projectile){p.x+=p.vx*dt;p.y+=p.vy*dt;if(distance(p,player)<10){p.life=0;damagePlayer(7)}}
    else{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.08,dt);p.vy*=Math.pow(.08,dt)}
    p.life-=dt;
  }
  particles=particles.filter(p=>p.life>0);
  for(const c of coins){c.bob+=dt*5;if(distance(player,c)<17+player.magnet){c.collected=true;totalCoins++;burst(c.x,c.y,"#ffcf4f",8,40);setMessage("Koin didapat!");}}
  coins=coins.filter(c=>!c.collected);
  for(const s of slashes)s.life-=dt;slashes=slashes.filter(s=>s.life>0);
  if(gateOpen&&areaIndex<2&&player.x>W-34&&player.y>H/2-34&&player.y<H/2+34){areaIndex++;spawnArea();chooseCards()}
  updateHUD();
}
function drawTree(x,y,area){
  ctx.fillStyle=areaIndex===2?"#4a302a":"#63442d";ctx.fillRect(x+7,y+11,7,13);
  ctx.fillStyle=areaIndex===1?"#173d31":areaIndex===2?"#6e3429":"#285638";ctx.fillRect(x+1,y+5,20,13);ctx.fillRect(x+4,y,14,18);
  ctx.fillStyle=areaIndex===2?"#c06c3f":"#428b4b";ctx.fillRect(x+4,y+3,7,6);ctx.fillRect(x+12,y+8,5,5);
}
function drawRock(x,y){ctx.fillStyle="#3a5840";ctx.fillRect(x+2,y+12,18,5);ctx.fillStyle=areaIndex===2?"#865544":"#596b73";ctx.fillRect(x+3,y+5,14,10);ctx.fillRect(x+6,y+2,8,4);ctx.fillStyle="#a3b5b5";ctx.fillRect(x+6,y+5,4,3)}
function drawBackground(){
  const a=AREAS[areaIndex];ctx.fillStyle=a.ground;ctx.fillRect(0,0,W,H);
  for(let y=0;y<H;y+=TILE)for(let x=0;x<W;x+=TILE){const n=Math.abs(Math.sin(x*12.9898+y*78.233)*43758.5453)%1;ctx.fillStyle=n>.52?a.light:a.dark;ctx.fillRect(x,y,TILE,TILE);if(n>.66){ctx.fillStyle=a.accent;ctx.fillRect(x+4,y+5,2,3);ctx.fillRect(x+7,y+8,2,2)}}
  // winding path with tiny highlights
  for(let i=0;i<8;i++){const x=74+i*20,y=170+Math.sin(i*.8)*18;ctx.fillStyle=areaIndex===2?"#5a4140":areaIndex===1?"#655a79":"#b8a16c";ctx.fillRect(x,y,22,15);ctx.fillStyle="rgba(255,255,255,.12)";ctx.fillRect(x+3,y+2,8,2)}
  function tree(x,y){ctx.fillStyle="#594332";ctx.fillRect(x+7,y+13,7,15);const c=areaIndex===0?["#276544","#33804a","#54a65a"]:areaIndex===1?["#282d55","#39366e","#654b91"]:["#55352f","#743b31","#a65035"];ctx.fillStyle=c[0];ctx.fillRect(x+1,y+7,21,15);ctx.fillRect(x+5,y+1,14,20);ctx.fillStyle=c[1];ctx.fillRect(x+4,y+4,13,10);ctx.fillRect(x+1,y+10,8,7);ctx.fillStyle=c[2];ctx.fillRect(x+7,y+3,6,5);ctx.fillRect(x+15,y+12,4,4);if(areaIndex===1){ctx.fillStyle="#e2a5ff";ctx.fillRect(x+9,y+7,3,3)}if(areaIndex===2){ctx.fillStyle="#ff9a50";ctx.fillRect(x+5,y+10,3,3)}}
  tree(12,24);tree(W-40,35);tree(18,H-62);tree(W-42,H-66);tree(42,126);
  for(let i=0;i<12;i++){const x=(i*47+15)%W,y=(i*61+42)%H;if(i%3===0){ctx.fillStyle=areaIndex===2?"#473a3c":"#5d6e69";ctx.fillRect(x,y+3,10,7);ctx.fillRect(x+2,y,6,4);ctx.fillStyle="#9eb2a0";ctx.fillRect(x+3,y+2,3,2)}else if(i%3===1){ctx.fillStyle=areaIndex===1?"#e59aff":areaIndex===2?"#ff9b45":"#fff1a3";ctx.fillRect(x+2,y,3,3);ctx.fillRect(x,y+3,3,3);ctx.fillRect(x+4,y+3,3,3);ctx.fillStyle="#4b693a";ctx.fillRect(x+3,y+5,2,4)}else{ctx.fillStyle=areaIndex===1?"#a85bd1":areaIndex===2?"#e56a3d":"#4b9ee5";ctx.fillRect(x,y+2,10,4);ctx.fillRect(x+2,y,6,3);ctx.fillStyle="#f5e9ff";ctx.fillRect(x+3,y+2,2,2);ctx.fillStyle="#e7d9b9";ctx.fillRect(x+4,y+6,3,5)}}
  ctx.fillStyle="#202a34";ctx.fillRect(W-24,H/2-30,20,60);ctx.fillStyle=gateOpen?"#ffe89a":"#3d514b";ctx.fillRect(W-21,H/2-26,14,52);if(gateOpen&&areaIndex<2){ctx.fillStyle="#fff6c2";ctx.fillRect(W-18,H/2-20,8,40);ctx.fillStyle="#fff";ctx.font="7px monospace";ctx.fillText("NEXT",W-45,H/2+42)}
}

function drawPlayer(){
  const x=Math.round(player.x),y=Math.round(player.y);if(player.invincible>0&&Math.floor(worldTime*18)%2)return;
  const moving=Math.hypot(joystickX,joystickY)>.08||keys.size>0,step=moving?Math.sin(player.anim*1.4)*2:Math.sin(worldTime*2)*.4;
  ctx.fillStyle="rgba(20,28,35,.34)";ctx.fillRect(x-9,y+10,18,5);
  ctx.fillStyle="#29364c";ctx.fillRect(x-7,y+4+step,5,7);ctx.fillRect(x+2,y+4-step,5,7);ctx.fillStyle="#8e9db9";ctx.fillRect(x-7,y+8+step,5,2);ctx.fillRect(x+2,y+8-step,5,2);
  ctx.fillStyle="#253d75";ctx.fillRect(x-8,y-6,16,13);ctx.fillRect(x-10,y-3,4,8);ctx.fillStyle="#3f72c7";ctx.fillRect(x-6,y-7,11,12);ctx.fillRect(x-4,y-4,7,6);ctx.fillStyle="#f2d9a2";ctx.fillRect(x-3,y+1,7,3);ctx.fillStyle="#dce8f7";ctx.fillRect(x-9,y-5,4,4);ctx.fillRect(x+5,y-5,4,4);
  ctx.fillStyle="#efbd91";ctx.fillRect(x-6,y-15,12,10);ctx.fillRect(x-4,y-17,8,3);ctx.fillStyle="#49352f";ctx.fillRect(x-7,y-19,14,5);ctx.fillRect(x-8,y-16,4,7);ctx.fillRect(x+4,y-16,4,4);ctx.fillStyle="#60463b";ctx.fillRect(x-4,y-20,7,3);ctx.fillRect(x+1,y-18,5,3);ctx.fillStyle="#182a43";ctx.fillRect(x+(player.facingX>=0?2:-4),y-12,2,3);ctx.fillStyle="#fff4dc";ctx.fillRect(x+(player.facingX>=0?2:-4),y-12,1,1);
  const sx=x+player.facingX*8,sy=y+player.facingY*3;ctx.strokeStyle="#d8eaff";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+player.facingX*12-player.facingY*5,sy+player.facingY*12+player.facingX*5);ctx.stroke();ctx.strokeStyle="#fff";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(sx+2,sy);ctx.lineTo(sx+player.facingX*9-player.facingY*4,sy+player.facingY*9+player.facingX*4);ctx.stroke();ctx.fillStyle="#d5ad68";ctx.fillRect(sx-2,sy-2,4,3);
}

function drawEnemy(e){
  const x=Math.round(e.x),y=Math.round(e.y+Math.sin(e.wobble)*1.5);ctx.fillStyle="rgba(20,20,30,.3)";ctx.fillRect(x-(e.boss?18:10),y+9,e.boss?36:20,5);
  if(e.type==="slime") {ctx.fillStyle=e.flash>0?"#fff":(areaIndex===0?"#82e86e":"#5dc9f7");ctx.fillRect(x-10,y-4,20,13);ctx.fillRect(x-7,y-8,14,5);ctx.fillRect(x-13,y+2,4,5);ctx.fillRect(x+9,y+2,4,5);ctx.fillStyle="#d7f7ff";ctx.fillRect(x-6,y-5,5,3);ctx.fillRect(x+3,y-5,4,3);ctx.fillStyle="#26334b";ctx.fillRect(x-5,y,3,4);ctx.fillRect(x+3,y,3,4);ctx.fillStyle="#fff";ctx.fillRect(x-4,y,1,1);ctx.fillRect(x+4,y,1,1)}
  else if(e.type==="mushroom"){ctx.fillStyle=e.flash>0?"#fff":"#f0dfbd";ctx.fillRect(x-6,y-2,12,11);ctx.fillRect(x-8,y+3,16,5);ctx.fillStyle="#d95dca";ctx.fillRect(x-12,y-9,24,8);ctx.fillRect(x-8,y-13,16,5);ctx.fillStyle="#ffb5f2";ctx.fillRect(x-6,y-7,4,3);ctx.fillRect(x+4,y-5,3,3);ctx.fillStyle="#392b4c";ctx.fillRect(x-4,y+1,2,3);ctx.fillRect(x+3,y+1,2,3)}
  else if(e.type==="bat"){ctx.fillStyle=e.flash>0?"#fff":"#7460b8";ctx.fillRect(x-4,y-4,8,9);ctx.fillRect(x-12,y-7,8,5);ctx.fillRect(x+4,y-7,8,5);ctx.fillRect(x-15,y-11,5,5);ctx.fillRect(x+10,y-11,5,5);ctx.fillStyle="#42335e";ctx.fillRect(x-14,y-3,5,8);ctx.fillRect(x+9,y-3,5,8);ctx.fillStyle="#ff9fb6";ctx.fillRect(x-4,y-2,2,2);ctx.fillRect(x+3,y-2,2,2)}
  else if(e.type==="plant"){ctx.fillStyle="#397b45";ctx.fillRect(x-5,y-2,10,12);ctx.fillRect(x-12,y-4,8,4);ctx.fillRect(x+4,y-7,8,4);ctx.fillStyle=e.flash>0?"#fff":"#65bf58";ctx.fillRect(x-8,y-9,16,10);ctx.fillStyle="#e5f69a";ctx.fillRect(x-5,y-7,3,3);ctx.fillRect(x+3,y-7,3,3);ctx.fillStyle="#2e4939";ctx.fillRect(x-4,y-1,8,3);ctx.fillStyle="#ffcf70";ctx.fillRect(x-3,y+1,2,2);ctx.fillRect(x+2,y+1,2,2);ctx.fillStyle="#6fcf69";ctx.fillRect(x-11,y-12,5,5);ctx.fillRect(x+6,y-14,5,5)}
  else{ctx.fillStyle=e.flash>0?"#fff":"#a95b43";ctx.fillRect(x-15,y-12,30,26);ctx.fillRect(x-20,y-6,8,16);ctx.fillRect(x+12,y-6,8,16);ctx.fillStyle="#70433c";ctx.fillRect(x-12,y-17,8,7);ctx.fillRect(x+4,y-17,8,7);ctx.fillStyle="#d78352";ctx.fillRect(x-10,y-8,20,16);ctx.fillRect(x-13,y-3,5,9);ctx.fillRect(x+8,y-3,5,9);ctx.fillStyle="#ffe17c";ctx.fillRect(x-8,y-5,5,5);ctx.fillRect(x+4,y-5,5,5);ctx.fillStyle="#4b3034";ctx.fillRect(x-5,y+5,10,3);ctx.fillStyle="#f7a34d";ctx.fillRect(x-2,y-13,4,4)}
  const bw=e.boss?42:24,by=y-(e.boss?25:17);ctx.fillStyle="#292738";ctx.fillRect(x-bw/2,by,bw,4);ctx.fillStyle=e.boss?"#ff6a4d":"#ff7185";ctx.fillRect(x-bw/2,by,bw*clamp(e.hp/e.maxHp,0,1),3);if(e.boss){ctx.fillStyle="#ffe3a0";ctx.font="7px monospace";ctx.textAlign="center";ctx.fillText("GOLEM BARA",x,by-3);ctx.textAlign="left"}
}

function drawCoins(){for(const c of coins){const y=Math.round(c.y+Math.sin(c.bob)*2);ctx.fillStyle="#8c5c23";ctx.fillRect(c.x-4,y-5,9,10);ctx.fillStyle="#ffcf4f";ctx.fillRect(c.x-4,y-6,8,10);ctx.fillStyle="#fff1a0";ctx.fillRect(c.x-2,y-4,3,4)}}
function drawSlashes(){for(const s of slashes){const alpha=1-(1-s.life/s.maxLife);ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.angle);ctx.globalAlpha=alpha;ctx.lineCap="square";if(s.stage===0){ctx.strokeStyle="#e7fbff";ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,25,-.9,.8);ctx.stroke();ctx.strokeStyle="#83dfff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,30,-.7,.5);ctx.stroke()}else if(s.stage===1){ctx.strokeStyle="#fff";ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(10,-28);ctx.lineTo(34,4);ctx.stroke();ctx.strokeStyle="#8de8ff";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(15,-30);ctx.lineTo(38,0);ctx.stroke()}else{ctx.strokeStyle="#fff5ad";ctx.lineWidth=8;ctx.beginPath();ctx.arc(3,0,35,-1.15,1.15);ctx.stroke();ctx.strokeStyle="#fff";ctx.lineWidth=3;ctx.beginPath();ctx.arc(3,0,42,-.9,.9);ctx.stroke()}ctx.restore()}ctx.globalAlpha=1}
function drawParticles(){for(const p of particles){ctx.globalAlpha=clamp(p.life/p.maxLife,0,1);ctx.fillStyle=p.color;ctx.fillRect(Math.round(p.x),Math.round(p.y),p.size,p.size)}ctx.globalAlpha=1}
function draw(){
  ctx.clearRect(0,0,W,H);ctx.save();if(shake>0)ctx.translate(rand(-shake,shake),rand(-shake,shake));drawBackground();
  const actors=[...enemies.map(e=>({y:e.y,type:"enemy",obj:e})),{y:player.y,type:"player",obj:player}].sort((a,b)=>a.y-b.y);
  drawCoins();for(const a of actors){if(a.type==="enemy")drawEnemy(a.obj);else drawPlayer()}drawSlashes();drawParticles();ctx.restore();
  if(messageTimer>0&&messageText){ctx.font="bold 10px monospace";ctx.textAlign="center";ctx.fillStyle="#263b2a";ctx.fillRect(W/2-105,8,210,19);ctx.fillStyle="#fff";ctx.fillText(messageText,W/2,21);ctx.textAlign="left"}
}
function loop(time){const dt=Math.min((time-lastTime)/1000||0,.04);lastTime=time;update(dt);draw();requestAnimationFrame(loop)}

const joyBase=$("joystick"),joyStick=$("stick");
function moveJoystick(e){if(joyPointer!==e.pointerId)return;const r=joyBase.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,max=r.width*.32;let dx=e.clientX-cx,dy=e.clientY-cy,d=Math.hypot(dx,dy);if(d>max){dx=dx/d*max;dy=dy/d*max}joystickX=dx/max;joystickY=dy/max;joyStick.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`}
function stopJoystick(e){if(joyPointer!==e.pointerId)return;joyPointer=null;resetStick()}
joyBase.addEventListener("pointerdown",e=>{joyPointer=e.pointerId;joyBase.setPointerCapture(e.pointerId);moveJoystick(e)});
joyBase.addEventListener("pointermove",moveJoystick);joyBase.addEventListener("pointerup",stopJoystick);joyBase.addEventListener("pointercancel",stopJoystick);
$("attack").addEventListener("pointerdown",e=>{e.preventDefault();startAttack()});
window.addEventListener("keydown",e=>{keys.add(e.key.toLowerCase());if([" ","arrowup","arrowdown","arrowleft","arrowright"].includes(e.key.toLowerCase()))e.preventDefault();if(e.key===" "||e.key.toLowerCase()==="j")startAttack()});
window.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
$("restart").addEventListener("click",resetGame);$("playAgain").addEventListener("click",resetGame);
resetGame();requestAnimationFrame(loop);
