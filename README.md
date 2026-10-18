# 🦖 dinoMau

Endless runner 3D ambientado en la era jurásica. Corre por la selva, esquiva troncos, lava y pterodáctilos, junta monedas, gana batallas contra dinosaurios rivales y desbloquea dinos cada vez más poderosos.

- **Juego:** Three.js + TypeScript + Vite
- **App:** PWA instalable (Android/iOS), controles por swipe y teclado (flechas/WASD)
- **Backend:** Supabase (Auth, Postgres con RLS, Edge Functions)
- **Despliegue:** Cloudflare Pages (frontend) + Supabase (backend)

> Estado: **Fase 10 completada (listo para publicar)**. Funcionan el runner, la tienda, las batallas, las cuentas (email y Google), el monedero en el servidor con validación de partidas, el ranking global y semanal, los referidos con bonos, la imagen para historias, el juego se instala como app (PWA) y funciona sin conexión, y gana dinero con anuncios (revivir, x2 monedas, regalo diario y anuncios entre partidas), por ahora en modo de prueba.
>
> 👉 Para publicarlo en internet sigue **[DEPLOY.md](DEPLOY.md)** (guía paso a paso, sin conocimientos técnicos).
>
> **Dos modos.** Con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` definidas, todo va al servidor. Sin ellas el juego funciona entero en *modo local* (monedero en el dispositivo), útil para desarrollar sin backend.

## Obstáculos y power-ups

| Obstáculo | Cómo se supera | Aparece desde |
|---|---|---|
| Tronco | Saltar | Inicio |
| Rama baja con lianas | Rodar | Inicio |
| Roca / árbol | Cambiar de carril | Inicio |
| Pterodáctilo (baja en picada hasta vuelo rasante) | Rodar | ~650 m |
| Géiser (erupción intermitente) | Cambiar de carril, o pasar cuando está en reposo | ~950 m |
| Río (cruza los 3 carriles) | Saltar (el Spinosaurus lo cruza nadando) | ~350 m |

| Power-up | Efecto | Duración |
|---|---|---|
| 🧲 Imán | Atrae las monedas cercanas de los 3 carriles | 10 s |
| 🛡️ Escudo de ámbar | Absorbe un golpe y da 1,2 s de invulnerabilidad | 15 s |
| 💎 Monedas x2 | Cada moneda vale 2 | 12 s |
| 🦘 Súper salto | Salto de 4,8 m (supera rocas y árboles) | 10 s |

Todo se ajusta en `src/config/obstacles.config.ts`, `src/config/powerups.config.ts` y `src/config/game.config.ts`.

## Dinosaurios

| Dino | Precio | Habilidad en partida |
|---|---|---|
| Compsognathus | Gratis | — |
| Gallimimus | 2.000 | **Arranque veloz**: los primeros 250 m a 1,6× velocidad, atravesando todo |
| Parasaurolophus | 5.000 | **Rugido**: aturde a los pterodáctilos que se acercan (cada 5 s) |
| Velociraptor | 10.000 | **Doble salto** |
| Stegosaurus | 20.000 | **Placas**: aguantan 1 golpe por partida |
| Triceratops | 35.000 | **Embestida**: rompe las rocas |
| Ankylosaurus | 50.000 | Cola-maza (batallas, Fase 4) |
| Spinosaurus | 75.000 | **Nadador**: cruza los ríos sin saltar |
| Tyrannosaurus Rex | 120.000 | Máximo poder de batalla (Fase 4) |

Las estadísticas también cuentan:
- **Velocidad**: +5 % de puntaje por cada punto por encima de 3.
- **Agilidad**: cambios de carril y rodar más rápidos (o más lentos).
- **Poder de batalla**: se usa en las batallas de la Fase 4.

Precios y estadísticas en `src/config/dinos.config.ts`. El balance de habilidades y estadísticas está en `ABILITY_CONFIG` y `STAT_EFFECTS` del mismo archivo. Si cambias un precio, cámbialo también en la tabla `dinos` del servidor.

## Controles

| Acción | Móvil | Escritorio |
|---|---|---|
| Cambiar de carril | Swipe ← → | ← → / A D |
| Saltar | Swipe ↑ | ↑ / W / Espacio |
| Rodar (en el aire: caída rápida) | Swipe ↓ | ↓ / S |
| Pausa | Botón ⏸ | Esc / P |

---

## Índice

1. [Estructura de carpetas](#1-estructura-de-carpetas)
2. [Arquitectura](#2-arquitectura)
3. [Esquema de la base de datos](#3-esquema-de-la-base-de-datos)
4. [Correr en local](#4-correr-en-local)
5. [Desplegar (Cloudflare Pages + Supabase)](#5-desplegar-cloudflare-pages--supabase)
6. [Reemplazar assets placeholder](#6-reemplazar-assets-placeholder)
7. [Fases de entrega](#7-fases-de-entrega)

---

## Batallas

- **Cuándo:** cada **500 monedas recogidas** en pista (con el x2 incluido) el runner se detiene y empieza una batalla. Las monedas ganadas o perdidas en batallas no cuentan para el umbral, así no se encadenan.
- **Rival:** cada batalla **ganada** sube un escalón en `src/config/rivals.config.ts`: Dilophosaurus (poder 10) → … → Rey del Volcán (105), y después sigue creciendo. Si pierdes, repites el mismo rival.
- **Minijuego (15–20 s):** alterna dos fases.
  - **Ataque:** toca rápido (o pulsa Espacio). Máximo 12 toques por segundo.
  - **Defensa:** el rival avisa su ataque con una flecha y un anillo que se cierra. Desliza en esa dirección (o usa las flechas) justo cuando se cierra el anillo.
    - *Perfecto*: contraataque.
    - *Bien*: daño leve.
    - *Fallo*: daño fuerte.
- **Resultado:** gana quien deje al otro sin vida o, al acabar el tiempo, quien tenga más vida. El daño combina tu habilidad con el cociente de poder de batalla de tu dino frente al del rival. Las habilidades también cuentan: el Ankylosaurus duplica el contraataque y el T-Rex pega un 25 % más.
- **Efecto en monedas** (`src/config/battle.config.ts`, igual en el servidor):
  - Ganar: se duplican las monedas de la partida, con un tope de 5.000 por batalla.
  - Perder: −100.
  - `multiplyTarget: 'total'` duplica el saldo total en lugar de solo las monedas de la partida.
- **Vuelta al runner:** se limpian los obstáculos de los 45 m siguientes y hay una cuenta regresiva de 3 s.
- **Balance:** `npm run balance` imprime la tabla de victorias de cada dino contra cada rival para tres perfiles de jugador simulados. Úsala cada vez que toques poderes o daños.

## 1. Estructura de carpetas

```
dinoMau/
├── index.html                     # Punto de entrada; contenedor del canvas + capa de UI
├── package.json
├── tsconfig.json
├── vite.config.ts                 # Vite + vite-plugin-pwa
├── public/_headers                # Cabeceras de caché para Cloudflare Pages
├── .env.example
│
├── public/
│   ├── icons/                     # Iconos PWA (192, 512, maskable, apple-touch)
│   └── assets/                    # ⬅ Assets reemplazables (servidos en /assets/...)
│       ├── models/
│       │   ├── dinos/             # compsognathus.glb, velociraptor.glb, ...
│       │   ├── rivals/            # Modelos de rivales de batalla
│       │   ├── obstacles/         # log.glb, low_branch.glb, rock.glb, tree.glb, geyser.glb, pterodactyl.glb
│       │   ├── collectibles/      # coin.glb, magnet.glb, amber_shield.glb, x2.glb, super_jump.glb
│       │   └── environment/       # Tramos de suelo, volcanes, ríos de lava, huesos, nidos, lianas
│       ├── textures/              # Atlas de colores low-poly, gradientes de cielo
│       ├── audio/
│       │   ├── music/             # menu.ogg, run.ogg, battle.ogg (tribal / percusión)
│       │   └── sfx/               # coin, jump, roll, hit, roar, powerup, win, lose
│       ├── ui/                    # logo.svg, botones, fondos de la tienda
│       ├── fonts/
│       └── README.md              # Convenciones: escala, ejes, nombres, límites de polígonos
│
├── src/
│   ├── main.ts                    # Bootstrap: renderer, servicios, splash → menú
│   │
│   ├── config/                    # ⬅ Todo lo balanceable vive aquí
│   │   ├── game.config.ts         # Carriles, gravedad, velocidad base / máx., curva de dificultad
│   │   ├── dinos.config.ts        # Los 9 dinos: precio, stats, habilidad, modelo, color placeholder
│   │   ├── battle.config.ts       # Umbral 500, multiplicador x2, penalización 100, tope, objetivo (partida/saldo)
│   │   ├── rivals.config.ts       # Escalera de rivales por progreso
│   │   ├── powerups.config.ts     # Duración y efecto de imán, escudo, x2, súper salto
│   │   ├── referral.config.ts     # Solo para mostrar en UI (el servidor es la autoridad)
│   │   ├── ads.config.ts          # Anuncios: revivir, x2, regalo diario, ritmo entre partidas
│   │   └── assets.manifest.ts     # clave → ruta GLB/audio + fábrica placeholder de respaldo
│   │
│   ├── core/                      # Motor genérico, sin lógica de dinoMau
│   │   ├── Game.ts                # Loop principal (fixed timestep + render)
│   │   ├── SceneManager.ts        # Cambia entre escenas: runner, batalla, tienda
│   │   ├── StateMachine.ts        # Estados de juego (menu, running, paused, battle, gameover)
│   │   ├── EventBus.ts            # Eventos tipados entre sistemas y UI
│   │   ├── ObjectPool.ts          # Pool genérico para obstáculos, monedas, partículas
│   │   └── SeededRandom.ts        # PRNG con semilla (la entrega el servidor por partida)
│   │
│   ├── engine/
│   │   ├── Renderer.ts            # WebGLRenderer, pixel ratio adaptativo, resize
│   │   ├── CameraRig.ts           # Cámara en tercera persona detrás del dino
│   │   └── Lighting.ts            # Luz hemisférica + direccional, niebla de selva
│   │
│   ├── input/
│   │   ├── InputManager.ts        # Unifica fuentes → acciones (left/right/jump/roll/pause)
│   │   ├── SwipeInput.ts          # Gestos táctiles con umbral y buffer
│   │   └── KeyboardInput.ts       # Flechas + WASD + Espacio/Escape
│   │
│   ├── assets/
│   │   ├── AssetLoader.ts         # Carga GLB/audio; si falta el archivo usa el placeholder
│   │   └── placeholders/          # Fábricas de mallas low-poly con geometrías y colores
│   │       ├── dinoPlaceholder.ts
│   │       ├── obstaclePlaceholders.ts
│   │       └── environmentPlaceholders.ts
│   │
│   ├── runner/                    # Modo de juego principal
│   │   ├── RunnerScene.ts
│   │   ├── player/
│   │   │   ├── Player.ts          # Malla + estado (carril, salto, rodada, invulnerable)
│   │   │   ├── PlayerController.ts
│   │   │   └── abilities/         # Una clase por habilidad (DoubleJump, PlateShield, RockBreaker, ...)
│   │   ├── world/
│   │   │   ├── ChunkGenerator.ts  # Tramos procedurales a partir de la semilla
│   │   │   ├── patterns.ts        # Patrones de obstáculos/monedas por dificultad
│   │   │   ├── biomes.ts          # Selva, lava, volcán, río (zona Spinosaurus)
│   │   │   └── Decorations.ts     # Elementos sin colisión a los lados
│   │   ├── entities/              # Obstacle, Coin, PowerUp, Pterodactyl, Geyser
│   │   └── systems/
│   │       ├── CollisionSystem.ts # AABB por carril (barato y predecible)
│   │       ├── DifficultySystem.ts
│   │       ├── PowerUpSystem.ts
│   │       ├── ScoreSystem.ts
│   │       └── RunRecorder.ts     # Registra eventos para validar la partida en el servidor
│   │
│   ├── battle/
│   │   ├── BattleScene.ts         # Escena de enfrentamiento (dino vs rival)
│   │   ├── QTEController.ts       # Toques rápidos + esquivas por timing
│   │   ├── RivalSelector.ts
│   │   └── BattleResolver.ts      # Combina precisión QTE + poder de batalla → resultado
│   │
│   ├── shop/
│   │   ├── ShopScene.ts           # Plataforma giratoria 3D
│   │   └── DinoInventory.ts       # Estado: bloqueado / comprable / comprado / equipado
│   │
│   ├── ui/                        # UI en DOM (ligera, sin framework) sobre el canvas
│   │   ├── UIManager.ts           # Navegación entre pantallas
│   │   ├── screens/               # Splash, MainMenu, Hud, Pause, GameOver, Shop, Battle,
│   │   │                          # Leaderboard, Invite, Settings, Profile, Auth
│   │   ├── components/            # Button, Modal, Toast, CoinCounter, Countdown
│   │   └── styles/                # variables.css (paleta), screens.css
│   │
│   ├── services/                  # Todo lo que habla con Supabase
│   │   ├── supabaseClient.ts
│   │   ├── AuthService.ts         # Email, Google, invitado
│   │   ├── ProfileService.ts
│   │   ├── EconomyService.ts      # Compras / equipar (vía Edge Functions)
│   │   ├── RunService.ts          # start-run / finish-run
│   │   ├── LeaderboardService.ts
│   │   └── ReferralService.ts
│   │
│   ├── ads/                       # AdService, AdPacer, AdFlows y redes (Mock, AdSense)
│   ├── share/
│   │   ├── StoryImage.ts          # Canvas 1080×1920 para historias
│   │   └── ShareService.ts        # Web Share API + fallbacks + WhatsApp/Facebook/X
│   │
│   ├── audio/AudioManager.ts      # Música y SFX (sintetizados con Web Audio hasta tener archivos reales)
│   ├── i18n/                      # i18n.ts + es.json (por defecto) + en.json
│   ├── storage/LocalStore.ts      # Ajustes, progreso de invitado, código de referido pendiente
│   ├── types/                     # Tipos compartidos y tipos generados de la BD
│   └── utils/                     # math, device (detección de gama), haptics
│
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20261018000000_init.sql   # ✅ Esquema completo (incluido en esta entrega)
│   │   ├── 20261019000000_runs_and_ranking.sql
│   │   └── 20261020000000_ads.sql    # Recompensas por anuncio con topes diarios
│   ├── seed.sql                      # Usuarios de prueba para desarrollo
│   └── functions/
│       ├── _shared/                  # cors.ts, auth.ts (getUser), config.ts, validation.ts
│       ├── start-run/                # Abre una partida y devuelve la semilla
│       ├── finish-run/               # Valida plausibilidad, aplica batallas, acredita monedas
│       ├── purchase-dino/            # Compra con verificación de saldo
│       ├── claim-referral/           # Bono de bienvenida (email verificado, una sola vez)
│       └── ad-reward/                # Monedas por anuncio (x2 y regalo diario, con topes)
│
└── tests/
    ├── unit/                      # Vitest: pool, carriles, resolver de batalla, validación
    └── sql/                       # Pruebas de RLS y funciones económicas
```

**Reglas de modularidad**

- `core/` y `engine/` no conocen dinosaurios ni monedas: se pueden reutilizar.
- Los sistemas se comunican por `EventBus` (`coin:collected`, `battle:trigger`, `run:over`…), así la UI y el audio no dependen de la lógica de juego.
- Cualquier número de balance está en `src/config/`. Las reglas económicas se repiten en la tabla `game_config` del servidor, que es la autoridad.

---

## 2. Arquitectura

```
┌──────────────────── Cliente (PWA) ────────────────────┐
│ Three.js runner ── EventBus ── UI DOM / Audio         │
│        │                                              │
│  RunRecorder (eventos de la partida)                  │
│        │                                              │
│  services/*  ── supabase-js (anon key + JWT usuario)  │
└────────┬───────────────────────────┬──────────────────┘
         │ SELECT (RLS: solo lo mío) │ invoke()
         ▼                           ▼
┌─────────────────┐       ┌──────────────────────────┐
│ Postgres + RLS  │◀──────│ Edge Functions           │
│                 │ RPC   │ (service_role, servidor) │
│ funciones SQL   │       │ valida → finalize_run()  │
│ transaccionales │       │          purchase_dino() │
└─────────────────┘       │          claim_referral()│
                          └──────────────────────────┘
```

### Flujo de una partida (con antitrampas)

1. **`start-run`** crea una fila en `runs` (`status = started`) y devuelve `run_id` + `seed`. Solo puede haber una partida abierta por usuario.
2. El cliente genera el mundo con esa semilla. `RunRecorder` guarda distancia, duración, monedas y cada batalla (precisión QTE, resultado, monedas antes).
3. Cada 500 monedas en la partida se lanza una batalla. El resultado se muestra al instante en el cliente, pero **el servidor vuelve a calcular el efecto** al cerrar la partida.
4. **`finish-run`** valida:
   - duración real (servidor) frente a la duración informada,
   - monedas/segundo y monedas/metro dentro de los límites de `game_config.anticheat`,
   - número de batallas coherente con las monedas (una por cada umbral alcanzado),
   - efecto de cada batalla recalculado con `game_config.battle` (multiplicador, penalización, tope por batalla, objetivo partida/saldo).

   Si todo cuadra, llama a `finalize_run()` y acredita las monedas. Si no, la partida queda `rejected` y no acredita nada.
5. Los invitados juegan en local; su progreso no se guarda en el servidor ni cuenta para el ranking.

> La precisión de los QTE la informa el cliente y no se puede verificar al 100%. Por eso el **tope por batalla**, el límite de batallas por partida y el límite de monedas por segundo son la defensa principal de la economía.

---

## 3. Esquema de la base de datos

Archivo completo: [`supabase/migrations/20261018000000_init.sql`](supabase/migrations/20261018000000_init.sql) (probado en Postgres 16).

```
auth.users ──1:1── profiles ──1:N── user_dinos ──N:1── dinos
                      │
                      ├──1:N── coin_ledger         (libro contable inmutable)
                      ├──1:N── runs ──1:N── battles
                      └──1:N── referrals (como invitador)
                         1:1── referrals (como invitado, UNIQUE)

game_config  (battle · referral · anticheat en JSONB)
```

| Tabla | Propósito | Columnas clave |
|---|---|---|
| `game_config` | Reglas económicas del servidor | `key`, `value jsonb` |
| `dinos` | Catálogo y precios autoritativos | `id`, `price`, `speed`, `agility`, `battle_power`, `ability` |
| `profiles` | Perfil y saldo del jugador | `referral_code` (único), `coins` (≥ 0), `equipped_dino_id`, `best_score`, `language` |
| `user_dinos` | Dinos comprados | PK (`user_id`, `dino_id`) |
| `coin_ledger` | Cada movimiento de monedas | `delta`, `reason`, `ref_id`, `balance_after` · índice único de idempotencia |
| `runs` | Partidas | `seed`, `status`, `distance`, `score`, `coins_collected`, `coins_awarded`, `rejection_reason` |
| `battles` | Batallas de cada partida | `sequence`, `rival_id`, `qte_accuracy`, `result`, `coins_delta` |
| `referrals` | Relación invitador ↔ invitado | `invitee_id` UNIQUE, `welcome_bonus`, `inviter_bonus_granted_at` |

**Funciones SQL** (solo las puede llamar `service_role`):

| Función | Qué hace |
|---|---|
| `apply_coin_delta` | Suma o resta saldo de forma atómica y lo registra en el ledger. Rechaza saldo negativo. |
| `purchase_dino` | Comprueba precio y propiedad, inserta el dino y cobra. |
| `claim_referral` | Valida el código, bloquea autorreferidos y ventana de tiempo, y da el bono una sola vez. |
| `finalize_run` | Cierra la partida, guarda batallas, actualiza récord y estadísticas, acredita monedas y da el bono al invitador en la primera partida del referido. |
| `get_leaderboard(period)` | Ranking `all` o `weekly`. Pública, expone solo `username`, dino y puntaje. |

**Seguridad**

- RLS activo en todas las tablas: cada usuario solo **lee** sus filas. `dinos` y `game_config` son de lectura pública.
- Los clientes **no pueden** insertar ni borrar en ninguna tabla. En `profiles` solo pueden actualizar `username`, `avatar_url`, `language` y `equipped_dino_id`; un trigger impide equipar un dino que no se posee.
- El bono de referido exige email verificado (lo comprueba la Edge Function con `auth.users.email_confirmed_at`), es único por cuenta (`invitee_id UNIQUE`) e idempotente (índice único en el ledger).

---

## 4. Correr en local

### Requisitos

- Node.js ≥ 20
- [Supabase CLI](https://supabase.com/docs/guides/cli) ≥ 2
- Docker (lo usa Supabase en local)

### Pasos

```bash
# 1. Dependencias
npm install

# 2. Supabase local (Postgres, Auth, Edge Functions)
supabase start          # muestra API URL y anon key
supabase db reset       # aplica migraciones + seed.sql

# 3. Variables de entorno
cp .env.example .env.local
#   → pega la API URL y la anon key que mostró `supabase start`

# 4. Edge Functions en local (otra terminal)
supabase functions serve

# 5. Juego
npm run dev             # http://localhost:5173
```

Para probar en el móvil dentro de la misma red: `npm run dev -- --host` y abre la IP que muestra Vite. La instalación como PWA requiere HTTPS; en local usa `npm run preview` con un túnel (por ejemplo `cloudflared tunnel`).

| Script | Uso |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción en `dist/` |
| `npm run preview` | Sirve el build localmente |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run balance` | Tabla de balance de batallas |
| `npm run test:db` | Pruebas de integración del servidor contra un Postgres temporal (sin Docker; necesita PostgreSQL ≥ 15 instalado) |
| `npm run check:functions` | Comprueba los tipos de las Edge Functions con Deno |

---

## Cómo funciona el servidor (Fase 5)

| Qué | Dónde | Notas |
|---|---|---|
| Cuentas | Supabase Auth | Email con confirmación por correo y Google. Los invitados juegan, pero no guardan monedas, no compran y no salen en el ranking. |
| Perfil, saldo y dinos | `profiles`, `user_dinos` | El cliente solo **lee** sus filas (RLS). Desde el cliente solo se pueden cambiar `username` y el dino equipado, y la base de datos comprueba que el dino sea suyo. |
| Abrir partida | Edge Function `start-run` | Devuelve `runId` y la **semilla** del recorrido, generada en el servidor. |
| Cerrar partida | Edge Function `finish-run` | Valida tiempo real frente a tiempo de juego, distancia posible según la curva de velocidad, monedas por metro y por segundo, puntaje y la cadena de batallas. **Recalcula** el efecto de cada batalla y acredita lo que calcula el servidor, nunca el total que dice el cliente. Si algo no cuadra, la partida queda `rejected` con su motivo. |
| Compras | Edge Function `purchase-dino` | Saldo y precio comprobados en una transacción. Cada movimiento queda en `coin_ledger`. |
| Ranking | `get_leaderboard('all' \| 'weekly')`, `get_my_rank` | Solo expone nombre, dino y puntaje. |

### Referidos (Fase 6)

1. **Tu link:** cada jugador tiene un código único y un link `https://<dominio>/r/CODIGO`, que está en *Invitar amigos*. Desde ahí se puede copiar, mandar por WhatsApp o compartir con el menú nativo del móvil. La pantalla muestra cuántos amigos se registraron, cuántos jugaron y cuántas monedas te dieron.
2. **Tu amigo abre el link:** el código se guarda en su dispositivo y el juego abre el registro con el mensaje "Un amigo te invitó…". Si se registra con correo, el código también viaja en los metadatos de la cuenta, para que funcione aunque confirme el correo desde otro dispositivo.
3. **Bono de bienvenida (500):** al iniciar sesión, la Edge Function `claim-referral` lo concede si se cumplen todas las condiciones:
   - el correo está verificado (con Google cuenta como verificado);
   - es el primer bono de esa cuenta;
   - no han pasado más de 72 h desde el registro;
   - no es su propio código ni un referido cruzado (A invita a B y B invita a A).
4. **Bono del invitador (250):** se concede cuando el amigo termina su **primera partida válida**; una partida rechazada por trampa no cuenta. Hay un tope de 20 bonos de invitador al día para frenar granjas de cuentas falsas.

Todo se valida en el servidor (Edge Function + SQL). Los valores están en `game_config.referral` y se reflejan para la interfaz en `src/config/referral.config.ts`.

### Compartir en redes (Fase 7)

- **Imagen para historias:** al pulsar *Compartir* en el fin de partida se genera una imagen vertical de 1080×1920 (`src/share/StoryImage.ts`). Lleva el logo, el retrato 3D del dino equipado (`DinoPortrait.ts`), el puntaje, las monedas, la distancia y "¡Nuevo récord!" cuando toca. Al pie va el link de referido si hay cuenta, o la web del juego si eres invitado.
- **Compartir imagen:** usa la Web Share API con el archivo, así en el móvil se abre el menú nativo para elegir WhatsApp (Estados), Instagram (Stories), Facebook, etc. Si el navegador no puede compartir archivos, descarga la imagen y copia el texto con el link.
- **Botones directos:** WhatsApp (`wa.me` con texto y link), Facebook (`sharer.php` con el link) y X (`x.com/intent/post`). Estas redes no aceptan adjuntar la imagen por URL, así que llevan solo texto y link.
- La imagen se dibuja con formas en Canvas, sin imágenes externas ni emojis dentro del canvas (no todos los móviles tienen fuente de emojis), así funciona también sin conexión.

La lógica de las Edge Functions vive en `supabase/functions/_shared/handlers.ts` y `validation.ts`, sin dependencias de Deno, así se prueba con Vitest:
- `tests/unit/Validation.test.ts`: reglas antitrampas.
- `tests/integration/server.test.ts`: flujos completos contra Postgres real con las migraciones aplicadas.
- `tests/unit/ConfigSync.test.ts`: falla si los precios o las reglas del cliente dejan de coincidir con los del SQL.

### PWA y rendimiento (Fase 8)

- **Instalable:** `vite-plugin-pwa` genera el manifiesto y el service worker. En Android aparece el botón *📲 Instalar app* en el menú; en iPhone ese botón explica cómo usar *Compartir → Añadir a pantalla de inicio* (`src/pwa/PwaService.ts`, `IosInstallSheet.ts`).
- **Sin conexión:** todo el juego (código, fuentes, iconos) queda en caché tras la primera visita. Las llamadas a Supabase nunca se sirven de caché; sin conexión se juega en modo invitado. Los modelos GLB y audios de `public/assets/` se guardan en caché al usarse.
- **Actualizaciones:** cuando publicas una versión nueva, el menú muestra un aviso *Actualizar*; nunca se recarga a mitad de partida.
- **Fuentes propias:** Lilita One y Nunito se sirven desde el propio juego (`@fontsource`), sin Google Fonts.
- **Carga más rápida:** Three.js va en su propio archivo (se queda en caché entre versiones), el cliente de Supabase solo se descarga si está configurado, y el generador de la imagen para historias solo al compartir. Código del juego: ~47 KB gzip; Three.js: ~160 KB gzip.
- **Calidad adaptativa** (`src/engine/QualityManager.ts`): si la partida baja de 48 FPS durante 3 s, reduce la resolución interna por pasos (hasta 50 %, mínimo 0,75 píxeles por píxel CSS); si va sobrada, la sube. Se recuerda por dispositivo.
- **Pantalla encendida** durante la partida (Screen Wake Lock) y **pausa automática** al cambiar de app o al girar el móvil. En horizontal se muestra el aviso *Gira tu teléfono*: el juego es vertical.
- **Medidas** (Pixel 7 emulado): lógica del juego 0,06 ms por fotograma (0,24 ms con la CPU 4× más lenta; el presupuesto a 60 FPS es 16,6 ms), ~100–120 draw calls y ~25 k triángulos por fotograma.
- **Pantallas probadas:** iPhone SE, iPhone 15 Pro Max, Pixel 7, Galaxy S9+, iPad y móvil en horizontal (menú, tienda, partida, pausa y fin de partida), sin elementos fuera de pantalla.
- **Iconos:** se generan desde `design/icon-source.svg` con `node scripts/generate-icons.mjs`.

### Edad y modo infantil (Fase 10)

- La primera vez el juego pregunta el **año de nacimiento** (`src/ui/screens/AgeScreen.ts`). Es una pregunta neutra: no sugiere ningún año ni explica qué cambia. La respuesta solo se guarda en el dispositivo (`src/age/AgeGate.ts`) y no se puede cambiar desde el juego.
- Con solo el año no se sabe si ya cumplió años, así que ante la duda se elige el **modo infantil** (nacido hace 13 años o menos).
- **Modo infantil** (menores de 13): no se carga Supabase, así que no hay cuenta, ranking ni invitaciones, y un link `/r/CODIGO` pendiente se descarta. Tampoco hay botón de compartir en redes. Monedas y dinos se guardan en el dispositivo. Los anuncios se piden **no personalizados** (`requestNonPersonalizedAds` en AdSense). Revivir, x2 y regalo diario siguen disponibles.
- La política de privacidad (`legal/privacy.html`) lo explica.

### Anuncios (Fase 9)

Todo se configura en `src/config/ads.config.ts`; la red de anuncios se elige con `VITE_ADS_PROVIDER`:

| Valor | Qué hace |
|---|---|
| `mock` (por defecto sin AdSense) | Anuncio de prueba propio: pantalla "ANUNCIO DE PRUEBA" con cuenta atrás |
| `adsense` (por defecto con `VITE_ADSENSE_CLIENT`) | Google AdSense para juegos (H5 Games Ads / Ad Placement API) |
| `none` | Sin anuncios: los botones no aparecen |

| Anuncio | Dónde | Reglas (por defecto) |
|---|---|---|
| 🎬 Revivir | Al chocar, modal "¿Revivir?" con 6 s para decidir | 1 vez por partida, desde 150 m; vuelve invulnerable 2,5 s sin obstáculos cercanos y con cuenta atrás |
| 🎬 x2 monedas | Fin de partida | Desde 20 monedas, extra máximo 2.000, 5 al día, dentro de los 15 min tras la partida, una vez por partida |
| 🎁 Regalo diario | Menú | 150 monedas, 3 al día (día UTC) |
| Entre partidas | Al pulsar *Revancha* o *Menú* tras perder | Nunca en las 2 primeras partidas; máximo 1 cada 3 partidas y cada 3 min; 90 s de respiro tras uno con recompensa |

- **Arquitectura** (`src/ads/`): `AdProvider` (interfaz de una red: `MockAdProvider`, `AdSenseProvider`, `NoAdProvider`), `AdService` (único punto para mostrar anuncios; silencia el juego con `ad:start`/`ad:end`), `AdPacer` (ritmo de los anuncios entre partidas, lógica pura) y `AdFlows` (une anuncio, recompensa, runner y UI). Para añadir otra red (AdMob en una app, el SDK de un portal) basta con otro `AdProvider`.
- **Monedas por anuncio en el servidor**: la Edge Function `ad-reward` llama a `claim_ad_reward` (migración `20261020000000_ads.sql`), que aplica los topes diarios con la fila del perfil bloqueada, comprueba que la partida es del jugador, terminó bien y es reciente, y que no se duplicó antes. Todo queda en `ad_rewards` y en `coin_ledger` (`ad_double`, `ad_gift`).
- **Límite conocido:** un juego web no puede demostrar al servidor que el anuncio se vio entero (AdSense para juegos no tiene verificación servidor a servidor, AdMob sí). Por eso los topes: quien haga trampa gana como mucho lo de un día normal (750 monedas de regalo + 5 duplicados).
- Revivir no da monedas, así que no pasa por el servidor; la partida sigue con el mismo id, tiempo y puntaje, y el antitrampas la valida igual.
- **Páginas legales**: `/privacy.html` (desde `legal/privacy.html` con `VITE_CONTACT_EMAIL`) y `/ads.txt` (con `VITE_ADSENSE_CLIENT`) las genera `scripts/vite-plugin-legal.ts`. El enlace a la política está en *Ajustes*. El aviso de cookies para Europa es el de Google (se activa en AdSense, sin código).
- Pasos para activar AdSense: [DEPLOY.md → Paso 8](DEPLOY.md#paso-8--activar-los-anuncios-reales-google-adsense).

---

## 5. Desplegar (Cloudflare Pages + Supabase)

La guía completa, paso a paso y sin tecnicismos, está en **[DEPLOY.md](DEPLOY.md)**. Resumen técnico:

- **Web:** Cloudflare Pages conectado a GitHub (`main`). Build `npm run build`, salida `dist`, `NODE_VERSION=22`.
  Sin `404.html`, Pages sirve `index.html` en cualquier ruta (SPA), así funcionan los links `/r/CODIGO`.
  Las cabeceras de caché están en `public/_headers`.
- **Variables de entorno (build):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PUBLIC_SITE_URL`,
  `VITE_CONTACT_EMAIL` y, para anuncios, `VITE_ADSENSE_CLIENT`, `VITE_ADSENSE_TEST` y `VITE_ADS_PROVIDER`.
  Ver `.env.example`.
- **Supabase:** las 3 migraciones en orden, las 5 Edge Functions (`start-run`, `finish-run`, `purchase-dino`,
  `claim-referral`, `ad-reward`), *Confirm email* activado, *Site URL* y *Redirect URLs* con el dominio, y SMTP propio
  (Resend) para los correos de confirmación.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` se inyectan solas en las Edge Functions.
  La `service_role` **nunca** va en Cloudflare ni en el cliente.

---

## 6. Reemplazar assets placeholder

Desde el primer día el juego funciona con mallas generadas por código (`src/assets/placeholders/`). Para usar un modelo real:

1. Exporta un `.glb`: 1 unidad = 1 metro, el modelo mira hacia **−Z**, origen a nivel de los pies. Dinos ≤ 5k triángulos, obstáculos ≤ 1,5k.
2. Guárdalo con el nombre que espera el manifiesto, por ejemplo `public/assets/models/dinos/velociraptor.glb`.
3. En `src/config/assets.manifest.ts` la entrada ya apunta a esa ruta. `AssetLoader` lo carga y, si el archivo no existe, usa el placeholder automáticamente.
4. Animaciones esperadas para los dinos (clips GLB): `run`, `jump`, `roll`, `hit`, `roar`, `idle`.

---

## 7. Fases de entrega

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Estructura, esquema de BD, README | ✅ |
| 1 | Proyecto Vite + runner básico (carriles, salto, rodar, obstáculos, monedas, pooling) | ✅ |
| 2 | Power-ups, dificultad progresiva, HUD, pausa, fin de partida | ✅ |
| 3 | Tienda 3D y sistema de dinosaurios y habilidades | ✅ |
| 4 | Sistema de batallas (QTE) | ✅ |
| 5 | Supabase: cuentas, guardado en servidor, ranking | ✅ |
| 6 | Referidos y bonos | ✅ |
| 7 | Imagen para historias y compartir | ✅ |
| 8 | PWA, optimización y pruebas en móvil | ✅ |
| 9 | Anuncios: revivir, x2 monedas, regalo diario, entre partidas; topes en servidor | ✅ |
| 10 | Pregunta de edad y modo infantil (menores de 13); publicación en Cloudflare Pages | ✅ |
