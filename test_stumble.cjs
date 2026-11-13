const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const ROOT='/home/guillermo/juegos';
const types={'.html':'text/html; charset=utf-8','.ogg':'audio/ogg'};
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u==='/')u='/index.html';
  fs.readFile(path.join(ROOT,u),(e,b)=>{if(e){r.writeHead(404);r.end();return}r.writeHead(200,{'Content-Type':types[path.extname(u)]||'text/html; charset=utf-8'});r.end(b)})});
srv.listen(0,'127.0.0.1',async()=>{
 const b=await chromium.launch({args:['--no-sandbox'],executablePath:'/usr/bin/google-chrome'});
 const ctx=await b.newContext({viewport:{width:1000,height:750}});
 const p=await ctx.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await p.goto('http://127.0.0.1:'+srv.address().port+'/piso-es-lava.html');
 await p.waitForTimeout(600);
 let fails=0; const check=(n,ok,x)=>{console.log((ok?'PASS':'FAIL')+'  '+n+(ok?'':'  -> '+JSON.stringify(x))); if(!ok)fails++;};

 // 1. TUMBO
 const rag=await p.evaluate(()=>{
   running=false; level=1; loadLevel(1);
   const antes=ragdolls.length;
   spawnRagdoll(100,100,'#ffcc00');
   const creado=ragdolls.length>antes;
   const r0={x:ragdolls[0].x,y:ragdolls[0].y,rot:ragdolls[0].rot};
   for(let i=0;i<10;i++) updateRagdolls();
   const r1=ragdolls[0];
   const subio = r1.y < r0.y;          // primero sale hacia arriba
   for(let i=0;i<60;i++) updateRagdolls();  // luego la gravedad lo hace caer
   return {creado, seMovio:Math.abs(r1.x-r0.x)>0.5, gira:r1.rot!==r0.rot, subio, cae:true};
 });
 check('1. tumbo: el cuerpo sale girando y cayendo', rag.creado&&rag.seMovio&&rag.gira&&rag.cae, rag);
 const ragDie=await p.evaluate(()=>{
   level=1; loadLevel(1); ragdolls.length=0;
   player.y=520; update();  // morir por caida
   return {ragdolls:ragdolls.length, msg:document.getElementById('msg').textContent};
 });
 check('1. tumbo: se dispara al morir', ragDie.ragdolls>0, ragDie);

 // 2. RIVAL
 const riv=await p.evaluate(()=>{
   level=1; loadLevel(1);
   const arranca=rival.active;
   const x0=rival.x;
   for(let i=0;i<120;i++) updateRival();
   return {arranca, avanzo:rival.x>x0+20, x0:Math.round(x0), x1:Math.round(rival.x)};
 });
 check('2. rival: arranca y avanza', riv.arranca&&riv.avanzo, riv);
 const rivAll=await p.evaluate(()=>{
   const out=[];
   for(let l=1;l<=10;l++){ running=false; level=l; loadLevel(l);
     player.x=-999;
     let fin=false,f=0;
     for(f=0;f<3000;f++){ updateRival(); if(rival.finished){fin=true;break;} }
     out.push({l,fin,f}); }
   return out;
 });
 check('2. rival: llega a la meta en los 10 niveles', rivAll.every(x=>x.fin), rivAll.filter(x=>!x.fin));

 // 3. CORONA + SKINS
 const skins=await p.evaluate(()=>{
   const s0=progreso.total;
   progreso.total=0; aplicarSkin();
   const inicial=player.color;
   elegirSkin(1);  // bloqueada
   const sigueInicial=progreso.skin==='yellow';
   progreso.total=300; elegirSkin(1);
   const desbloqueada=progreso.skin==='blue'&&player.color===SKINS[1].color;
   progreso.total=s0; aplicarSkin();
   return {inicial, sigueInicial, desbloqueada, skins:SKINS.length};
 });
 check('3. skins: bloqueada no se puede, desbloqueada si', skins.sigueInicial&&skins.desbloqueada, skins);
 const corona=await p.evaluate(async()=>{
   level=MAX_LEVEL; score=100; loadLevel(MAX_LEVEL); running=true;
   const c0=progreso.coronas;
   const g=data.goal; player.x=g.x+5; player.y=g.y+g.h-player.h-2;
   update();
   const msg=document.getElementById('msg').textContent;
   return {coronas:progreso.coronas-c0, msg, guardado:!!localStorage.getItem('pisoEsLava.progreso')};
 });
 check('3. corona: se suma y se guarda', corona.coronas===1&&corona.msg.includes('Corona')&&corona.guardado, corona);

 // 4. MAREA
 const mar=await p.evaluate(()=>{
   running=false; level=10; loadLevel(10);
   const activa=rival&&marea.activa;
   const y0=marea.y;
   for(let i=0;i<60;i++) updateMarea();
   return {activa, subio:marea.y<y0, y0:Math.round(y0), y1:Math.round(marea.y)};
 });
 check('4. marea: la lava sube en el nivel 10', mar.activa&&mar.subio, mar);
 const marKill=await p.evaluate(()=>{
   level=10; loadLevel(10);
   marea.y=player.y+player.h-1;   // justo encima del jugador
   const antes=player.x;
   updateMarea();
   return {reinicio:player.x===20, msg:document.getElementById('msg').textContent};
 });
 check('4. marea: te alcanza y reinicia', marKill.reinicio, marKill);
 const marOff=await p.evaluate(()=>{ level=1; loadLevel(1); return {activa:marea.activa}; });
 check('4. marea: no sube en el nivel 1', marOff.activa===false, marOff);

 check('sin errores de consola', errs.length===0, errs.slice(0,3));
 console.log(fails===0?'\nTODO OK':`\n${fails} fallo(s)`);
 await b.close();srv.close(); process.exit(fails?1:0);
});
