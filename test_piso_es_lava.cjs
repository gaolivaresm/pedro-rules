// Harness de validación para piso-es-lava.html
// Carga la página en Chromium (Playwright) y ejercita la lógica del juego.
const path = require('path');
const http = require('http');
const fs = require('fs');

const ROOT = '/home/guillermo/juegos';
const FILE = 'piso-es-lava.html';

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
      fs.readFile(f, (err, buf) => {
        if (err) { res.writeHead(404); res.end('nf'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

(async () => {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (e) {
    console.log('SKIP: playwright no instalado ->', e.message.split('\n')[0]);
    process.exit(2);
  }
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({
    args: ['--no-sandbox'],
    // Usa el Chromium del sistema si existe (evita tener que descargar navegadores)
    executablePath: fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(`http://127.0.0.1:${port}/${FILE}`);
  await page.waitForTimeout(600);

  const results = [];
  const check = (name, ok, extra) => results.push({ name, ok, extra });

  // 1. Estado inicial
  const initial = await page.evaluate(() => ({
    level, score, platforms: data.platforms.length, cols: Object.keys(data)
  }));
  check('nivel 1 cargado', initial.level === 1 && initial.platforms === 4, initial);
  check('datos con movingLava y gem',
        initial.cols.includes('movingLava') && initial.cols.includes('gem'), initial.cols);

  // 2. Todos los niveles 1..10 generan datos válidos
  const levelsOk = await page.evaluate(() => {
    const out = [];
    for (let l = 1; l <= MAX_LEVEL; l++) {
      const d = getLevelData(l);
      const ok = d && Array.isArray(d.platforms) && d.platforms.length > 0 &&
                 d.goal && Array.isArray(d.coins) && Array.isArray(d.traps) &&
                 Array.isArray(d.movingLava);
      const inside = d.platforms.every(p => p.x >= 0 && p.x + p.w <= 800 && p.y >= 0);
      out.push({ l, ok, inside, platforms: d.platforms.length,
                 coins: d.coins.length, traps: d.traps.length, lava: d.movingLava.length });
    }
    return out;
  });
  check('niveles 1-10 válidos', levelsOk.every(x => x.ok),
        levelsOk.map(x => x.l + ':' + x.platforms + 'p').join(' '));
  check('plataformas dentro del canvas', levelsOk.every(x => x.inside),
        levelsOk.filter(x => !x.inside).map(x => x.l));

  // 3. Determinismo del generador procedural
  const deterministic = await page.evaluate(() =>
    JSON.stringify(getLevelData(7)) === JSON.stringify(getLevelData(7)));
  check('generador determinista', deterministic);


  // 4. El jugador aterriza sobre la plataforma inicial
  await page.evaluate(() => { player.x = 40; player.y = 100; player.vy = 0; });
  await page.waitForTimeout(700);
  const landed = await page.evaluate(() => ({ y: player.y, onGround: player.onGround }));
  check('aterriza en plataforma (y=436)', Math.abs(landed.y - 436) < 1 && landed.onGround, landed);

  // 5. Doble salto: consume 2 y no deja un tercero
  const jumps = await page.evaluate(() => {
    player.x = 40; player.y = 436; player.vy = 0;
    player.onGround = true; player.jumpsLeft = MAX_JUMPS;
    const before = player.jumpsLeft;
    jumpPressed = true; update();
    const afterFirst = player.jumpsLeft;
    jumpPressed = true; update();
    const afterSecond = player.jumpsLeft;
    jumpPressed = true; update();
    const afterThird = player.jumpsLeft;
    return { before, afterFirst, afterSecond, afterThird };
  });
  check('doble salto (2 usos máximo)',
        jumps.before === 2 && jumps.afterFirst === 1 &&
        jumps.afterSecond === 0 && jumps.afterThird === 0, jumps);

  // 6. Moneda suma puntos
  const coin = await page.evaluate(() => {
    loadLevel(1);
    const s0 = score;
    const c = data.coins[0];
    player.x = c.x - player.w / 2; player.y = c.y - player.h / 2; player.vy = 0;
    update();
    return { s0, s1: score, collected: c.collected };
  });
  check('moneda da +10 puntos', coin.s1 === coin.s0 + 10 && coin.collected, coin);

  // 7. Caer a la lava reinicia la posición
  const fell = await page.evaluate(() => {
    loadLevel(1);
    player.x = 400; player.y = 520; player.vy = 10;
    update();
    return { x: player.x, y: player.y, msg: document.getElementById('msg').textContent };
  });
  check('caer reinicia al inicio', fell.x === 20 && fell.y === 400, fell);

  // 8. Trampa congela al jugador
  const trap = await page.evaluate(() => {
    loadLevel(2);
    const t = data.traps[0];
    player.x = t.x; player.y = t.y;
    update();
    return { frozen: player.frozen, msg: document.getElementById('msg').textContent };
  });
  check('trampa congela', trap.frozen === true && trap.msg.includes('trampa'), trap);

  // 9. Llegar a la meta avanza de nivel
  const winRes = await page.evaluate(async () => {
    restartGame();
    const g = data.goal;
    player.x = g.x + 5; player.y = g.y + 5;
    update();
    const msgJustAfter = document.getElementById('msg').textContent;
    await new Promise(r => setTimeout(r, 1400));
    return { msgJustAfter, level, running };
  });
  check('meta avanza de nivel', winRes.level === 2 && winRes.running === true, winRes);

  // 10. Final del juego (nivel 10) + reinicio con R
  const finish = await page.evaluate(() => {
    level = MAX_LEVEL; score = 120; loadLevel(level);
    const g = data.goal;
    player.x = g.x + 5; player.y = g.y + 5;
    update();
    const runningAfter = running;
    const msg = document.getElementById('msg').textContent;
    restartGame();
    return { runningAfter, msg, level, score, running };
  });
  check('fin de juego detiene y reinicia',
        finish.runningAfter === false && finish.msg.includes('Completaste') &&
        finish.level === 1 && finish.score === 0 && finish.running === true, finish);

  // 11. La lava móvil se mueve
  const lava = await page.evaluate(async () => {
    loadLevel(6);
    if (!data.movingLava.length) return { none: true };
    const x0 = data.movingLava[0].x;
    await new Promise(r => setTimeout(r, 400));
    return { none: false, moved: Math.abs(data.movingLava[0].x - x0) > 0.5,
             count: data.movingLava.length };
  });
  check('lava móvil en nivel 6+', lava.none === false && lava.moved === true, lava);

  // 12. Música: los tres temas existen, cargan y el toggle funciona
  const musicRes = await page.evaluate(async () => {
    const files = ['piso-es-lava.ogg', 'piso-es-lava-final.ogg', 'piso-es-lava-victoria.ogg'];
    const out = {};
    for (const f of files) {
      const res = await fetch('musica/' + f);
      const buf = await res.arrayBuffer();
      const b = new Uint8Array(buf);
      const isOgg = b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53;
      const a = new Audio('musica/' + f);
      const canPlay = await new Promise(resolve => {
        a.addEventListener('canplaythrough', () => resolve(true), { once: true });
        a.addEventListener('error', () => resolve(false), { once: true });
        a.load();
        setTimeout(() => resolve(null), 5000);
      });
      out[f] = { size: buf.byteLength, isOgg, canPlay };
    }
    const before = musicOn;
    toggleMusic();
    const after = musicOn;
    toggleMusic();
    return { themes: out, before, after, back: musicOn, hasAudio: !!music };
  });
  const themesOk = Object.values(musicRes.themes).every(t =>
    t.isOgg === true && t.size > 40000 && t.canPlay === true);
  check('los 3 temas .ogg cargan y decodifican', themesOk, musicRes.themes);
  check('tecla M alterna la musica',
        musicRes.before === true && musicRes.after === false && musicRes.back === true, musicRes);

  // 12b. El tema cambia según el nivel (nivel 10 = tema final)
  const themeSwitch = await page.evaluate(() => {
    const main = musicThemeForLevel(1);
    const mid = musicThemeForLevel(9);
    const last = musicThemeForLevel(MAX_LEVEL);
    playTheme(last);
    const afterFinal = currentTheme;
    playTheme(main, true);
    const back = currentTheme;
    const loopOn = music ? music.loop : null;
    return { main, mid, last, afterFinal, back, loopOn };
  });
  check('nivel 10 usa el tema final',
        themeSwitch.main === 'main' && themeSwitch.mid === 'main' &&
        themeSwitch.last === 'final' && themeSwitch.afterFinal === 'final' &&
        themeSwitch.back === 'main' && themeSwitch.loopOn === true, themeSwitch);

  // 12c. La fanfarria no queda en loop y devuelve el tema al terminar
  const jingle = await page.evaluate(async () => {
    playVictoryJingle();
    const themeNow = currentTheme;
    const looping = music ? music.loop : null;
    await new Promise(r => setTimeout(r, 3200));   // 2.4 s de fanfarria
    return { themeNow, looping, afterEnd: currentTheme };
  });
  check('fanfarria sin loop y vuelve al tema',
        jingle.themeNow === 'victory' && jingle.looping === false &&
        (jingle.afterEnd === 'main' || jingle.afterEnd === 'final'), jingle);

  // 13. Dibuja sin errores y el canvas tiene color variado
  const pixels = await page.evaluate(async () => {
    restartGame();
    await new Promise(r => setTimeout(r, 300));
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    return { colors: seen.size };
  });
  check('canvas renderiza (>10 colores distintos)', pixels.colors > 10, pixels);

  check('sin errores de consola/página', errors.length === 0, errors.slice(0, 5));

  // ---------- 14. Móvil: layout responsive y controles táctiles ----------
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },     // iPhone 12/13/14
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 '
             + '(KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  });
  const mpage = await phone.newPage();
  const mErrors = [];
  mpage.on('pageerror', e => mErrors.push('pageerror: ' + e.message));
  await mpage.goto(`http://127.0.0.1:${port}/${FILE}`);
  await mpage.waitForTimeout(800);

  const layout = await mpage.evaluate(() => {
    const bar = document.getElementById('touch');
    const c = document.getElementById('game');
    const r = c.getBoundingClientRect();
    const bodyOverflow = document.documentElement.scrollWidth - window.innerWidth;
    return {
      barVisible: getComputedStyle(bar).display !== 'none',
      canvasW: Math.round(r.width),
      canvasH: Math.round(r.height),
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      fitsWidth: r.width <= window.innerWidth,
      fitsHeight: r.bottom <= window.innerHeight + 1,
      ratio: Math.round((r.width / r.height) * 100) / 100,
      hScroll: bodyOverflow,
      logical: { w: c.width, h: c.height }
    };
  });
  check('movil: canvas escala y cabe en pantalla',
        layout.canvasW > 200 && layout.fitsWidth && layout.hScroll <= 0 &&
        layout.logical.w === 800 && layout.logical.h === 500, layout);
  check('movil: mantiene proporcion 8:5', Math.abs(layout.ratio - 1.6) < 0.02, layout);
  check('movil: se muestran los controles tactiles', layout.barVisible === true, layout);

  // 14b. Ningun tamano de pantalla produce scroll ni rompe la proporcion
  const sizes = [
    ['telefono vertical', 390, 844], ['telefono horizontal', 844, 390],
    ['android pequeno', 360, 640], ['tablet', 768, 1024]
  ];
  const sizeResults = [];
  for (const [name, w, h] of sizes) {
    const ctx2 = await browser.newContext({
      viewport: { width: w, height: h }, isMobile: true, hasTouch: true,
      deviceScaleFactor: 2
    });
    const p2 = await ctx2.newPage();
    await p2.goto(`http://127.0.0.1:${port}/${FILE}`);
    await p2.waitForTimeout(350);
    const m = await p2.evaluate(() => {
      const c = document.getElementById('game').getBoundingClientRect();
      const bar = document.getElementById('touch');
      const btn = bar.querySelector('button').getBoundingClientRect();
      return {
        ratio: +(c.width / c.height).toFixed(2),
        fitsW: c.right <= innerWidth + 1,
        fitsH: c.bottom <= innerHeight,
        overflowX: document.documentElement.scrollWidth - innerWidth,
        overflowY: document.documentElement.scrollHeight - innerHeight,
        btnW: Math.round(btn.width), btnH: Math.round(btn.height),
        touch: getComputedStyle(bar).display !== 'none'
      };
    });
    sizeResults.push({ name, w, h, ...m });
    await ctx2.close();
  }
  check('todos los tamanos: sin scroll y proporcion 1.6',
        sizeResults.every(s => s.overflowX <= 0 && s.overflowY <= 0 &&
                               s.fitsW && s.fitsH && Math.abs(s.ratio - 1.6) < 0.02),
        sizeResults);
  check('todos los tamanos: botones tactiles >= 60x50 px',
        sizeResults.every(s => s.touch && s.btnW >= 60 && s.btnH >= 50),
        sizeResults.map(s => s.name + ' ' + s.btnW + 'x' + s.btnH));

  // Pulsar ▶ mueve al jugador a la derecha
  const tapRight = await mpage.evaluate(async () => {
    loadLevel(1);
    const x0 = player.x;
    const btn = document.getElementById('btn-right');
    btn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true, pointerType: 'touch' }));
    await new Promise(r => setTimeout(r, 400));
    const midX = player.x;
    const pressedKey = !!keys['ArrowRight'];
    btn.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true, pointerType: 'touch' }));
    await new Promise(r => setTimeout(r, 300));
    return { x0, midX, pressedKey, releasedKey: keys['ArrowRight'], xEnd: player.x };
  });
  check('movil: boton ▶ mueve y suelta correctamente',
        tapRight.pressedKey === true && tapRight.midX > tapRight.x0 &&
        tapRight.releasedKey === false, tapRight);

  // Pulsar saltar: el jugador despega
  const tapJump = await mpage.evaluate(async () => {
    loadLevel(1);
    player.x = 40; player.y = 100; player.vy = 0;
    await new Promise(r => setTimeout(r, 700));   // que aterrice
    const yGround = player.y;
    const onGround = player.onGround;
    const btn = document.getElementById('btn-jump');
    btn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, bubbles: true, pointerType: 'touch' }));
    await new Promise(r => setTimeout(r, 200));
    const yMid = player.y;
    btn.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, bubbles: true, pointerType: 'touch' }));
    return { yGround, onGround, yMid, jumped: yMid < yGround - 10 };
  });
  check('movil: boton saltar hace despegar', tapJump.onGround === true && tapJump.jumped === true, tapJump);

  // Mover + saltar a la vez (dos punteros distintos)
  const multitouch = await mpage.evaluate(async () => {
    loadLevel(1);
    const right = document.getElementById('btn-right');
    const jump = document.getElementById('btn-jump');
    right.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 10, bubbles: true, pointerType: 'touch' }));
    jump.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, bubbles: true, pointerType: 'touch' }));
    const both = !!keys['ArrowRight'];
    await new Promise(r => setTimeout(r, 120));
    right.dispatchEvent(new PointerEvent('pointerup', { pointerId: 10, bubbles: true, pointerType: 'touch' }));
    jump.dispatchEvent(new PointerEvent('pointerup', { pointerId: 11, bubbles: true, pointerType: 'touch' }));
    return { both, rightAfter: keys['ArrowRight'] };
  });
  check('movil: multitouch mover+saltar', multitouch.both === true &&
        multitouch.rightAfter === false, multitouch);

  // El juego sigue funcionando en movil
  const mobileGame = await mpage.evaluate(async () => {
    loadLevel(1);
    const c = data.coins[0];
    player.x = c.x - player.w / 2; player.y = c.y - player.h / 2;
    const s0 = score;
    update();
    return { collected: c.collected, gained: score - s0 };
  });
  check('movil: la logica del juego funciona', mobileGame.collected && mobileGame.gained === 10, mobileGame);
  check('movil: sin errores JS', mErrors.length === 0, mErrors.slice(0, 3));

  await mpage.screenshot({ path: '/home/guillermo/juegos/captura-movil.png' });
  await phone.close();

  await page.evaluate(() => { restartGame(); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/home/guillermo/juegos/captura-nivel1.png' });

  console.log('\n=== RESULTADOS ===');
  let failed = 0;
  for (const r of results) {
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name +
                (r.ok ? '' : '  -> ' + JSON.stringify(r.extra)));
    if (!r.ok) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} pruebas OK`);
  await browser.close();
  server.close();
  process.exit(failed === 0 ? 0 : 1);
})();
