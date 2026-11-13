// ¿Se puede pasar cada nivel? Un bot juega con el motor real del juego:
// mantiene la direccion hacia la meta, salta al acercarse a un borde y, si se
// atasca, insiste con doble salto. Sirve al añadir niveles nuevos.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const srv = http.createServer((q, r) => {
  const f = path.join('/home/guillermo/juegos', decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': q.url.endsWith('.ogg') ? 'audio/ogg' : 'text/html; charset=utf-8' });
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
      level = lvl; score = 0; loadLevel(lvl);
      const goalX = data.goal.x + data.goal.w / 2;
      let won = false, stall = 0, lastX = player.x, best = player.x;

      for (let f = 0; f < 12000; f++) {
        // ¿hemos llegado? (comprobacion al inicio del frame, sin girar ni oscilar)
        const onGoal = player.x + player.w > data.goal.x && player.x < data.goal.x + data.goal.w &&
                       player.y + player.h > data.goal.y && player.y < data.goal.y + data.goal.h;
        if (onGoal) { won = true; break; }

        const cx = player.x + player.w / 2;
        const feet0 = player.y + player.h;
        const underNow = data.platforms.find(pl =>
          player.x + player.w > pl.x && player.x < pl.x + pl.w &&
          feet0 >= pl.y - 8 && feet0 <= pl.y + 10);

        // Objetivo: si estamos en el suelo, la siguiente plataforma MÁS ALTA
        // alcanzable (así se sube una escalera); si no, la meta.
        let targetX = goalX;
        if (underNow) {
          const next = data.platforms
            .filter(pl => pl !== underNow && pl.y < underNow.y && underNow.y - pl.y < 100)
            .filter(pl => {
              const gap = pl.x > underNow.x + underNow.w
                ? pl.x - (underNow.x + underNow.w)
                : (underNow.x > pl.x + pl.w ? underNow.x - (pl.x + pl.w) : 0);
              return gap < 160;
            })
            .sort((a, b) => a.y - b.y)[0];       // el más alto alcanzable
          if (next) targetX = next.x + next.w / 2;
          else if (data.goal.y + data.goal.h < underNow.y) targetX = goalX;
        }
        const dirRight = targetX > cx;
        keys = {};
        keys[dirRight ? 'ArrowRight' : 'ArrowLeft'] = true;

        const feet = player.y + player.h;
        const under = data.platforms.find(pl =>
          player.x + player.w > pl.x && player.x < pl.x + pl.w &&
          feet >= pl.y - 8 && feet <= pl.y + 10);

        let jump = false;
        if (player.onGround) {
          if (under) {
            const toEdge = dirRight ? (under.x + under.w) - (player.x + player.w)
                                    : player.x - under.x;
            // ¿hay una plataforma alcanzable mas adelante? (como ve un humano)
            const reachable = data.platforms.some(pl => {
              if (pl === under || pl.y >= under.y) return false;      // tiene que estar mas alta
              if (under.y - pl.y > 100) return false;                 // demasiado arriba
              const gap = dirRight ? pl.x - (under.x + under.w) : under.x - (pl.x + pl.w);
              return gap < 150 && gap > -pl.w;                        // cerca en horizontal
            });
            if (toEdge < 26 && reachable) jump = true;   // solo salta si hay donde caer
          } else {
            jump = true;                      // sobre una rampa: seguir impulsandose
          }
          if (stall > 40) jump = true;        // atascado: despegarse
        }
        if (jump) jumpPressed = true;

        update();

        if (Math.abs(player.x - lastX) > 1.5) { stall = 0; lastX = player.x; }
        else stall++;
        if (player.x > best) best = player.x;
        if (player.y > canvas.height) break;
      }
      return { lvl, won, best: Math.round(best), goalX: Math.round(goalX),
               pct: Math.round(100 * Math.min(1, best / goalX)) };
    }, lvl);

    console.log((r.won ? 'PASS' : 'FAIL') + `  nivel ${r.lvl} jugable` +
                (r.won ? ` (llego a ${r.pct}% del recorrido)` : ` -> solo ${r.pct}% (x=${r.best} de ${r.goalX})`));
    if (!r.won) failed++;
  }

  console.log(`\n${total - failed}/${total} niveles alcanzables`);
  await browser.close(); srv.close();
  process.exit(failed === 0 ? 0 : 1);
});
