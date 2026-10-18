# Assets reemplazables

Todo lo que hay aquí se sirve en `/assets/...`. Mientras falte un archivo el juego usa los placeholders geométricos de `src/assets/placeholders/`.

## Cómo reemplazar un modelo

1. Copia el `.glb` en la carpeta que le corresponde (tabla de abajo).
2. En `src/config/assets.manifest.ts` cambia el `null` de esa entrada por su ruta. Ejemplo: `velociraptor: 'assets/models/dinos/velociraptor.glb'`.
3. Recarga el juego. `AssetLoader` lo precarga, y si la carga falla vuelve al placeholder y escribe un aviso en la consola.

## Convenciones

| Regla | Valor |
|---|---|
| Unidades | 1 unidad = 1 metro |
| Orientación | El modelo mira hacia **−Z**, con +Y arriba |
| Origen | En el suelo, centrado (entre los pies en los dinos) |
| Formato | glTF binario (`.glb`), texturas incrustadas, preferible un atlas de color |
| Triángulos | Dinos ≤ 5.000 · obstáculos ≤ 1.500 · decoración ≤ 800 |
| Nombres | `snake_case`, igual que la clave del manifiesto |

### Dinosaurios (`models/dinos/`)

- Clips de animación, con estos nombres exactos: `idle`, `run`, `jump`, `roll`, `hit` (si falta alguno se usa `run`).
- Alto aproximado de 1,4 a 1,8 m. La caja de colisión es fija, así que el modelo solo cambia el aspecto.
- Archivos: `compsognathus.glb`, `gallimimus.glb`, `parasaurolophus.glb`, `velociraptor.glb`, `stegosaurus.glb`, `triceratops.glb`, `ankylosaurus.glb`, `spinosaurus.glb`, `tyrannosaurus.glb`.

### Obstáculos (`models/obstacles/`)

El modelo debe caber dentro de la caja de colisión definida en `src/config/obstacles.config.ts`:

| Archivo | Ancho × alto × fondo (m) | Base Y |
|---|---|---|
| `log.glb` | 1,9 × 0,75 × 0,8 | 0 |
| `low_branch.glb` | 2,0 × 1,6 × 0,6 | 1,0 (debe dejar libre el espacio hasta 1 m de altura) |
| `rock.glb` | 1,7 × 2,6 × 1,6 | 0 |
| `tree.glb` | 1,3 × 4 × 1,3 (la copa puede salir de la caja) | 0 |

### Coleccionables (`models/collectibles/`)

`coin.glb`: unos 0,85 m de diámetro, cara mirando a +Z. El juego la hace girar sobre Y.

### Audio (`audio/`)

- `music/`: `.ogg` o `.mp3` en bucle, normalizados a −14 LUFS.
- `sfx/`: clips cortos de menos de 1 s.
- Solo material libre de derechos (CC0 o con licencia compatible). Anota la fuente y la licencia en `audio/CREDITS.md`.
