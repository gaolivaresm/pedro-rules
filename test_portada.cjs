// Pruebas de la portada del sitio (index.html): las dos tarjetas se ven en
// escritorio, movil y tablet, sin scroll horizontal, y cada enlace abre su juego
// con la musica cargando. Tambien simula el sitio servido en una subcarpeta
// (como podria quedar en Netlify).
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const ROOT='/home/guillermo/juegos';
const types={'.html':'text/html; charset=utf-8','.ogg':'audio/ogg','.png':'image/png','.rbs':'application/octet-stream','.toml':'text/plain'};
const srv=http.createServer((q,r)=>{
  let p=decodeURIComponent(q.url.split('?')[0]); if(p==='/')p='/index.html';
  const f=path.join(ROOT,p);
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return}
    r.writeHead(200,{'Content-Type':types[path.extname(f)]||'text/html; charset=utf-8'});r.end(b)});
});
srv.listen(0,'127.0.0.1',async()=>{
 const port=srv.address().port;
 const b=await chromium.launch({args:['--no-sandbox'],executablePath:'/usr/bin/google-chrome'});
 console.log('=== PORTADA ===');
 for(const [name,w,h] of [['escritorio',1280,800],['movil',390,844],['tablet',768,1024]]){
   const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:w<900,hasTouch:w<900});
   const p=await ctx.newPage();
   const errs=[]; p.on('pageerror',e=>errs.push(e.message));
   await p.goto('http://127.0.0.1:'+port+'/index.html');
   await p.waitForTimeout(400);
   const m=await p.evaluate(()=>{
     const cards=[...document.querySelectorAll('.card')].map(a=>{const r=a.getBoundingClientRect();return {href:a.getAttribute('href'),w:Math.round(r.width),h:Math.round(r.height),visible:r.width>150}});
     return {title:document.title, cards, cardsCount:cards.length,
       overflowX:document.documentElement.scrollWidth-innerWidth,
       overflowY:document.documentElement.scrollHeight-innerHeight,
       h1:document.querySelector('h1').textContent.trim()};
   });
   const ok = m.cardsCount===4 && m.cards.every(c=>c.visible) && m.overflowX<=0;
   console.log((ok?'PASS':'FAIL'), name.padEnd(11), '| tarjetas:', m.cards.map(c=>c.href+' '+c.w+'x'+c.h).join(' | '), '| scrollX', m.overflowX, '| scrollY', m.overflowY, errs.length?('ERR '+errs):'');
   await ctx.close();
 }
 console.log('\n=== NAVEGACION: index -> juego ===');
 for(const game of ['piso-es-lava.html','cielo-se-cae.html','naturaleza.html','cosmico.html']){
   const ctx=await b.newContext({viewport:{width:1280,height:800}});
   const p=await ctx.newPage();
   const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
   await p.goto('http://127.0.0.1:'+port+'/index.html');
   await p.click('a[href="'+game+'"]');
   await p.waitForTimeout(1200);
   const r=await p.evaluate(()=>({url:location.pathname, title:document.title, hasLevel:typeof level!=='undefined'?level:null, music: typeof music!=='undefined' && music? (music.src.split('/').pop()||null):null}));
   const ok = r.url.endsWith(game) && r.hasLevel===1;
   console.log((ok?'PASS':'FAIL'), game.padEnd(20), '| url', r.url, '| titulo', r.title, '| nivel', r.hasLevel, '| musica', r.music, errs.length?('| ERR '+errs.slice(0,2)):'');
   await ctx.close();
 }
 await b.close();srv.close();
});
