# Identidad visual "Planilla" y cierre de pendientes — Plan de implementacion

> **Para agentes:** ejecutar tarea por tarea. Cada tarea termina con tests en verde y un commit.

**Objetivo:** dar al PWA una identidad visual propia (legible en un telefono barato, con sol
encima y sin senal) y cerrar los pendientes que quedaron del plan v2: recorrido en navegador
real, seguridad por rol en las rutas y un tablero que sirva para decidir, no solo para mirar.

**Arquitectura:** el 90% del rediseno vive en `src/styles.css` (tokens + clases). Los
componentes solo cambian donde el marcado no da para expresar la jerarquia (cabecera comun,
lista de estudiantes). Sin dependencias nuevas. Una unica fuente web autoalojada.

**Stack:** React 18 + Vite 6 + vite-plugin-pwa, CSS plano (sin framework), vitest + testing-library.

**Spec:** este mismo documento; el estado previo esta en `docs/ESTADO.md`.

## Restricciones globales

- Cero dependencias nuevas (`package.json` no cambia).
- Presupuesto de red: bundle JS principal < 200 KB gzip; fuentes < 40 KB en total, un solo
  archivo, autoalojado en `public/fonts/` y precacheado por el service worker.
- Todo el texto de interfaz en espanol, sin tildes (el resto del proyecto ya es asi).
- Objetivo tactil minimo 48x48 px: se usa con el telefono en una mano.
- Contraste AA sobre fondo claro; foco de teclado siempre visible; `prefers-reduced-motion`
  respetado.
- Ningun test existente puede romperse: 50 tests de frontend y 77 de backend siguen en verde.

---

## Direccion de diseno: "Planilla"

El objeto que esta aplicacion reemplaza es la planilla de asistencia en papel: hojas
rayadas, margen rojo a la izquierda, columnas de casillas, sello de la institucion arriba.
La interfaz cita ese objeto en vez de parecerse a un panel de SaaS.

**Color** (6 valores, todos con nombre en `:root`):
- `--tinta #14201A` — texto principal, verde tan oscuro que lee como negro.
- `--papel #F5F3EA` — fondo; papel de planilla, no blanco de pantalla.
- `--verde #14663B` — institucional, acciones primarias.
- `--verde-oscuro #0B3D22` — titulos, estados presionados.
- `--ocre #B7772A` — acento unico: sellos, eyebrows, subrayado del elemento activo.
- `--margen #C8503C` — la linea roja de margen del cuaderno; solo se usa como filete de 2px.

**Tipografia**:
- Display/UI: **Archivo** (variable, subconjunto latino, 35 KB, un solo `woff2` autoalojado).
  Grotesca utilitaria de formulario oficial; se usa en 600/700 para titulos y en mayusculas
  con `letter-spacing` alto para las etiquetas tipo sello.
- Cuerpo y datos: pila del sistema (0 KB), con `font-variant-numeric: tabular-nums` en todas
  las cifras para que las columnas cuadren como en la planilla.

**Layout**: una columna, `max-width: 34rem`, barra superior fija con el escudo y la ruta
actual. Las listas son filas de planilla: filete de margen a la izquierda, hairline abajo.

**Elemento firma**: el bloque de estados P/T/F/E. Es lo mas tocado de la aplicacion, asi que
es donde se gasta el presupuesto de diseno: cuatro casillas cuadradas de planilla, con la
letra en tabular, que al marcarse se rellenan de tinta con un trazo de sello. Todo lo demas
se mantiene callado.

---

### Tarea 1: fuente autoalojada y sistema de tokens

**Archivos:**
- Crear: `app/frontend/public/fonts/archivo-latin.woff2` (ya descargado)
- Modificar: `app/frontend/src/styles.css`, `app/frontend/index.html`

- [ ] Paso 1: `@font-face` con `font-weight: 400 700` (es variable), `font-display: swap`,
      `src: url('/fonts/archivo-latin.woff2') format('woff2')`.
- [ ] Paso 2: precargar la fuente en `index.html` con
      `<link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/archivo-latin.woff2">`.
- [ ] Paso 3: reemplazar el bloque `:root` por los seis colores nombrados arriba, mas las
      escalas de espacio y radio y los colores de estado ya existentes.
- [ ] Paso 4: `npm run build` y comprobar que el `woff2` entra en el precache del SW.
- [ ] Paso 5: commit.

### Tarea 2: chrome de la aplicacion (barra, tarjeta, botones, foco)

**Archivos:** `src/styles.css`, `src/components/Escudo.tsx`, `src/pages/Home.tsx`,
`src/pages/Login.tsx`

- [ ] Paso 1: barra superior `.barra` con escudo + titulo; `.card` pasa a hoja de planilla
      (papel, filete de margen, sombra de un solo pixel).
- [ ] Paso 2: botones con jerarquia real (`.boton`, `.boton.secundario`, `.boton.fantasma`),
      48 px de alto minimo, `:focus-visible` con anillo ocre de 3 px.
- [ ] Paso 3: `Home.tsx` — la navegacion pasa de lista de botones verdes iguales a fichas con
      titulo y una linea de contexto, para que el docente sepa que hace cada una.
- [ ] Paso 4: `Login.tsx` — el escudo y el nombre del colegio ocupan el tercio superior.
- [ ] Paso 5: `npm test` (50/50) y `npm run build`; commit.

### Tarea 3: el elemento firma (estados P/T/F/E y filas de planilla)

**Archivos:** `src/styles.css`, `src/pages/TomarAsistencia.tsx` (solo clases)

- [ ] Paso 1: `.estados` en rejilla de cuatro casillas cuadradas iguales.
- [ ] Paso 2: estado activo relleno con su color y letra en blanco/tinta segun contraste;
      transicion de 120 ms anulada bajo `prefers-reduced-motion`.
- [ ] Paso 3: `.estudiantes li` como fila de planilla con filete de margen.
- [ ] Paso 4: `npm test src/pages/TomarAsistencia.test.tsx` (4/4, sin tocar la logica); commit.

### Tarea 4: seguridad por rol en las rutas del cliente

**Archivos:** `src/App.tsx`, `src/App.test.tsx` (crear)

Hoy `/asistencia` e `/ingreso` solo comprueban que haya sesion: un ACUDIENTE autenticado
entra escribiendo la URL. El backend lo rechazaria, pero la interfaz no deberia ofrecerlo.

- [ ] Paso 1: test que falla — con sesion de ACUDIENTE, `/asistencia` redirige a `/`.
- [ ] Paso 2: correrlo y verlo fallar.
- [ ] Paso 3: cambiar `Protegida` por `SoloRoles roles={['DOCENTE','COORDINADOR','ADMIN']}`
      en `/asistencia` e `/ingreso`.
- [ ] Paso 4: test en verde; commit.

### Tarea 5: tablero que se lee de un vistazo

**Archivos:** `src/pages/Dashboard.tsx`, `src/components/charts/*.tsx`, `src/styles.css`

- [ ] Paso 1: los filtros salen de `.leyenda` (que es la clase de la leyenda de graficas) a
      un `.filtros-tablero` propio con los rangos como grupo de segmentos.
- [ ] Paso 2: los KPI se jerarquizan: la tasa de asistencia manda, los cuatro restantes son
      secundarios; los de alerta se marcan con el filete de margen, no con color de fondo.
- [ ] Paso 3: cada grafica declara su periodo en el pie, para que una captura de pantalla
      siga teniendo sentido fuera de la aplicacion.
- [ ] Paso 4: `npm test` y `npm run build`; commit.

### Tarea 6: verificacion en navegador real

- [ ] Paso 1: levantar backend y `npm run dev`.
- [ ] Paso 2: recorrer con la extension de Chrome: login docente, tomar asistencia, ingreso
      por carnet, consultas, tablero como coordinador, `/admin` como admin, portal del
      acudiente, y comprobar que el acudiente no alcanza `/asistencia`.
- [ ] Paso 3: capturas en `docs/` y bitacora en `docs/ESTADO.md`; commit.
