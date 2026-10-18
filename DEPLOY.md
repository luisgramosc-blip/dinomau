# 🚀 Publicar dinoMau en internet

Guía paso a paso, sin necesidad de programar: todo se hace desde páginas web.
Haz los pasos **en orden**. Tiempo total: unas **2 horas**, más la espera de aprobación de Google AdSense.

| Servicio | Para qué sirve | Costo |
|---|---|---|
| **Gmail** (cuenta nueva) | Correo del proyecto | Gratis |
| **Cloudflare** | Dominio, web del juego y correo `contacto@` | Dominio **~10–15 USD/año**; lo demás gratis |
| **Supabase** | Cuentas, monedas, ranking, invitaciones | Gratis para empezar |
| **Resend** | Correos de "confirma tu cuenta" | Gratis hasta 3.000 correos/mes |
| **Google AdSense** | Anuncios: Google te paga a ti | Gratis |

> 🔒 **Regla de oro:** nunca pegues en un chat ni en el código la clave `service_role` de
> Supabase, los tokens que empiezan por `sbp_` ni las claves de Resend. Solo se usan dentro
> de las páginas de cada servicio.

En esta guía el dominio de ejemplo es **`dinomau.com`**: cámbialo por el que compres.

---

## Paso 1 — Correo del proyecto *(10 min)*

1. Crea una cuenta de Gmail **nueva, solo para el juego** (por ejemplo `dinomau.juego@gmail.com`).
2. En <https://myaccount.google.com/security> activa la **verificación en 2 pasos** con
   *Google Authenticator* o una *llave de acceso* (mejor que por SMS).
3. Agrega un teléfono y un correo de recuperación.

Usa esta cuenta para **crear todas las demás** (Cloudflare, Supabase, Resend, AdSense).

## Paso 2 — Dominio y correo `contacto@` en Cloudflare *(20 min)*

1. Crea una cuenta en <https://dash.cloudflare.com/sign-up> con el Gmail del juego.
2. **Domain Registration → Register Domains**: busca el nombre (por ejemplo `dinomau.com`) y cómpralo.
   Cloudflare cobra el precio de costo, sin recargos.
3. **Correo de contacto gratis:** entra al dominio → **Email → Email Routing** → *Get started*.
   - *Custom address*: `contacto` → *Destination*: el Gmail del juego.
   - Confirma el correo que te llega a Gmail. Ya puedes recibir en `contacto@dinomau.com`.

## Paso 3 — Base de datos en Supabase *(15 min)*

1. Entra en <https://supabase.com> con el Gmail del juego → **New project**.
   - *Name*: `dinomau` · *Database password*: pulsa **Generate** y guárdala.
   - *Region*: la más cercana a tus jugadores (por ejemplo *South America (São Paulo)*).
2. Cuando termine, ve a **Project Settings → API** y copia en un bloc de notas:
   - **Project URL** (`https://abcdxyz.supabase.co`) — la parte `abcdxyz` es tu *Project ref*.
   - **anon public** (o *publishable*) key.
3. **SQL Editor → New query**: pega y ejecuta (**Run**) estos 3 archivos, **en este orden**.
   En GitHub, abre cada uno y pulsa **Copy raw file**:
   1. [`supabase/migrations/20261018000000_init.sql`](supabase/migrations/20261018000000_init.sql)
   2. [`supabase/migrations/20261019000000_runs_and_ranking.sql`](supabase/migrations/20261019000000_runs_and_ranking.sql)
   3. [`supabase/migrations/20261020000000_ads.sql`](supabase/migrations/20261020000000_ads.sql)

   Cada uno debe terminar en *Success*.

## Paso 4 — Funciones del servidor *(lo hace Claude)*

Son 5 funciones que validan partidas, compras, invitaciones y monedas por anuncio:
`start-run`, `finish-run`, `purchase-dino`, `claim-referral` y `ad-reward`.

**Opción A (recomendada): que Claude las suba**
1. Crea un token en <https://supabase.com/dashboard/account/tokens> → **Generate new token**.
2. En la configuración del entorno de Claude Code permite el acceso de red a
   `api.supabase.com` y `*.supabase.co`.
3. Dile a Claude: *"sube las funciones a mi proyecto `abcdxyz`"*.
4. Cuando termine, **borra el token** en esa misma página.

**Opción B: desde tu computadora** (con [Node.js](https://nodejs.org) instalado, en la carpeta del proyecto)

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase functions deploy start-run --use-api
npx supabase functions deploy finish-run --use-api
npx supabase functions deploy purchase-dino --use-api
npx supabase functions deploy claim-referral --use-api
npx supabase functions deploy ad-reward --use-api
```

En Supabase → **Edge Functions** deben aparecer las 5.

## Paso 5 — Publicar la web en Cloudflare Pages *(15 min)*

1. En Cloudflare: **Workers & Pages → Create → pestaña Pages → Import an existing Git repository**.
   (Si solo ves opciones de *Workers*, busca la pestaña o el enlace **Pages**.)
2. Conecta tu GitHub y elige el repositorio **dinomau**.
3. Configuración de compilación:

   | Campo | Valor |
   |---|---|
   | Project name | `dinomau` |
   | Production branch | `main` |
   | Framework preset | `Vite` (o *None*) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

4. En **Environment variables** añade:

   | Nombre | Valor |
   |---|---|
   | `NODE_VERSION` | `22` |
   | `VITE_SUPABASE_URL` | tu *Project URL* (Paso 3) |
   | `VITE_SUPABASE_ANON_KEY` | tu *anon public key* (Paso 3) |
   | `VITE_PUBLIC_SITE_URL` | `https://dinomau.com` |
   | `VITE_CONTACT_EMAIL` | `contacto@dinomau.com` |

5. **Save and Deploy**. En 2–3 minutos el juego estará en `https://dinomau.pages.dev`.
6. En el proyecto → **Custom domains → Set up a custom domain** → `dinomau.com`.
   Como el dominio está en Cloudflare, se configura solo, con el candado HTTPS incluido.

Mientras no tengas AdSense, el juego muestra **anuncios de prueba** ("ANUNCIO DE PRUEBA").
Si prefieres que no salga ninguno, añade la variable `VITE_ADS_PROVIDER` con el valor `none`.

## Paso 6 — Registro de jugadores en Supabase *(10 min)*

En Supabase → **Authentication**:

1. **Sign In / Providers → Email**: deja activado **Confirm email**.
2. **URL Configuration**:
   - *Site URL*: `https://dinomau.com`
   - *Redirect URLs*: `https://dinomau.com/**` y `https://dinomau.pages.dev/**`
3. **Entrar con Google** (opcional, se puede hacer después):
   1. En <https://console.cloud.google.com> crea un proyecto → *APIs & Services → Credentials →
      Create credentials → OAuth client ID → Web application*.
   2. En *Authorized redirect URIs* pega `https://TU_PROJECT_REF.supabase.co/auth/v1/callback`.
   3. Copia el *Client ID* y el *Client secret* en Supabase → *Providers → Google* y actívalo.

## Paso 7 — Correos de confirmación con Resend *(15 min)*

El correo que trae Supabase de serie solo envía unos pocos correos por hora: sirve para probar,
no para jugadores reales.

1. Crea una cuenta en <https://resend.com> con el Gmail del juego.
2. **Domains → Add domain** → `dinomau.com`. Resend te pide añadir unos registros DNS;
   tiene un botón para hacerlo automáticamente en Cloudflare. Espera a que diga **Verified**.
3. **API Keys → Create API key** (permiso *Sending access*). Cópiala **solo** en el paso siguiente.
4. En Supabase → **Authentication → Emails → SMTP Settings** → *Enable custom SMTP*:

   | Campo | Valor |
   |---|---|
   | Sender email | `no-reply@dinomau.com` |
   | Sender name | `dinoMau` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | la API key de Resend |

## Paso 8 — Probar *(15 min)*

- [ ] Abre `https://dinomau.com` en el móvil. La primera vez pregunta el **año de nacimiento**.
- [ ] Con un año de **menor de 13** (prueba en otro navegador o en una ventana privada):
      no hay botón de cuenta, ranking, invitar ni compartir; se juega igual y las monedas se
      guardan en el dispositivo.
- [ ] Con un año de **13 o más**: crea una cuenta con email, te llega el correo de
      confirmación de `no-reply@dinomau.com` y entras.
- [ ] Juega una partida con la cuenta: al terminar dice *"Partida guardada"* y apareces en el **Ranking**.
- [ ] **Invitar**: copia tu link `…/r/CODIGO`, ábrelo en otro navegador y crea otra cuenta.
      Tras confirmar el correo, esa cuenta recibe **500 monedas** y tú **250** cuando juegue su primera partida.
- [ ] **🎁 Regalo**, **¿Revivir?** y **🎬 x2 monedas** funcionan con los anuncios de prueba.
- [ ] `https://dinomau.com/privacy` muestra la política de privacidad con `contacto@dinomau.com`.
- [ ] Android (Chrome): botón **📲 Instalar app**. iPhone (Safari): *Compartir → Añadir a pantalla de inicio*.

## Paso 9 — Activar los anuncios reales (Google AdSense)

1. Entra en <https://adsense.google.com> con el Gmail del juego y añade el sitio `dinomau.com`.
   Usa tu **nombre y dirección reales**: Google te enviará una carta y los pagos a tu nombre.
2. Solicita el acceso a **anuncios para juegos H5** (*H5 Games Ads*); Google lo da por solicitud.
   Los pasos actuales están en la [documentación de Ad Placement API](https://developers.google.com/ad-placement).
3. Copia tu **ID de editor** (*Cuenta → Información de la cuenta*), con la forma `ca-pub-1234567890123456`.
4. En Cloudflare Pages → *Settings → Variables and Secrets* añade:

   | Nombre | Valor |
   |---|---|
   | `VITE_ADSENSE_CLIENT` | tu `ca-pub-…` |
   | `VITE_ADSENSE_TEST` | `on` (anuncios de prueba de Google mientras revisas) |

   Borra `VITE_ADS_PROVIDER` si la habías puesto. Luego, en **Deployments**, vuelve a
   desplegar el último (**Retry deployment**).
5. Comprueba que `https://dinomau.com/ads.txt` muestra `google.com, pub-…, DIRECT, …`.
   El juego genera este archivo solo.
6. **Aviso de cookies para Europa:** AdSense → *Privacidad y mensajes → RGPD* → crea el mensaje y publícalo.
7. **Menores:** el juego ya pide **anuncios no personalizados** a los jugadores menores de 13.
   Antes de activar los anuncios reales, revisa en la ayuda de AdSense cómo declarar que parte de
   tu público son niños. Si Google pide algún ajuste en el código, pídeselo a Claude.
8. Cuando todo funcione, vacía `VITE_ADSENSE_TEST` y vuelve a desplegar: empiezan los anuncios reales.

> ⚠️ **Nunca hagas clic en tus propios anuncios reales** ni pidas a nadie que lo haga:
> Google cierra la cuenta.

## Paso 10 — Cobrar

1. Al llegar a **10 USD** ganados, Google te manda por **correo postal un PIN**. Escríbelo en AdSense.
2. **Pagos → Información fiscal**: si no vives en EE. UU., completa el formulario **W-8BEN**.
3. **Pagos → Formas de pago**: agrega tu **cuenta bancaria**.
4. Google paga **una vez al mes** (hacia el día 21–26) cuando el saldo llega al mínimo
   (normalmente **100 USD**); si no se alcanza, se acumula.
5. Declara los ingresos en tu país; consulta a un contador.

---

## Publicar cambios en el futuro

Cada vez que se sube código a `main` en GitHub, Cloudflare publica la versión nueva solo, y los
jugadores ven el aviso **"Actualizar"**. Si el cambio incluye un archivo nuevo en `supabase/migrations`,
pégalo en el SQL Editor (Paso 3). Si cambia `supabase/functions`, repite el Paso 4.

## Si algo falla

| Problema | Solución |
|---|---|
| El menú dice *"Sin conexión"* | Revisa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Cloudflare y vuelve a desplegar. |
| Al terminar la partida dice *"No se pudo guardar"* | Faltan las funciones del servidor (Paso 4). |
| El correo de confirmación lleva a `localhost` | Revisa la *Site URL* (Paso 6). |
| No llegan los correos de confirmación | Revisa el SMTP (Paso 7) y que el dominio salga *Verified* en Resend. |
| Google da `redirect_uri_mismatch` | La URI del Paso 6.3 no coincide exactamente. |
| La compilación falla en Cloudflare | Comprueba `NODE_VERSION = 22` y que el directorio de salida sea `dist`. |
| Me equivoqué de año en la pregunta de edad | Se guarda en el navegador: borra los datos del sitio (en el navegador, *Configuración del sitio → Borrar datos*). |
