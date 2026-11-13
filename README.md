# Juegos

Sitio estático con **cuatro juegos** y una portada para elegir. Sin build, sin dependencias:
se publica la carpeta tal cual (Netlify, GitHub Pages, o un `python3 -m http.server`).

```
index.html            ← portada: elegir juego
piso-es-lava.html     ← 🌋 lava (10 niveles)
cielo-se-cae.html     ← ☁️ nubes (10 niveles)
naturaleza.html       ← 🌿 selva (10 niveles)
cosmico.html          ← 🌌 espacio (10 niveles)
musica/               ← 11 temas .ogg (+ los .rbs originales de ReBirth)
netlify.toml          ← configuración de Netlify (sin build)
```

### Los cuatro ambientes y su mecánica

Cada mundo tiene **una mecánica propia**, no solo un cambio de colores:

| Juego | Ambiente | Mecánica característica | Música |
|---|---|---|---|
| El Piso es Lava | 🌋 lava | lava móvil que patrulla los huecos | 3 temas, 132-92 BPM |
| El Cielo se Cae | ☁️ cielo | nubes que se mecen y se hunden, brisa que empuja | 3 temas, 120-112 BPM |
| La Selva Sube | 🌿 selva | **ramas finas que se rompen** + **lianas** que lanzan | 2 temas, 112-116 BPM, tambores |
| Órbita Perdida | 🌌 espacio | **gravedad baja** (0,26 vs 0,6) + **portales** | 2 temas, 88-96 BPM, con eco |

### Pruebas

```bash
cd /tmp/pwtest
NODE_PATH=/tmp/pwtest/node_modules node ~/juegos/test_portada.cjs       # portada + 4 juegos + subcarpeta
NODE_PATH=/tmp/pwtest/node_modules node ~/juegos/test_piso_es_lava.cjs   # 29
NODE_PATH=/tmp/pwtest/node_modules node ~/juegos/test_cielo_se_cae.cjs   # 35
NODE_PATH=/tmp/pwtest/node_modules node ~/juegos/test_selva.cjs          # 25
NODE_PATH=/tmp/pwtest/node_modules node ~/juegos/test_cosmos.cjs         # 23
NODE_PATH=/tmp/pwtest/node_modules node ~/juegos/test_stumble.cjs        # 10 (tumbo, rival, corona, marea)
NODE_PATH=/tmp/pwtest/node_modules node ~/juegos/test_home.cjs          # 15 (boton Inicio en los 4 juegos)
```

Los cuatro juegos se comprobaron además **jugables de principio a fin** con
`escalera_cielo_se_cae.cjs` (adapta la ruta cambiando el nombre del archivo):
los 10 niveles de cada uno se suben peldaño a peldaño con el motor real.

## Desplegar en Netlify desde GitHub

El repo ya está publicado en **https://github.com/gaolivaresm/pedro-rules** (rama `main`).

Para subir cambios en el futuro:

```bash
cd ~/juegos
git add -A
git commit -m "lo que cambiaste"
git push
```

Luego, en Netlify: **Add new site → Import an existing project → GitHub → `pedro-rules`**.

| Ajuste en Netlify | Valor |
|---|---|
| Branch to deploy | `main` |
| Build command | *(vacío)* |
| Publish directory | `.` |
| Framework preset | None |

`netlify.toml` ya declara esos valores, así que no hay que tocarlos. Cada `git push`
publica los cambios automáticamente.

**Por qué funciona sin configurar nada:** todos los assets usan rutas **relativas**
(`musica/…`), así que el sitio vale igual en la raíz del dominio o en una subcarpeta
(probado sirviéndolo desde `/juegos/`).

**Para probarlo en local antes de subir:**

```bash
cd ~/juegos && python3 -m http.server 8000
# y abre http://localhost:8000
```

---

## Pruebas del sitio

```bash
cd /tmp/pwtest
NODE_PATH=/tmp/pwtest/node_modules node ~/juegos/test_portada.cjs        # portada + navegación + subcarpeta
NODE_PATH=/tmp/pwtest/node_modules node ~/juegos/test_piso_es_lava.cjs   # 29 comprobaciones
NODE_PATH=/tmp/pwtest/node_modules node ~/juegos/test_cielo_se_cae.cjs   # 35 comprobaciones
NODE_PATH=/tmp/pwtest/node_modules node ~/juegos/escalera_cielo_se_cae.cjs # los 10 niveles jugables
```

Los `.cjs` quedan en el repo (documentan y permiten re-verificar), pero no se sirven en
el sitio: `netlify.toml` los redirige a la portada.

---

## El Cielo se Cae — `cielo-se-cae.html`

Versión "de nubes" de El Piso es Lava: misma física, otro mundo. **10 niveles.**
Ábrelo con doble clic o `google-chrome cielo-se-cae.html`.

**Controles:** ← → moverse · ↑ saltar (doble salto) · **1-6 elegir personaje** · R reiniciar · M música · **⌂ / Esc volver al inicio**.
En móvil: botones ◀ ▶ y ⤒ (solo aparecen en pantallas táctiles); tocar el tablero también salta.

| Elemento | Qué es |
|---|---|
| ☁️ Nube | plataforma blanda: se mece despacio y **se hunde un poco al pisarla** |
| 🌉 Pasarela | plancha de madera con cuerdas: firme, no se mueve |
| 🌫️ Rampa de nube | cuesta que da impulso al bajarla |
| ⭐ Estrella | +10 puntos |
| 🌈 Arcoíris | +50, solo en el nivel 3 (escondido arriba) |
| 🌬️ Brisa | zona que empuja al jugador; se ve con flechas de aire y sopla por pulsos |
| ⬜ Meta | portal de nube dorado; pasa los 3 y suena la fanfarria |

**Niveles (10), dificultad creciente:**

| Nivel | Nombre | Qué añade |
|---|---|---|
| 1 | Nubes | subida tranquila, nubes amplias |
| 2 | Zigzag | sube y baja; primeras brisas |
| 3 | Altura | nubes pequeñas, huecos grandes, primer arcoíris |
| 4 | Torres | pasarelas largas y nubes estrechas |
| 5 | Vaivén | zigzag amplio con dos brisas opuestas |
| 6 | Escalera | nubes cada vez más pequeñas |
| 7 | Cruce | dos rutas: la alta es más corta pero estrecha |
| 8 | Cielo alto | saltos largos, brisas fuertes, nubes muy movedizas |
| 9 | Ocho | sube en zigzag y baja, brisa en el centro |
| 10 | La cima | todo junto: nubes de 65 px, 3 brisas, balanceo suave |

Datos medidos: la nube más estrecha pasa de **150 px (nivel 1)** a **65 px (nivel 10)**, y
del nivel 5 en adelante todos tienen brisa y arcoíris. En los 10 la meta se apoya en la
plataforma más alta, así que se llega saltando, no con un salto de precisión vertical.

**Música:** los tres temas se turnan cada 3 niveles (1-4-7 / 2-5-8 / 3-6-9), el nivel 10
usa el tema "Altura" con más volumen, y la fanfarria suena al terminar los 10.

**Música (ReBirth RB-338)**, tres temas alegres/celestiales con tempos distintos:

| Tema | Archivo | Tempo | Carácter |
|---|---|---|---|
| Nubes | `musica/cielo-1-nubes.ogg` | 120 BPM | cuatro por cuatro alegre, campana 808 y ride |
| Brisa | `musica/cielo-2-brisa.ogg` | 126 BPM | más movido, charles con más ritmo |
| Altura | `musica/cielo-3-altura.ogg` | 112 BPM | etéreo: notas largas y delay alto |
| Victoria | `musica/cielo-victoria.ogg` | — | fanfarria al pasar las 3 nubes (sin loop) |

### Pruebas

```bash
cd /tmp/pwtest
NODE_PATH=/tmp/pwtest/node_modules node ~/juegos/test_cielo_se_cae.cjs    # 35 comprobaciones
NODE_PATH=/tmp/pwtest/node_modules node ~/juegos/escalera_cielo_se_cae.cjs # los 10 niveles jugables
```

`test_cielo_se_cae.cjs` verifica **35 comportamientos**: los 10 niveles válidos y con tema,
la dificultad creciente, que la meta se apoye en la última plataforma, física, estrellas,
arcoíris, caída, meta, fin de juego, brisa, hundimiento de nubes, pasarelas firmes, nubes
que no se salen del lienzo, que la nube **no tenga raya recta de borde a borde**, los 4
temas, píxeles del render y todo el bloque móvil.

`escalera_cielo_se_cae.cjs` sube cada nivel **peldaño a peldaño** con el motor real
(correr, saltar y aterrizar en la siguiente plataforma) y falla si algún salto no se puede
hacer. Sirve al añadir niveles nuevos.

`bot_cielo_se_cae.cjs` es un bot que juega sin planificar; se queda corto en niveles con
zigzag (no sabe retroceder a propósito), así que la referencia fiable de jugabilidad es
`escalera_cielo_se_cae.cjs`.

---

## El Piso es Lava — `piso-es-lava.html`

Juego HTML5 canvas de un solo archivo (sin dependencias). Ábrelo directamente con
`firefox piso-es-lava.html` o `google-chrome piso-es-lava.html`.

**Controles:** ← → moverse · ↑ saltar (doble salto) · **1-6 elegir personaje** · R reiniciar (al terminar el juego) · M música on/off · **⌂ / Esc volver al inicio**.
En móvil: botones ◀ ▶ y ⤒ en pantalla (aparecen solo en pantallas táctiles); tocar el tablero también salta.

### Toques estilo Stumble Guys (en los 4 juegos)

Las cuatro mecánicas están en **todos** los juegos, cada una adaptada a su mundo:

| Qué | Cómo funciona | Lava | Cielo | Selva | Espacio |
|---|---|---|---|---|---|
| 🤸 **Tumbo** | Al morir, el personaje sale girando por los aires con ojos mareados | ✅ | ✅ | ✅ | ✅ |
| 🏁 **Rival bot** | Un rival corre el mismo nivel con tu misma física; el HUD dice quién va delante | ✅ | ✅ | ✅ | ✅ |
| 👑 **Corona y personajes** | Los puntos se acumulan entre partidas (guardados en el navegador); a 300/700/1200/1800/2600 se desbloquean 5 personajes (teclas 1-6) | ✅ | ✅ | ✅ | ✅ |
| 🌊 **Modo eliminación** | En los niveles 5 y 10 el peligro sube solo | lava | tormenta | río | vacío |

El progreso se guarda **por juego** (`localStorage`, clave distinta en cada uno), así que
cada mundo tiene sus propios personajes y coronas.

### Móvil

El juego es totalmente jugable en teléfono y tablet:

- El canvas mantiene 800×500 internos (la física no cambia) y **escala al viewport**
  conservando la proporción 8:5, sin scroll ni desbordes a ningún tamaño probado
  (360×640, 390×844, 844×390, 768×1024, 1280×800).
- Botones táctiles con **pointer events**: `◀ ▶` a la izquierda y `⤒` (saltar) a la derecha.
  Soportan **multitouch**: puedes mantener la dirección y saltar a la vez.
- En vertical el sobra alto se aprovecha con **botones grandes abajo** (100×88 px), donde
  llegan los pulgares; en horizontal la UI se compacta para que todo quepa.
- Sin zoom accidental: `user-scalable=no`, `touch-action` y `-webkit-tap-highlight-color`.

### Música

Tres temas hechos en **ReBirth RB-338** (TR-909 batería, TR-808 toms/campana, TB-303 bajo):

| Tema | Archivo | Cuándo suena |
|---|---|---|
| Principal | `musica/piso-es-lava.ogg` | niveles 1-9, en loop, 132 BPM |
| Final | `musica/piso-es-lava-final.ogg` | nivel 10: 92 BPM, oscuro, filtro que se abre |
| Fanfarria | `musica/piso-es-lava-victoria.ogg` | una vez al completar los 10 niveles |

Si el navegador bloquea el autoplay, la música arranca con la primera tecla o clic.
La tecla **M** la apaga y enciende. Las fuentes `.rbs` están junto a los `.ogg` y se pueden
abrir en ReBirth o renderizar con `orb render`.

### Contenido

- 10 niveles: 1-3 a mano, 4-10 generados proceduralmente (deterministas por nivel).
- 🪙 moneda +10 · 💎 gema +50 · ⚠️ celda trampa (te congela y devuelve al inicio).
- ☠️ lava móvil naranja desde el nivel 6 (patrulla el hueco entre plataformas).
- 🟩 meta: avanza de nivel; al superar el 10, pantalla final con puntaje.

### Mejoras aplicadas sobre la versión original

| Área | Antes | Ahora |
|---|---|---|
| Control aéreo | aceleración sin tope (velocidad infinita) | tope `MAX_SPEED` de 5 px/frame |
| Salto | se perdía si lo pulsabas 1 frame antes de aterrizar | *jump buffer* (6 frames) |
| Borde de plataforma | caías al salir del borde aunque estuvieras justo encima | *coyote time* (6 frames) + tolerancia 6 px |
| Teclas | quedaban "pegadas" al cambiar de ventana | se limpian en `blur` |
| Fin de partida | obligaba a pulsar F5 | tecla **R** reinicia sin recargar |
| Feedback | solo texto de estado | partículas, destellos, sonidos WebAudio (sin archivos), ojos del personaje, barras de saltos restantes |
| Variedad | plataformas iguales todo el rato | lava móvil, gemas, animación en monedas/meta |
| HUD | nivel y puntos | + contador de monedas del nivel |
| Bug | `die()` y `win()` podían dispararse después de cambiar de nivel | `running` y retornos tempranos controlados |
| Bug | `resetPosition()` no reiniciaba `onGround` (podías saltar en el aire) | estado completo reiniciado |
| Móvil | injugable: solo teclado, canvas fijo de 800×500 | canvas responsive 8:5, botones táctiles con multitouch, UI compacta en horizontal |
| Música | solo efectos de sonido sintetizados | 3 temas de ReBirth (principal, final del nivel 10, fanfarria de victoria) |

### Pruebas

`test_piso_es_lava.cjs` carga el juego en Chromium headless (Playwright) y verifica
**29 comportamientos**: física (aterrizaje, doble salto), monedas, muerte, trampas, avance y
fin de nivel, reinicio, lava móvil, determinismo del generador, los tres temas de música,
la fanfarria, errores de consola y **todo el bloque móvil**: layout en 4 tamaños de pantalla,
botones táctiles, multitouch y ausencia de scroll.

```bash
cd /tmp && mkdir -p pwtest && cd pwtest && npm i playwright --silent
cd /home/guillermo/juegos && NODE_PATH=/tmp/pwtest/node_modules node test_piso_es_lava.cjs
```

Usa `/usr/bin/google-chrome` si existe, así no hace falta descargar navegadores.
Deja evidencias en `captura-nivel1.png` y `captura-movil.png`.
