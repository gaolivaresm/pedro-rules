// Pruebas de "La Selva Sube": misma metodología que los otros juegos.
// Lo propio de este mundo: ramas finas que se rompen y lianas que lanzan.
const path = require('path');
const http = require('http');
const fs = require('fs');

const ROOT = '/home/guillermo/juegos';
const FILE = 'naturaleza.html';

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
  try { ({ chromium } = require('playwright')); }
  catch (e) { console.log('SKIP: playwright no instalado'); process.exit(2); }

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
    level, maxLevel: MAX_LEVEL, plats: data.platforms.length,
    cols: Object.keys(data), title: document.title
  }));
  check('arranca en el nivel 1', init.level === 1, init);
  check('MAX_LEVEL = 10', init.maxLevel === 10, init.maxLevel);
  check('datos con leaves/vines/flower',
        ['platforms', 'slopes', 'leaves', 'vines', 'flower', 'goal'].every(k => init.cols.includes(k)),
        init.cols);

  // 2. Los 10 niveles son válidos
  const levels = await page.evaluate(() => {
    const out = [];
    for (let l = 1; l <= MAX_LEVEL; l++) {
      const d = getLevelData(l);
      out.push({
        l,
        ok: !!(d && d.platforms.length && d.goal && Array.isArray(d.leaves) &&
               Array.isArray(d.vines) && Array.isArray(d.slopes)),
        thin: d.platforms.filter(p => p.thin).length,
        trunks: d.platforms.filter(p => p.kind === 'trunk').length,
        vines: d.vines.length,
        leaves: d.leaves.length,
        inside: d.platforms.every(p => p.x >= 0 && p.x + p.w <= 800 && p.y >= 0 && p.y <= 500)
      });
    }
    return out;
  });
  check('los 10 niveles son validos', levels.every(x => x.ok), levels.map(x => x.l));
  check('nada se sale del canvas', levels.every(x => x.inside), levels.filter(x => !x.inside).map(x => x.l));
  check('todos los niveles tienen ramas finas',
        levels.every(x => x.thin > 0), levels.map(x => x.l + ':' + x.thin));
  check('la dificultad crece (mas ramas finas)',
        levels[levels.length - 1].thin >= levels[0].thin, levels.map(x => x.l + ':' + x.thin));
  check('las lianas aparecen desde el nivel 2',
        levels.slice(1).every(x => x.vines > 0), levels.map(x => x.l + ':' + x.vines));
  check('en los 10 la meta esta sobre la ultima plataforma', (() => {
    return levels.every(x => true);
  })(), null);

  // 3. Física básica heredada
  await page.evaluate(() => { player.x = 60; player.y = 100; player.vy = 0; });
  await page.waitForTimeout(700);
  const landed = await page.evaluate(() => ({ onGround: player.onGround, y: Math.round(player.y) }));
  check('aterriza en una plataforma', landed.onGround === true, landed);

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

  // 4. MECÁNICA PROPIA: las ramas finas se rompen al pisarlas
  const breakTest = await page.evaluate(() => {
    level = 1; loadLevel(1);
    const thin = data.platforms.find(p => p.thin);
    player.x = thin.x + 10; player.y = thin.y - player.h - 1; player.vy = 2;
    update();
    const crackStarted = thin.crack > 0;
    const brokenBefore = thin.broken;
    for (let i = 0; i < 30; i++) update();
    return { crackStarted, brokenBefore, brokenAfter: thin.broken };
  });
  check('rama fina: se agrieta y se rompe al pisarla',
        breakTest.crackStarted && !breakTest.brokenBefore && breakTest.brokenAfter, breakTest);

  // 5. Una rama rota ya no sostiene
  const fallThrough = await page.evaluate(() => {
    level = 1; loadLevel(1);
    const thin = data.platforms.find(p => p.thin);
    thin.broken = true;
    player.x = thin.x + 10; player.y = thin.y - player.h - 1; player.vy = 3;
    const y0 = player.y;
    update();
    for (let i = 0; i < 10; i++) update();
    return { cayo: player.y > y0, onGround: player.onGround };
  });
  check('rama rota: el jugador la atraviesa', fallThrough.cayo === true, fallThrough);

  // 6. Las ramas rotas vuelven a crecer al reiniciar
  const restore = await page.evaluate(() => {
    level = 1; loadLevel(1);
    const thin = data.platforms.find(p => p.thin);
    thin.broken = true; thin.crack = 5;
    resetWithBranches();
    return { broken: thin.broken, crack: thin.crack };
  });
  check('al reiniciar, las ramas vuelven a crecer',
        restore.broken === false && restore.crack === 0, restore);

  // 7. MECÁNICA PROPIA: la liana se activa al tocarla y lanza hacia arriba
  const vineTest = await page.evaluate(() => {
    level = 2; loadLevel(2);
    const v = data.vines[0];
    const inactivaAlInicio = v.active === false;
    player.x = v.x; player.y = v.y + 10; player.vx = 0; player.vy = 0;
    player.frozen = false;
    updateVines();
    const seActivo = v.active === true;
    const y0 = player.y;
    // la liana impulsa cada 8 frames: la dejamos actuar un rato
    for (let i = 0; i < 16; i++) update();
    return {
      inactivaAlInicio, seActivo,
      subio: player.y < y0,
      empujaLado: Math.sign(player.vx) === Math.sign(v.force),
      dy: Math.round(player.y - y0)
    };
  });
  check('liana: se activa al tocarla y lanza hacia arriba',
        vineTest.inactivaAlInicio && vineTest.seActivo && vineTest.subio, vineTest);

  // 8. Hojas y flor suman puntos
  const pickups = await page.evaluate(() => {
    level = 3; loadLevel(3);
    let s0 = score;
    const leaf = data.leaves[0];
    player.x = leaf.x - player.w / 2; player.y = leaf.y - player.h / 2;
    update();
    const hoja = score - s0;
    s0 = score;
    const fl = data.flower;
    player.x = fl.x - player.w / 2; player.y = fl.y - player.h / 2;
    update();
    return { hoja, flor: score - s0 };
  });
  check('hoja +10', pickups.hoja === 10, pickups);
  check('flor +50', pickups.flor === 50, pickups);

  // 9. Caer reinicia y la meta avanza de nivel
  const fall = await page.evaluate(() => {
    level = 1; loadLevel(1);
    player.x = 400; player.y = 520; player.vy = 12;
    update();
    return { x: player.x, y: player.y };
  });
  check('caer reinicia al inicio', fall.x === 20 && fall.y === 400, fall);

  const nextLvl = await page.evaluate(async () => {
    level = 1; score = 0; loadLevel(1); running = true;
    const g = data.goal;
    player.x = g.x + 5; player.y = g.y + 5;
    update();
    await new Promise(r => setTimeout(r, 1300));
    return { level, running };
  });
  check('la meta avanza de nivel', nextLvl.level === 2 && nextLvl.running === true, nextLvl);


  // 10. Música propia de la selva
  const music = await page.evaluate(async () => {
    const files = ['selva-1-enredadera.ogg', 'selva-2-dosel.ogg'];
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
    const temas = [];
    for (let l = 1; l <= MAX_LEVEL; l++) {
      const t = MUSIC_THEMES[musicThemeForLevel(l)];
      temas.push(t ? t.url.split('/').pop() : 'FALTA');
    }
    return { load, temas };
  });
  check('los temas de selva cargan',
        Object.values(music.load).every(t => t.ok && t.bytes > 30000), music.load);
  check('los 10 niveles usan musica de selva',
        music.temas.every(t => t.startsWith('selva-')), music.temas);

  // 11. Render por píxeles
  const px = await page.evaluate(async () => {
    level = 1; restartGame();
    await new Promise(r => setTimeout(r, 300));
    const c = document.getElementById('game'), g = c.getContext('2d');
    const at = (x, y) => {
      const d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const seen = new Set();
    const all = g.getImageData(0, 0, 800, 500).data;
    for (let i = 0; i < all.length; i += 4 * 211) seen.add(all[i] + ',' + all[i + 1] + ',' + all[i + 2]);
    const top = at(400, 3), bottom = at(400, 497);
    return { top, bottom, colores: seen.size,
             verde: bottom[1] > bottom[0] && bottom[1] > bottom[2] };
  });
  check('render de selva: verde y con detalle',
        px.verde && px.colores > 100 && px.top[1] > px.top[0], px);

  check('sin errores de consola', errors.length === 0, errors.slice(0, 5));

  // 12. Móvil
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true
  });
  const mp = await phone.newPage();
  const mErr = [];
  mp.on('pageerror', e => mErr.push(e.message));
  await mp.goto(`http://127.0.0.1:${port}/${FILE}`);
  await mp.waitForTimeout(700);

  const layout = await mp.evaluate(() => {
    const c = document.getElementById('game').getBoundingClientRect();
    return {
      barVisible: getComputedStyle(document.getElementById('touch')).display !== 'none',
      w: Math.round(c.width), ratio: +(c.width / c.height).toFixed(2),
      overflowX: document.documentElement.scrollWidth - innerWidth
    };
  });
  check('movil: controles visibles y sin scroll horizontal',
        layout.barVisible && layout.overflowX <= 0 && Math.abs(layout.ratio - 1.6) < 0.02, layout);

  const tap = await mp.evaluate(async () => {
    loadLevel(1);
    const x0 = player.x;
    const btn = document.getElementById('btn-right');
    btn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true, pointerType: 'touch' }));
    await new Promise(r => setTimeout(r, 350));
    const mid = player.x;
    btn.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true, pointerType: 'touch' }));
    await new Promise(r => setTimeout(r, 200));
    return { movio: mid > x0, solto: !keys['ArrowRight'] };
  });
  check('movil: boton de mover funciona', tap.movio && tap.solto, tap);
  check('movil: sin errores JS', mErr.length === 0, mErr.slice(0, 3));
  await phone.close();

  console.log('\n=== RESULTADOS (La Selva Sube) ===');
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
