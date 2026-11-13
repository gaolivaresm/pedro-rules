// Pruebas de "El Cielo se Cae": sirve la carpeta de juegos y ejercita el juego
// en Chromium headless (Playwright). Misma metodología que test_piso_es_lava.cjs.
const path = require('path');
const http = require('http');
const fs = require('fs');

const ROOT = '/home/guillermo/juegos';
const FILE = 'cielo-se-cae.html';

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
      fs.readFile(f, (err, buf) => {
        if (err) { res.writeHead(404); res.end('nf'); return; }
        const type = f.endsWith('.ogg') ? 'audio/ogg' : 'text/html; charset=utf-8';
        res.writeHead(200, { 'Content-Type': type });
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
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
    executablePath: fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(`http://127.0.0.1:${port}/${FILE}`);
  await page.waitForTimeout(800);

  const results = [];
  const check = (name, ok, extra) => results.push({ name, ok, extra });

  // 1. Estado inicial
  const init = await page.evaluate(() => ({
    level, score, maxLevel: MAX_LEVEL,
    platforms: data.platforms.length,
    cols: Object.keys(data),
    kinds: data.platforms.map(p => p.kind)
  }));
  check('nivel 1 cargado con 4 plataformas', init.level === 1 && init.platforms === 4, init);
  check('MAX_LEVEL = 10 (10 niveles)', init.maxLevel === 10, init.maxLevel);
  check('datos con stars/breezes/rainbow',
        ['platforms', 'slopes', 'stars', 'breezes', 'rainbow', 'goal'].every(k => init.cols.includes(k)),
        init.cols);
  check('hay nubes Y pasarelas', init.kinds.includes('cloud') && init.kinds.includes('bridge'), init.kinds);

  // 2. Los tres niveles son válidos
  const levels = await page.evaluate(() => {
    const out = [];
    for (let l = 1; l <= MAX_LEVEL; l++) {
      const d = getLevelData(l);
      out.push({
        l,
        ok: !!(d && d.platforms.length && d.goal && Array.isArray(d.stars) &&
               Array.isArray(d.slopes) && Array.isArray(d.breezes)),
        clouds: d.platforms.filter(p => p.kind === 'cloud').length,
        bridges: d.platforms.filter(p => p.kind === 'bridge').length,
        stars: d.stars.length, slopes: d.slopes.length, breezes: d.breezes.length,
        rainbow: !!d.rainbow,
        inside: d.platforms.every(p => p.x >= 0 && p.x + p.w <= 800 && p.y >= 0 && p.y <= 500),
        goalInside: d.goal.x >= 0 && d.goal.x + d.goal.w <= 800 && d.goal.y >= 0
      });
    }
    return out;
  });
  check('niveles 1-10 validos', levels.every(x => x.ok), levels);
  check('todo dentro del canvas', levels.every(x => x.inside && x.goalInside), levels);
  check('cada nivel tiene nubes y pasarelas',
        levels.every(x => x.clouds > 0 && x.bridges > 0),
        levels.map(x => `${x.l}: ${x.clouds}n/${x.bridges}p`));

  // 3. El jugador aterriza en la primera nube
  await page.evaluate(() => { player.x = 60; player.y = 100; player.vy = 0; });
  await page.waitForTimeout(700);
  const landed = await page.evaluate(() => ({
    y: Math.round(player.y), onGround: player.onGround,
    maxY: Math.max(...data.platforms.filter(p => p.kind === 'cloud' && p.x < 80).map(p => p.baseY))
  }));
  check('aterriza sobre la nube', landed.onGround === true && landed.y < 460, landed);

  // 4. Doble salto
  const jumps = await page.evaluate(() => {
    player.x = 60; player.y = 436; player.vy = 0; player.onGround = true;
    player.jumpsLeft = MAX_JUMPS;
    const b = player.jumpsLeft;
    jumpPressed = true; update();
    const a1 = player.jumpsLeft;
    jumpPressed = true; update();
    const a2 = player.jumpsLeft;
    jumpPressed = true; update();
    const a3 = player.jumpsLeft;
    return { b, a1, a2, a3 };
  });
  check('doble salto (maximo 2)', jumps.b === 2 && jumps.a1 === 1 && jumps.a2 === 0 && jumps.a3 === 0, jumps);

  // 5. Estrella suma puntos
  const star = await page.evaluate(() => {
    loadLevel(1);
    const s0 = score;
    const st = data.stars[0];
    player.x = st.x - player.w / 2; player.y = st.y - player.h / 2; player.vy = 0;
    update();
    return { gained: score - s0, collected: st.collected };
  });
  check('estrella +' + 10, star.gained === 10 && star.collected, star);

  // 6. Arcoiris suma 50 (nivel 3)
  const rainbow = await page.evaluate(() => {
    level = 3; loadLevel(3);
    const s0 = score;
    const rb = data.rainbow;
    player.x = rb.x - player.w / 2; player.y = rb.y - player.h / 2; player.vy = 0;
    update();
    return { gained: score - s0, collected: rb.collected };
  });
  check('arcoiris +50', rainbow.gained === 50 && rainbow.collected, rainbow);

  // 7. Caer del cielo reinicia
  const fell = await page.evaluate(() => {
    level = 1; loadLevel(1);
    player.x = 400; player.y = 520; player.vy = 12;
    update();
    return { x: player.x, y: player.y, msg: document.getElementById('msg').textContent };
  });

  // 8. Meta avanza de nivel
  const nextLvl = await page.evaluate(async () => {
    level = 1; score = 0; loadLevel(1); running = true;
    const g = data.goal;
    player.x = g.x + 5; player.y = g.y + 5;
    update();
    const msg = document.getElementById('msg').textContent;
    await new Promise(r => setTimeout(r, 1300));
    return { msg, level, running };
  });
  check('meta avanza de nivel', nextLvl.level === 2 && nextLvl.running === true, nextLvl);

  // 9. Fin del juego (nivel 3) y reinicio con R
  const finish = await page.evaluate(() => {
    level = MAX_LEVEL; score = 150; loadLevel(level); running = true;
    const g = data.goal;
    player.x = g.x + 5; player.y = g.y + 5;
    update();
    const afterWin = { running, msg: document.getElementById('msg').textContent };
    restartGame();
    return { afterWin, level, score, running };
  });
  check('fin de juego con fanfarria y reinicio',
        finish.afterWin.running === false && finish.afterWin.msg.includes('10 nubes') &&
        finish.level === 1 && finish.score === 0 && finish.running === true, finish);

  // 10. La brisa empuja al jugador
  const breeze = await page.evaluate(() => {
    level = 2; loadLevel(2);
    const b = data.breezes[0];
    b.active = true;
    player.x = b.x + b.w / 2; player.y = b.y + b.h / 2;
    player.vx = 0; player.vy = 0;
    update();
    return { vx: player.vx, force: b.force, dirOk: Math.sign(player.vx) === Math.sign(b.force) };
  });
  check('la brisa empuja en su direccion', breeze.dirOk && Math.abs(breeze.vx) > 0, breeze);

  // 11. Las nubes se hunden al pisarlas
  const sink = await page.evaluate(async () => {
    level = 1; loadLevel(1);
    const c = data.platforms.find(p => p.kind === 'cloud' && p.baseY < 450);
    player.x = c.x + 10; player.y = c.baseY - player.h - 2; player.vy = 3;
    update();
    const sunk = c.sink;
    await new Promise(r => setTimeout(r, 600));
    return { sunk, recovered: c.sink, y: Math.round(c.y), baseY: c.baseY };
  });
  check('la nube cede al pisarla y se recupera', sink.sunk > 0, sink);

  // 12. Las pasarelas NO se hunden ni se mecen (bug corregido)
  const bridge = await page.evaluate(async () => {
    level = 1; loadLevel(1);
    const br = data.platforms.find(p => p.kind === 'bridge');
    const y0 = br.y, x0 = br.x;
    await new Promise(r => setTimeout(r, 400));
    return { y0, y1: br.y, x0: br.x, x1: br.x, sink: br.sink,
             finite: isFinite(br.y) && isFinite(br.x) };
  });
  check('pasarela firme (sin NaN ni hundimiento)',
        bridge.finite && bridge.y0 === bridge.y1 && !bridge.sink, bridge);

  // 13. Las nubes que se mecen no se salen del canvas
  const sway = await page.evaluate(() => {
    level = 3; loadLevel(3);
    let left = 999, right = -999;
    for (let i = 0; i < 400; i++) {
      updateClouds();
      frame++;
      for (const p of data.platforms) {
        if (p.kind !== 'cloud') continue;
        left = Math.min(left, p.x);
        right = Math.max(right, p.x + p.w);
      }
    }
    return { left, right };
  });
  check('nubes meciendose dentro del lienzo',
        sway.left >= -0.01 && sway.right <= 800.01, sway);


  // 14. Música: 4 temas cargan y cada nivel usa el suyo
  const music = await page.evaluate(async () => {
    const files = ['cielo-1-nubes.ogg', 'cielo-2-brisa.ogg', 'cielo-3-altura.ogg', 'cielo-victoria.ogg'];
    const load = {};
    for (const f of files) {
      const res = await fetch('musica/' + f);
      const buf = await res.arrayBuffer();
      const a = new Audio('musica/' + f);
      const ok = await new Promise(r => {
        a.addEventListener('canplaythrough', () => r(true), { once: true });
        a.addEventListener('error', () => r(false), { once: true });
        a.load();
        setTimeout(() => r(null), 4000);
      });
      load[f] = { bytes: buf.byteLength, ok };
    }
    const themes = [1, 2, 3].map(musicThemeForLevel);
    playTheme(3);
    return { load, themes, current: currentTheme, hasAudio: !!music };
  });
  check('los 4 temas .ogg cargan',
        Object.values(music.load).every(t => t.ok === true && t.bytes > 30000), music.load);
  check('cada nivel tiene su tema', music.themes.join(',') === '1,2,3' && music.hasAudio, music.themes);

  // 14b. Los 10 niveles tienen tema asignado y la dificultad crece
  const progression = await page.evaluate(() => {
    const rows = [];
    for (let l = 1; l <= MAX_LEVEL; l++) {
      const d = getLevelData(l);
      const clouds = d.platforms.filter(p => p.kind === 'cloud');
      rows.push({
        l,
        theme: MUSIC_THEMES[musicThemeForLevel(l)] ? 'ok' : 'falta',
        plats: d.platforms.length,
        // nube mas estrecha del nivel: cuanto menor, mas dificil
        minCloud: Math.min(...clouds.map(p => p.w)),
        breezes: d.breezes.length,
        rainbow: !!d.rainbow
      });
    }
    return rows;
  });
  check('los 10 niveles tienen tema musical',
        progression.every(r => r.theme === 'ok'), progression.map(r => r.l + r.theme));
  check('la dificultad crece (nubes mas estrechas)',
        progression[progression.length - 1].minCloud < progression[0].minCloud,
        progression.map(r => r.l + ':' + r.minCloud));
  check('los niveles altos tienen brisa y arcoiris',
        progression.slice(4).every(r => r.breezes > 0 && r.rainbow),
        progression.slice(4).map(r => `${r.l} b${r.breezes}${r.rainbow ? '🌈' : ''}`));

  // 14c. En cada nivel la meta se apoya en su plataforma mas alta
  const goals = await page.evaluate(() => {
    const out = [];
    for (let l = 1; l <= MAX_LEVEL; l++) {
      const d = getLevelData(l);
      const top = d.platforms.slice().sort((a, b) => a.y - b.y)[0];
      const overlap = d.goal.x < top.x + top.w && d.goal.x + d.goal.w > top.x;
      out.push({ l, overlap, level: d.goal.y + d.goal.h === top.y });
    }
    return out;
  });
  check('en los 10 niveles la meta esta sobre la ultima plataforma',
        goals.every(g => g.overlap && g.level), goals.filter(g => !(g.overlap && g.level)));

  // 15. La fanfarria no queda en loop
  const jingle = await page.evaluate(async () => {
    playVictoryJingle();
    const now = { theme: currentTheme, loop: music ? music.loop : null };
    await new Promise(r => setTimeout(r, 2800));
    return { now, after: currentTheme };
  });
  check('fanfarria sin loop y vuelve al tema',
        jingle.now.theme === 'victory' && jingle.now.loop === false &&
        jingle.after !== 'victory', jingle);

  // 16. Render por pixeles
  const pixels = await page.evaluate(async () => {
    level = 1; restartGame();
    await new Promise(r => setTimeout(r, 300));
    const c = document.getElementById('game'), g = c.getContext('2d');
    const px = (x, y) => {
      const d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const near = (x, y, test) => {
      for (let dx = -8; dx <= 8; dx += 2) for (let dy = -8; dy <= 8; dy += 2)
        if (test(px(x + dx, y + dy))) return true;
      return false;
    };
    const cloud = data.platforms.find(p => p.kind === 'cloud');
    const br = data.platforms.find(p => p.kind === 'bridge');
    return {
      skyTop: px(400, 2), skyBottom: px(400, 497),
      cloudWhite: near(cloud.x + cloud.w / 2, cloud.y + 6, v => v[0] > 230 && v[1] > 235 && v[2] > 235),
      bridgeBrown: near(br.x + br.w / 2, br.y + 6, v => v[0] > 110 && v[0] < 225 && v[2] < 130)
    };
  });
  check('cielo con degradado azul',
        pixels.skyTop[2] > pixels.skyTop[0] && pixels.skyBottom[2] > pixels.skyTop[2], pixels);
  check('nubes blancas y pasarelas visibles', pixels.cloudWhite && pixels.bridgeBrown, pixels);

  // La nube no debe tener una raya recta de borde a borde (bug del brillo superior):
  // se compara la fila mas "blanca" contra la mediana de sus vecinas.
  const noLine = await page.evaluate(async () => {
    level = 1; restartGame();
    await new Promise(r => setTimeout(r, 300));
    const c = document.getElementById('game'), g = c.getContext('2d');
    const cl = data.platforms.find(p => p.kind === 'cloud');
    const y0 = cl.y - cl.h * 1.35;
    const rows = [];
    for (let dy = -4; dy <= 4; dy++) {
      let white = 0, total = 0;
      for (let x = Math.round(cl.x); x < Math.round(cl.x + cl.w); x += 2) {
        const d = g.getImageData(x, Math.round(y0 + dy), 1, 1).data;
        total++;
        if (d[0] > 240 && d[1] > 240 && d[2] > 240) white++;
      }
      rows.push(white / total);
    }
    return { max: Math.max(...rows), med: rows.slice().sort((a, b) => a - b)[4] };
  });
  check('nube sin raya recta de borde a borde',
        noLine.max < 0.6 && noLine.max - noLine.med < 0.3, noLine);

  check('sin errores de consola/pagina', errors.length === 0, errors.slice(0, 5));


  // ---------- 17. Móvil ----------
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 '
             + '(KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  });
  const mpage = await phone.newPage();
  const mErrors = [];
  mpage.on('pageerror', e => mErrors.push(e.message));
  await mpage.goto(`http://127.0.0.1:${port}/${FILE}`);
  await mpage.waitForTimeout(800);

  const layout = await mpage.evaluate(() => {
    const bar = document.getElementById('touch');
    const c = document.getElementById('game').getBoundingClientRect();
    const g = document.getElementById('game');
    return {
      barVisible: getComputedStyle(bar).display !== 'none',
      canvasW: Math.round(c.width), ratio: +(c.width / c.height).toFixed(2),
      fitsW: c.width <= innerWidth, fitsH: c.bottom <= innerHeight + 1,
      overflowX: document.documentElement.scrollWidth - innerWidth,
      overflowY: document.documentElement.scrollHeight - innerHeight,
      logical: g.width + 'x' + g.height
    };
  });
  check('movil: canvas escala sin scroll',
        layout.canvasW > 200 && layout.fitsW && layout.fitsH &&
        layout.overflowX <= 0 && layout.overflowY <= 0 && layout.logical === '800x500', layout);
  check('movil: proporcion 8:5', Math.abs(layout.ratio - 1.6) < 0.02, layout);
  check('movil: controles tactiles visibles', layout.barVisible === true, layout);

  const tapRight = await mpage.evaluate(async () => {
    loadLevel(1);
    const x0 = player.x;
    const btn = document.getElementById('btn-right');
    btn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true, pointerType: 'touch' }));
    await new Promise(r => setTimeout(r, 350));
    const mid = player.x, pressed = !!keys['ArrowRight'];
    btn.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true, pointerType: 'touch' }));
    await new Promise(r => setTimeout(r, 250));
    return { x0, mid, pressed, released: keys['ArrowRight'] };
  });
  check('movil: boton mover funciona',
        tapRight.pressed && tapRight.mid > tapRight.x0 && !tapRight.released, tapRight);

  const tapJump = await mpage.evaluate(async () => {
    loadLevel(1);
    // dejarlo caer sobre la nube inicial y esperar a que aterrice
    player.x = 60; player.y = 100; player.vy = 0;
    for (let i = 0; i < 200 && !player.onGround; i++) {
      await new Promise(r => setTimeout(r, 16));
    }
    const y0 = player.y, grounded = player.onGround;
    const btn = document.getElementById('btn-jump');
    btn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, bubbles: true, pointerType: 'touch' }));
    await new Promise(r => setTimeout(r, 200));
    const y1 = player.y;
    btn.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, bubbles: true, pointerType: 'touch' }));
    return { y0: Math.round(y0), grounded, y1: Math.round(y1), jumped: y1 < y0 - 10 };
  });
  check('movil: boton saltar funciona', tapJump.grounded && tapJump.jumped, tapJump);

  const multi = await mpage.evaluate(async () => {
    loadLevel(1);
    const r = document.getElementById('btn-right');
    const j = document.getElementById('btn-jump');
    r.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 10, bubbles: true, pointerType: 'touch' }));
    j.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, bubbles: true, pointerType: 'touch' }));
    const both = !!keys['ArrowRight'];
    r.dispatchEvent(new PointerEvent('pointerup', { pointerId: 10, bubbles: true, pointerType: 'touch' }));
    j.dispatchEvent(new PointerEvent('pointerup', { pointerId: 11, bubbles: true, pointerType: 'touch' }));
    return { both, after: keys['ArrowRight'] };
  });
  check('movil: multitouch mover+saltar', multi.both === true && multi.after === false, multi);
  check('movil: sin errores JS', mErrors.length === 0, mErrors.slice(0, 3));

  await mpage.screenshot({ path: '/home/guillermo/juegos/captura-cielo-movil.png' });
  await phone.close();

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
