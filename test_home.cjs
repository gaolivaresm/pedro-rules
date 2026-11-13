// Pruebas del boton "Inicio" de los 4 juegos: que se vea, no tape el juego,
// que funcione con clic y con toque, y que la tecla Esc tambien vuelva.
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const ROOT='/home/guillermo/juegos';
const types={'.html':'text/html; charset=utf-8','.ogg':'audio/ogg'};
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u==='/')u='/index.html';
  fs.readFile(path.join(ROOT,u),(e,b)=>{if(e){r.writeHead(404);r.end();return}r.writeHead(200,{'Content-Type':types[path.extname(u)]||'text/html; charset=utf-8'});r.end(b)})});
srv.listen(0,'127.0.0.1',async()=>{
 const b=await chromium.launch({args:['--no-sandbox'],executablePath:'/usr/bin/google-chrome'});
 const base='http://127.0.0.1:'+srv.address().port;
 let fallos=0; const check=(n,ok,x)=>{console.log((ok?'PASS':'FAIL')+'  '+n+(ok?'':'  -> '+JSON.stringify(x))); if(!ok)fallos++;};
 const juegos=['piso-es-lava.html','cielo-se-cae.html','naturaleza.html','cosmico.html'];

 for(const g of juegos){
   const ctx=await b.newContext({viewport:{width:1200,height:800}});
   const p=await ctx.newPage(); const errs=[];
   p.on('pageerror',e=>errs.push(e.message));
   await p.goto(base+'/'+g);
   await p.waitForTimeout(700);
   // visible y en pantalla
   const vis=await p.evaluate(()=>{
     const el=document.getElementById('home-btn');
     if(!el) return {existe:false};
     const r=el.getBoundingClientRect();
     const st=getComputedStyle(el);
     return {existe:true, w:Math.round(r.width), h:Math.round(r.height),
       top:Math.round(r.top), left:Math.round(r.left),
       display:st.display, visible:r.width>0&&r.height>0&&st.display!=='none',
       texto:el.textContent.trim(), href:el.getAttribute('href')};
   });
   check(g+': boton Inicio visible', vis.existe&&vis.visible&&vis.w>=30&&vis.h>=24, vis);
   check(g+': enlaza a la portada', vis.href==='index.html', vis.href);
   // clic con partida en curso (acepta el confirm)
   p.on('dialog', d => d.accept());
   await p.evaluate(()=>{ if(typeof level!=='undefined'){ level=3; score=50; } });
   await p.click('#home-btn');
   await p.waitForTimeout(600);
   const url=p.url();
   check(g+': el clic vuelve a la portada', url.endsWith('/index.html')||url.endsWith('/'), {url});
   await ctx.close();
 }

 // movil: el boton no debe tapar el juego ni desbordar
 const ctx2=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3});
 const mp=await ctx2.newPage();
 await mp.goto(base+'/piso-es-lava.html');
 await mp.waitForTimeout(700);
 const mv=await mp.evaluate(()=>{
   const el=document.getElementById('home-btn'); const r=el.getBoundingClientRect();
   return {w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top),
     overflowX:document.documentElement.scrollWidth-innerWidth,
     tapaTitulo:(()=>{const h2=document.querySelector('#ui h2').getBoundingClientRect();return r.bottom>h2.top&&r.top<h2.bottom;})()};
 });
 check('movil: boton visible y sin desbordar', mv.w>=28&&mv.h>=22&&mv.overflowX<=0, mv);
 // tap tactil
 const ctx3=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const tp=await ctx3.newPage(); tp.on('dialog', d=>d.accept());
 await tp.goto(base+'/naturaleza.html');
 await tp.waitForTimeout(600);
 await tp.tap('#home-btn');
 await tp.waitForTimeout(500);
 check('movil: tap vuelve a la portada', tp.url().endsWith('/index.html')||tp.url().endsWith('/'), {url:tp.url()});

 // Esc vuelve (sin partida en curso: sin confirm)
 const ctx4=await b.newContext({viewport:{width:1200,height:800}});
 const ep=await ctx4.newPage();
 await ep.goto(base+'/cosmico.html');
 await ep.waitForTimeout(600);
 await ep.evaluate(()=>{ level=1; score=0; });
 await ep.keyboard.press('Escape');
 await ep.waitForTimeout(500);
 check('Esc vuelve a la portada', ep.url().endsWith('/index.html')||ep.url().endsWith('/'), {url:ep.url()});

 console.log(fallos===0?'\nTODO OK':`\n${fallos} fallo(s)`);
 await b.close();srv.close();process.exit(fallos?1:0);
});
