// Pruebas de "Órbita Perdida": misma metodología que los otros juegos.
// Lo propio de este mundo: gravedad baja y portales que teletransportan.
const path = require('path');
const http = require('http');
const fs = require('fs');

const ROOT = '/home/guillermo/juegos';
const FILE = 'cosmico.html';

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
      fs.readFile(f, (err, buf) => {
        if (err) { res.writeHead(404); res.end('nf'); return; }
        res.writeHead(200, { 'Content-Type': f.endsWith('.ogg') ? 'audio/ogg' : 'text/html; charset=utf-8' });
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

  const init = await page.evaluate(() => ({
    level, maxLevel: MAX_LEVEL, plats: data.platforms.length,
    cols: Object.keys(data)
  }));
  check('arranca en el nivel 1', init.level === 1, init);
  check('MAX_LEVEL = 10', init.maxLevel === 10, init.maxLevel);
  check('datos con stars/portals/crystal',
        ['platforms', 'slopes', 'stars', 'portals', 'crystal', 'goal'].every(k => init.cols.includes(k)),
        init.cols);

  const levels = await page.evaluate(() => {
    const out = [];
    for (let l = 1; l <= MAX_LEVEL; l++) {
      const d = getLevelData(l);
      out.push({
        l,
        ok: !!(d && d.platforms.length && d.goal && Array.isArray(d.stars) &&
               Array.isArray(d.portals) && Array.isArray(d.slopes)),
        portals: d.portals.length,
        rocks: d.platforms.filter(p => p.kind === 'rock').length,
        inside: d.platforms.every(p => p.x >= 0 && p.x + p.w <= 800 && p.y >= 0 && p.y <= 500),
        // cada portal debe tener pareja (mismo link)
        paresOk: d.portals.every(p => d.portals.some(q => q !== p && q.link === p.link))
      });
    }
    return out;
  });
  check('los 10 niveles son validos', levels.every(x => x.ok), levels.map(x => x.l));
  check('nada se sale del canvas', levels.every(x => x.inside), levels.filter(x => !x.inside).map(x => x.l));
  check('todos los niveles tienen portales', levels.every(x => x.portals >= 2),
        levels.map(x => x.l + ':' + x.portals));
  check('cada portal tiene su pareja', levels.every(x => x.paresOk),
        levels.filter(x => !x.paresOk).map(x => x.l));

  // Física espacial: la gravedad cambia con la altura
  const grav = await page.evaluate(() => ({
    arriba: +gravityAt(20).toFixed(3),
    abajo: +gravityAt(470).toFixed(3),
    normal: GRAVITY,
    baja: SPACE_GRAVITY
  }));
  check('gravedad baja arriba y normal abajo',
        grav.arriba < grav.baja + 0.05 && grav.abajo > grav.baja * 1.8 && grav.abajo <= grav.normal,
        grav);

  // El salto en el espacio llega mas alto que en el juego normal (210 px medidos)
  const salto = await page.evaluate(() => {
    running = false; level = 1; loadLevel(1);
    const plats = data.platforms;
    data.platforms = [];                     // medir en el aire
    player.x = 60; player.y = 300; player.vx = 0; player.vy = 0;
    player.onGround = true; player.jumpsLeft = MAX_JUMPS;
    const y0 = player.y;
    let max = 0;
    jumpPressed = true; update();
    for (let i = 0; i < 250; i++) {
      update();
      max = Math.max(max, y0 - player.y);
      if (player.y > 480) break;
    }
    data.platforms = plats;
    return Math.round(max);
  });
  check('el salto espacial supera los 210 px del juego normal',
        salto > 210, { salto });

  const jumps = await page.evaluate(() => {
    player.x = 60; player.y = 436; player.vy = 0; player.onGround = true;
    player.jumpsLeft = MAX_JUMPS;
    const b = player.jumpsLeft;
    jumpPressed = true; update();
    const a1 = player.jumpsLeft;
    jumpPressed = true; update();
    const a2 = player.jumpsLeft;
    jumpPressed = true; update();
    return { b, a1, a2, a3: player.jumpsLeft };
  });
  check('doble salto (maximo 2)', jumps.b === 2 && jumps.a1 === 1 && jumps.a2 === 0 && jumps.a3 === 0, jumps);

  // MECÁNICA PROPIA: portales
  const portal = await page.evaluate(() => {
    level = 1; loadLevel(1);
    const a = data.portals[0];
    const link = data.portals.find(q => q !== a && q.link === a.link);
    player.x = a.x + 5; player.y = a.y + 10; player.vx = 0; player.vy = 0;
    const antes = { x: Math.round(player.x), y: Math.round(player.y) };
    updatePortals();
    const despues = { x: Math.round(player.x), y: Math.round(player.y) };
    return {
      antes, despues,
      destino: { x: Math.round(link.x), y: Math.round(link.y) },
      teletransportado: Math.abs(player.x - (link.x + link.w / 2 - player.w / 2)) < 3,
      cooldown: a.cool > 0 && link.cool > 0
    };
  });
  check('portal: teletransporta al otro extremo',
        portal.teletransportado && portal.cooldown, portal);

  // El cooldown evita el bucle infinito de portales
  const noLoop = await page.evaluate(() => {
    const a = data.portals[0];
    const antes = { x: Math.round(player.x), y: Math.round(player.y) };
    updatePortals();                         // justo despues de salir: no debe mover
    return { igual: Math.round(player.x) === antes.x && Math.round(player.y) === antes.y };
  });
  check('el portal no se reactiva en bucle', noLoop.igual, noLoop);


  // Estrellas y cristal
  const pickups = await page.evaluate(() => {
    level = 3; loadLevel(3);
    let s0 = score;
    const st = data.stars[0];
    player.x = st.x - player.w / 2; player.y = st.y - player.h / 2;
    update();
    const estrella = score - s0;
    s0 = score;
    const cr = data.crystal;
    player.x = cr.x - player.w / 2; player.y = cr.y - player.h / 2;
    update();
    return { estrella, cristal: score - s0 };
  });
  check('estrella +10', pickups.estrella === 10, pickups);
  check('cristal +50', pickups.cristal === 50, pickups);

  // Caer y avanzar de nivel
  const fall = await page.evaluate(() => {
    level = 1; loadLevel(1);
    player.x = 400; player.y = 520; player.vy = 12;
    update();
    return { x: player.x, y: player.y };
  });
  check('caer al vacio reinicia', fall.x === 20 && fall.y === 400, fall);

  const nextLvl = await page.evaluate(async () => {
    level = 1; score = 0; loadLevel(1); running = true;
    const g = data.goal;
    player.x = g.x + 5; player.y = g.y + 5;
    update();
    await new Promise(r => setTimeout(r, 1300));
    return { level, running };
  });
  check('la meta avanza de nivel', nextLvl.level === 2 && nextLvl.running === true, nextLvl);

  // Música propia del espacio
  const music = await page.evaluate(async () => {
    const files = ['espacio-1-deriva.ogg', 'espacio-2-horizonte.ogg'];
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
  check('los temas del espacio cargan',
        Object.values(music.load).every(t => t.ok && t.bytes > 30000), music.load);
  check('los 10 niveles usan musica del espacio',
        music.temas.every(t => t.startsWith('espacio-')), music.temas);

  // Render: fondo oscuro con estrellas
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
    const top = at(400, 3);
    return { top, colores: seen.size, oscuro: top[0] < 60 && top[2] < 90 };
  });
  check('render espacial: fondo oscuro y con detalle',
        px.oscuro && px.colores > 100, px);

  check('sin errores de consola', errors.length === 0, errors.slice(0, 5));

  // Móvil
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

  console.log('\n=== RESULTADOS (Órbita Perdida) ===');
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
