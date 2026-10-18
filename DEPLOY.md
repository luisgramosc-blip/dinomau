# 🚀 Publicar dinoMau en internet

Guía paso a paso para dejar el juego en línea. No hace falta saber programar:
casi todo se hace desde páginas web. Tiempo aproximado: **30–45 minutos**.

Vas a usar dos servicios gratuitos:

| Servicio | Para qué sirve |
|---|---|
| **Supabase** | Cuentas de jugadores, monedas, récords, ranking y referidos |
| **Vercel** | Publica la web del juego (`https://dinomau.vercel.app` o similar) |

> 🔒 **Regla de oro:** hay una clave llamada `service_role` y otra que empieza por `sbp_`.
> **Nunca** las pegues en un chat, en Vercel ni en el código. Solo hacen falta las
> claves *Project URL* y *anon / publishable*, que sí son públicas.

---

## Paso 1 — Crear el proyecto en Supabase

1. Entra en <https://supabase.com> y crea una cuenta (puedes usar tu cuenta de GitHub).
2. Pulsa **New project**.
   - *Name*: `dinomau`
   - *Database password*: pulsa **Generate** y guárdala en un lugar seguro.
   - *Region*: la más cercana a tus jugadores (por ejemplo *South America (São Paulo)* o *East US*).
3. Espera 1–2 minutos a que el proyecto se cree.
4. Ve a **Project Settings → API** (o *Data API*) y copia en un bloc de notas:
   - **Project URL** → algo como `https://abcdxyz.supabase.co`
   - **anon public** (o *publishable*) key → un texto largo

## Paso 2 — Crear las tablas (base de datos)

1. En Supabase abre **SQL Editor → New query**.
2. En GitHub abre el archivo
   [`supabase/migrations/20261018000000_init.sql`](supabase/migrations/20261018000000_init.sql),
   pulsa el botón **Copy raw file**, pégalo en el editor y pulsa **Run**. Debe decir *Success*.
3. Repite con
   [`supabase/migrations/20261019000000_runs_and_ranking.sql`](supabase/migrations/20261019000000_runs_and_ranking.sql).

   ⚠️ Respeta el orden: primero `init`, luego `runs_and_ranking`.

## Paso 3 — Subir las funciones del servidor (Edge Functions)

Son 4 funciones que validan las partidas, las compras y los referidos para que nadie
pueda hacer trampas: `start-run`, `finish-run`, `purchase-dino` y `claim-referral`.
Hay dos formas:

### Opción A (recomendada): que Claude lo haga por ti

1. Crea un token en <https://supabase.com/dashboard/account/tokens> (**Generate new token**).
2. En la configuración del entorno de Claude Code permite el acceso de red a
   `api.supabase.com` y `*.supabase.co`.
3. Pide a Claude: *"despliega las funciones en mi proyecto `<Project ref>`"*.
   El *Project ref* es la parte `abcdxyz` de tu Project URL.
4. Cuando termine, **borra el token** en esa misma página.

### Opción B: desde tu computadora

Necesitas tener instalado [Node.js](https://nodejs.org) (versión LTS). Luego, en una
terminal dentro de la carpeta del proyecto:

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase functions deploy start-run --use-api
npx supabase functions deploy finish-run --use-api
npx supabase functions deploy purchase-dino --use-api
npx supabase functions deploy claim-referral --use-api
```

(Si no hiciste el Paso 2 a mano, `npx supabase db push` crea las tablas.)

En **Edge Functions** deben aparecer las 4 funciones.

## Paso 4 — Configurar el registro de usuarios

En Supabase → **Authentication**:

1. **Sign In / Providers → Email**: deja activado **Confirm email**
   (evita cuentas falsas y fraude con los referidos).
2. **URL Configuration** (lo completarás de verdad en el Paso 6):
   - *Site URL*: `https://dinomau.vercel.app` (tu dirección de Vercel)
   - *Redirect URLs*: `https://dinomau.vercel.app/**`
3. **Google (opcional, se puede hacer después)**:
   1. En <https://console.cloud.google.com> crea un proyecto → *APIs & Services → Credentials →
      Create credentials → OAuth client ID → Web application*.
   2. En *Authorized redirect URIs* pega `https://TU_PROJECT_REF.supabase.co/auth/v1/callback`.
   3. Copia el *Client ID* y el *Client secret* en Supabase → *Providers → Google* y actívalo.

> Mientras Google no esté configurado, el botón de Google mostrará un error; el registro
> con email funciona igual.

## Paso 5 — Publicar la web en Vercel

1. Entra en <https://vercel.com> con tu cuenta de GitHub.
2. **Add New → Project** → importa el repositorio **dinomau**.
3. Vercel detecta **Vite** solo. Antes de pulsar *Deploy*, abre **Environment Variables**
   y añade estas tres:

   | Nombre | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | tu *Project URL* del Paso 1 |
   | `VITE_SUPABASE_ANON_KEY` | tu *anon public key* del Paso 1 |
   | `VITE_PUBLIC_SITE_URL` | `https://dinomau.vercel.app` (cámbialo si Vercel te da otro nombre) |

4. Pulsa **Deploy**. En 1–2 minutos tendrás la dirección del juego.

## Paso 6 — Ajustar la dirección final

1. Si la dirección que te dio Vercel es distinta de la que pusiste, corrígela en:
   - Vercel → *Settings → Environment Variables* → `VITE_PUBLIC_SITE_URL`, y luego
     *Deployments → ⋯ → Redeploy*.
   - Supabase → *Authentication → URL Configuration* (Site URL y Redirect URLs).

## Paso 7 — Probar

- [ ] Abre el juego en el móvil y juega como invitado.
- [ ] Crea una cuenta con email; llega el correo de confirmación y al volver entras con tu cuenta.
- [ ] Juega una partida con la cuenta: al terminar dice *"Guardado"* y aparece en el **Ranking**.
- [ ] En **Invitar** copia tu link `…/r/CODIGO`, ábrelo en otro navegador y crea otra cuenta:
      tras confirmar el email la nueva cuenta recibe **500 monedas**, y tú **250** cuando tu amigo termine su primera partida.
- [ ] Android (Chrome): botón **📲 Instalar app** en el menú. iPhone (Safari): *Compartir → Añadir a pantalla de inicio*.

---

## Cuando compres un dominio

1. Vercel → *Settings → Domains* → añade tu dominio y sigue las instrucciones de DNS.
2. Cambia `VITE_PUBLIC_SITE_URL` a `https://tudominio.com` y haz *Redeploy*.
3. En Supabase actualiza *Site URL* y añade `https://tudominio.com/**` a *Redirect URLs*
   (deja también la de `vercel.app`, así los links antiguos siguen funcionando).

## Publicar cambios en el futuro

Cada vez que se sube código a la rama `main` de GitHub, Vercel publica la versión nueva
solo. Los jugadores verán un aviso **"Actualizar"** en el menú.
Si el cambio toca `supabase/migrations` o `supabase/functions`, hay que repetir el
Paso 2 (solo el archivo nuevo) o el Paso 3.

## Si algo falla

| Problema | Solución |
|---|---|
| El menú dice *"Sin conexión"* | Faltan o están mal `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` en Vercel. Corrige y haz *Redeploy*. |
| Al terminar la partida dice *"No se pudo guardar"* | Las Edge Functions no están desplegadas (Paso 3). |
| El correo de confirmación lleva a `localhost` | Revisa la *Site URL* del Paso 4. |
| Google da error `redirect_uri_mismatch` | La URI del Paso 4.3 no coincide exactamente. |
| Los correos tardan o no llegan | El correo gratuito de Supabase tiene límite por hora; para muchos jugadores configura un SMTP propio en *Authentication → Emails*. |
