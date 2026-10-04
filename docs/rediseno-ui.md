# Rediseño visual: "La planilla pasada a limpio"

La protagonista de la app es la casilla de estado (P/T/F/E), lo que el docente toca 40 veces
cada mañana. Todo lo demás queda callado. Una sola paleta para la app y para el Portal.

## Tokens (`:root` en `app/frontend/src/styles.css`)

| Token | Valor | Uso |
|---|---|---|
| `--tinta` | `#14201a` | texto |
| `--tinta-suave` | `#55605a` | texto secundario, etiquetas |
| `--tinta-mute` | `#8b938d` | deshabilitado, pistas |
| `--papel` | `#f6f5f0` | fondo del body, liso (sin rayas ni marca de agua) |
| `--fondo` | `#efede5` | hover suave, celdas vacías (antes se usaba sin estar definido) |
| `--hoja` / `--superficie` | `#ffffff` | tarjetas, inputs, menú en móvil |
| `--rejilla` | `#e4e1d6` | bordes de 1px |
| `--eje` | `#cfcabb` | borde de inputs |
| `--verde` | `#14663b` | acción principal |
| `--verde-noche` | `#0b3d22` | barra lateral, hover de botón primario (alias `--verde-oscuro`) |
| `--verde-claro` | `#e8f2ec` | fondo de selección y hover secundario |
| `--oro` | `#d4b12a` | color del escudo: foco, barra del ítem activo, "hoy", pendientes |
| `--oro-tinta` | `#7a5f00` | oro como texto (contraste AA sobre blanco) |
| `--oro-claro` | `#fbf5dc` | fondo de avisos y pendientes |
| `--margen` | `#c8503c` | SOLO la línea de la planilla y el estado Falta |
| `--estado-p/t/f/e` | sin cambio | |
| `--radio` | `12px` | tarjetas |
| `--radio-s` | `8px` | botones, inputs |
| `--sombra` | `0 1px 2px rgba(20,32,26,.04), 0 4px 16px rgba(20,32,26,.04)` | solo tarjetas |

Se borra `--ocre`, `--p-*` del Portal y cualquier amarillo `#ffd200` o verde `#0f5a36`.
Todo pasa a los tokens de arriba.

## Qué significa cada color

Cada color dice una sola cosa en toda la app. Si un elemento no tiene ese significado, va
en tinta o en gris.

| Color | Significa | Dónde |
|---|---|---|
| Verde `--verde` / `--estado-p` | presente, todo en orden, acción principal | casilla Presente, botón primario, "lista completa", en línea |
| Oro `--oro` | pendiente, hay que atender, hoy | listas sin tomar, registros sin enviar, sin internet, KPI "sin marcar", día de hoy |
| Naranja `--estado-t` `#e07b24` | llegó tarde | casilla Tarde, series de tardanza |
| Rojo `--estado-f` / `--margen` | falta y errores | casilla Falta, KPI de ausentes, mensajes de error, línea de la planilla |
| Morado `--estado-e` | evasión | casilla Evasión, KPI y series de evasiones |
| Verde noche | marca del colegio | barra lateral, títulos del login |

El oro del escudo como adorno solo aparece en el Portal público (botón de ingresar, filetes).
El foco de teclado va en verde (contraste ≥3:1 sobre blanco) y en blanco sobre el menú.
En el calendario los tintes son por tipo de día; "suspendido" va en gris para no confundirse
con evasión.

## Tipografía

Archivo para todo (`body` incluido); `--texto` = `--ui`.
Escala: 13 / 15 / 17 / 20 / 26 / 40 px. `h1` 26px/700, `h2` 20px/650, `h3` 17px/600.
Cuerpo 16px/1.5. `font-variant-numeric: tabular-nums` en horas, conteos, KPIs y tablas.
Nada en MAYÚSCULAS espaciadas: `.eyebrow`, `th`, `dt`, `.cabecera-grafica h3`,
`.calendario-cabecera` (móvil) y el `small` del Portal pasan a minúscula normal, 13px,
weight 500, color `--tinta-suave`, sin `letter-spacing`.

## Armazón

- `body`: `padding: 0`, fondo `--papel` liso. Se borran `body::before` (marca de agua) y el
  `repeating-linear-gradient`.
- `.armazon`: grid `16rem 1fr` y **`align-content: start`** (sin esto la barra móvil se
  estira a ~280px de alto en el celular).
- `.contenido`: padding `24px 32px 80px` en escritorio, `12px 12px 80px` por debajo de 900px.
- `.menu` en escritorio: fondo `--verde-noche`, texto `rgba(255,255,255,.78)`, sin borde.
  `.menu-marca strong` blanco y `small` `rgba(255,255,255,.6)`. Enlaces de 44px de alto,
  radio 8px. Hover: `rgba(255,255,255,.08)`. `.activo`: fondo `rgba(255,255,255,.12)`,
  texto blanco, weight 700 y una barra de 3px `--oro` a la izquierda (`box-shadow: inset 3px 0 0 var(--oro)`).
  `Version` en `rgba(255,255,255,.5)`. "Cerrar sesión" (`.menu > button.secundario`):
  transparente, borde `rgba(255,255,255,.25)`, texto blanco.
- El cajón móvil usa el mismo verde noche. La `.barra-movil` queda blanca, de 56px de alto y
  con un borde inferior `--rejilla`. Su `.hamburguesa` va en tinta, sin el min-height de botón.
- La `.barra-offline` no puede tapar el menú: `left: 16rem` en escritorio y `left: 0` por
  debajo de 900px. Se ve así:
  - `.en-linea`: discreta. Fondo `--hoja`, borde superior `--rejilla`, texto `--tinta-suave`
    a 13px y el punto en `--verde`. No es un aviso, es el estado normal.
  - `.subiendo`: igual que `.en-linea`, con el punto hueco.
  - `.sin-red`: fondo `--oro`, texto `--tinta`, weight 600. Es el único estado que debe llamar
    la atención.
  - `.aviso`: fondo `--oro-claro`, texto `--oro-tinta`.
  - Se mantienen 44px de alto y el botón interno `.chico`.

## Hojas y controles

- `.card`: fondo `--hoja`, borde 1px `--rejilla`, radio `--radio`, `--sombra` y padding
  `28px 28px` (en móvil `20px 16px`). **Sin borde izquierdo rojo.** La primera tarjeta no lleva
  margen superior extra (la separación ya la da `.contenido`).
- `input`, `select`, `textarea`: fondo blanco, borde `--eje`, radio `--radio-s`, 48px de alto
  (16px de fuente para que iOS no haga zoom). Hover con borde `--tinta-mute`. `:focus` con borde
  `--verde` y `box-shadow: 0 0 0 3px var(--verde-claro)`.
- `:focus-visible` global: `outline: 3px solid var(--oro); outline-offset: 2px`.
- `button` primario: `--verde`, radio `--radio-s`, 48px, weight 600, `transition` de
  background a 120ms. `.secundario`: blanco, borde `--eje`, texto `--verde-noche`. Hover con
  fondo `--verde-claro` y borde `--verde`.
- Nueva clase `.chico` para botón compacto: `min-height: 36px; padding: 6px 12px; font-size: 14px`.
  Sustituye TODOS los `style={{ minHeight: 32, padding: ... }}` en línea.
- `.error`: color `#a5231b` con un fondo `#fdeceb`, padding 12px y radio `--radio-s`.
- `.banner`: radio `--radio-s`, sin borde izquierdo. `.offline` y `.no-lectivo` en `--oro-claro`
  con texto `--oro-tinta`; `.pendiente` en `--verde-claro`.
- `.filtros` (label + control): en móvil, una columna (label encima del control).
- Pestañas de Admin (`role=tablist`) y `.segmentado`: control segmentado. Contenedor con fondo
  `--fondo`, radio 10px y padding 4px; botones de 40px. El activo va blanco con sombra suave y
  texto `--verde-noche`; los inactivos, transparentes y sin borde, con texto `--tinta-suave`.
  `.filtros-tablero button[aria-pressed='true']` usa el mismo estilo.

## Planilla (TomarAsistencia): el elemento firma

- `.estudiantes`: el único lugar con la línea roja de margen. `border-left: 2px solid var(--margen)`
  en la lista y `padding-left: 12px`.
- `li`: padding 12px y separador `--rejilla`. Si la fila tiene una casilla activa distinta de P,
  la fila se tiñe: `li:has(.estado.T.activo)` con `#fdf6e3`, `li:has(.estado.F.activo)` con
  `#fdeeeb` y `li:has(.estado.E.activo)` con `#f3eef9`.
- `.estado`: 48px de alto, radio `--radio-s`, borde 1.5px `--eje`, fondo blanco, weight 700,
  14px. `.activo` relleno de su color de estado, y además `transform: scale(1.03)` con transición
  de 120ms: el único movimiento de la app (se anula con `prefers-reduced-motion`).
- `.nombre` 16px/600; `small` con el documento en `--tinta-suave` y `tabular-nums`.

## Datos

- `th`: 13px/600, `--tinta-suave`, minúscula normal y fondo `--hoja`. Dentro de `.tabla-scroll`
  van `position: sticky; top: 0`. Nueva clase `.tabla-alta` = `max-height: 55vh; overflow-y: auto`
  para sustituir los estilos en línea.
- `td`: 15px y padding 10px 12px. Hover de fila en `--fondo`.
- `.kpi`: fondo `--hoja`, borde `--rejilla`, radio `--radio` y padding 20px, **sin borde
  izquierdo de color**. `.valor` en 40px/700 con `tabular-nums` y `letter-spacing: -0.02em`.
  `.kpi.principal .valor` en 56px. `.kpi.alerta`: punto de 8px `--margen` antes de la etiqueta
  (`.etiqueta::before`), sin teñir la cifra.
- `.grafica`: igual que la tarjeta, pero sin sombra.
- `.pendientes-hoy`: fondo `--oro-claro`, radio `--radio`, sin borde izquierdo; `h2` en `--oro-tinta`.
- `.dia-bloques .bloque`: tarjeta blanca de radio `--radio-s`. El estado se marca con un punto de
  10px antes de la hora (`.falta`/`.medias` en `--oro` y `.listo` en `--verde`) en lugar del borde
  izquierdo grueso.
- Calendario y horario: celdas con radio 8px. `.horario-celda.hoy` con borde `--verde` de 2px y
  fondo `--verde-claro`. `.etiqueta-hoy` en `--oro-tinta`.

## Login

La pantalla completa en `--papel` con la hoja `.login` centrada vertical y horizontalmente
(`min-height: 100dvh` en un contenedor; si hace falta, el `form` con `margin: auto` y el body
centrado solo en esa ruta mediante la clase del form). Max 26rem, escudo de 96px y `h1` 26px
en `--verde-noche`. La `.eyebrow` queda como texto pequeño normal.

## Portal

Mismo HTML. `--p-verde` pasa a `--verde`, `--p-verde-oscuro` a `--verde-noche`, `--p-amarillo`
a `--oro` y `--p-gris` a `--papel`. Se mantienen la foto/video del hero y el CTA. El
`.portal-nav-marca small` queda sin mayúsculas.

## Reglas para no romper nada

- No cambiar textos visibles, `role`, `aria-*`, `name` ni el orden de los controles: los tests
  los usan.
- No renombrar `en-linea`, `sin-red`, `distinto` ni `conteo-hijo`.
- Solo se cambian `className`/`style` en TSX; nada de lógica.
- Respetar `prefers-reduced-motion`, foco visible y 360px de ancho sin scroll horizontal.
