// Comprueba que cada nivel se pueda subir peldaño a peldaño (como un humano):
// desde cada plataforma, correr hacia la siguiente y saltar. Recorre la escalera
// de plataformas en orden de altura y la meta final.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const srv = http.createServer((q, r) => {
  const f = path.join('/home/guillermo/juegos', decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    r.end(b);
  });
});

srv.listen(0, '127.0.0.1', async () => {
  const browser = await chromium.launch({
    args: ['--no-sandbox'],
    executablePath: fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + srv.address().port + '/cielo-se-cae.html');
  await page.waitForTimeout(400);

  const total = await page.evaluate(() => MAX_LEVEL);
  let failed = 0;

  for (let lvl = 1; lvl <= total; lvl++) {
    const r = await page.evaluate((lvl) => {
      running = false;
      level = lvl; loadLevel(lvl);
      // escalera: plataformas de abajo a arriba + la meta como último peldaño
      const steps = data.platforms.slice()
        .sort((a, b) => b.y - a.y)
        .map(q => ({ x0: q.x, x1: q.x + q.w, y: q.y, kind: q.kind }));
      steps.push({ x0: data.goal.x, x1: data.goal.x + data.goal.w,
                   y: data.goal.y + data.goal.h, kind: 'META' });

      const report = [];
      for (let i = 1; i < steps.length; i++) {
        const from = steps[i - 1], to = steps[i];
        // ponerse en el borde de `from` que mira hacia `to`
        const toRight = to.x0 > from.x0;
        player.x = toRight ? from.x1 - player.w - 2 : from.x0 + 2;
        player.y = from.y - player.h;
        player.vx = 0; player.vy = 0;
        player.onGround = true; player.jumpsLeft = MAX_JUMPS;

        keys = {};
        keys[toRight ? 'ArrowRight' : 'ArrowLeft'] = true;

        let arrived = false;
        for (let f = 0; f < 200; f++) {
          if (f === 6) jumpPressed = true;      // corre un poco y salta
          update();
          // llegamos si aterrizamos en algo más alto que el peldaño anterior
          if (player.onGround && player.y < from.y - 5) { arrived = true; break; }
          if (player.y > canvas.height) break;  // se cayó
        }
        report.push({ from: from.kind + '@' + Math.round(from.y),
                      to: to.kind + '@' + Math.round(to.y), arrived });
        if (!arrived) break;                    // se detiene en el primer fallo
      }
      return { lvl, report, ok: report.every(s => s.arrived),
               steps: steps.length - 1 };
    }, lvl);

    const done = r.report.filter(s => s.arrived).length;
    console.log((r.ok ? 'PASS' : 'FAIL') + `  nivel ${r.lvl}: ${done}/${r.steps} saltos` +
                (r.ok ? ' (escalera completa)' :
                 ` -> se rompe en ${r.report[r.report.length - 1].from} -> ` +
                 `${r.report[r.report.length - 1].to}`));
    if (!r.ok) failed++;
  }

  console.log(`\n${total - failed}/${total} niveles jugables saltando de plataforma en plataforma`);
  await browser.close(); srv.close();
  process.exit(failed === 0 ? 0 : 1);
});
