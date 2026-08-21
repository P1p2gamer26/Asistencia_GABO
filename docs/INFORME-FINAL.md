# Informe final — Sistema de Asistencia GGM

**Proyecto Social Universitario · Colegio Gabriel García Márquez (Villa Diana, Usme)**
Fecha: 20 de agosto de 2026 · Repositorio: `P1p2gamer26/Asistencia_GABO` (privado)

---

## 1. Qué se construyó

Se reemplazó la aplicación de Power Apps + Excel por una **aplicación web instalable
(PWA) offline-first**, con backend Java y base de datos relacional.

| | Antes (Power Apps) | Ahora |
|---|---|---|
| Base de datos | Excel en Google Drive | PostgreSQL 16 con migraciones versionadas |
| Duplicados | Cada pulsación creaba un registro nuevo | Imposibles: restricción en la base |
| Sin internet | No funcionaba | Funciona completo; sincroniza sola al volver |
| Días no lectivos | No existía el concepto | Calendario académico con festivos y recesos |
| Horario | Listaba todos los cursos | Solo los cursos del docente que entró |
| Reportes | Ninguno | Consultas, tablero de indicadores y descarga en Excel |
| Padres | Sin acceso | Portal propio con las novedades de sus hijos |
| Usuarios | Sin roles | Cuatro roles: admin, coordinador, docente, acudiente |

### Alcance entregado

- **Autenticación** con JWT y cuatro roles.
- **Calendario académico**: 190 días lectivos, 14 festivos nacionales y 30 días de
  receso sembrados para 2026. Coordinación o rectoría pueden cambiar cualquier día
  (paro, jornada pedagógica) desde la API, sin tocar código ni SQL.
- **Toma de asistencia offline**: el docente descarga su horario, sus estudiantes y
  el calendario; marca P/T/F/E sin señal; la app sincroniza sola al recuperar red.
- **Ingreso al colegio por QR**, leyendo el número de tarjeta de identidad que ya
  trae impreso el carnet. No se inventa ningún código.
- **Tablero de indicadores** con KPIs, tendencia diaria y distribución por curso,
  en SVG dibujado a mano (sin librería de gráficas, por el ancho de banda).
- **Consultas y descarga en Excel** con el número de días lectivos como denominador.
- **Notificaciones** de evasión a coordinación y de inasistencia a acudientes, en
  cola idempotente que nunca manda el mismo aviso dos veces.
- **Portal del acudiente**, que solo puede ver a sus propios hijos.
- **Importación** del listado de estudiantes por CSV.

---

## 2. Cómo se construyó

El trabajo se dividió en **tres tracks paralelos**, cada uno en su propio *git
worktree* y su propia base de datos, coordinados por contratos de API congelados
antes de empezar y una tabla de propiedad de ficheros.

```
Fase 0 (secuencial)  →  esquema + calendario + contratos + esqueletos congelados
   ├─ Track A  →  auth, calendario, arranque, sincronización
   ├─ Track B  →  PWA offline, toma de asistencia, escaneo QR
   └─ Track C  →  tablero, reportes, notificaciones, importación
Fase Z (secuencial)  →  integración
```

Cada track lo ejecutó un agente autónomo gobernado por un *driver* que reintenta
cuando se agota la cuota, lee la hora de renovación del propio mensaje de error y
duerme hasta entonces. Trabajo total: **29 commits**.

### Que el paralelismo funcionó, se puede medir

Al integrar los tres tracks solo hubo **dos conflictos**: `docs/ESTADO.md` (el
registro compartido, que se une sumando ambos lados) y `StudentRepository.java`,
donde A y C necesitaron métodos distintos del mismo repositorio. Cero conflictos en
código de negocio. El plan había predicho exactamente el primero.

---

## 3. Verificación

Todas las cifras siguientes se ejecutaron y se observaron; ninguna es estimada.

| Comprobación | Resultado |
|---|---|
| Tests de backend (`mvn test`) | **56 de 56**, contra PostgreSQL 16 real, en tres órdenes de ejecución |
| Tests de frontend (`npm test`) | **35 de 35** |
| Compilación del frontend | Limpia · **95,5 KB gzip** el paquete inicial |
| Integración continua | **Verde entera**: backend, frontend e **imagen Docker construida** |
| Commits | 58 |

El paquete inicial queda por debajo del objetivo de 200 KB. El segundo fragmento de
107 KB es la librería de escaneo de códigos, que **solo se descarga en teléfonos sin
lector nativo**: la mayoría nunca paga ese peso.

### Pruebas de extremo a extremo en navegador real

Conducidas con `agent-browser` sobre la aplicación desplegada localmente
(navegador → React → API con JWT → PostgreSQL):

1. **Login** con `fpalacios@ggm.edu.co` → "Bienvenido, Francisco Palacios".
2. **Descarga de datos** → aparece el curso 601, que es el que ese docente dicta.
3. **Selector de fecha** → ofrece 20, 19, 18, **14 y 13** de agosto. Se salta el 15 y
   16 (fin de semana) y el **17 (Asunción, festivo)**. El calendario funciona de
   punta a punta hasta la interfaz.
4. **Marcar una falta y enviar** → el registro aparece en la base:
   `JUAN | F | 2026-08-20 | fpalacios@ggm.edu.co`.
5. **Idempotencia** → el mismo lote enviado dos veces responde `accepted: 1` las dos
   veces y deja **una sola fila**. El bug de duplicados de Power Apps está muerto.
6. **Día no lectivo** → marcar el 17 de agosto responde
   `{"accepted":0,"rejected":[{"reason":"La fecha no es un dia lectivo"}]}`.
7. **Tablero** → KPIs, tendencia y gráficas renderizando, con descripciones
   accesibles ("Tendencia de asistencia entre 50 y 50 por ciento").
8. **Excel** → descarga un `.xlsx` válido de 3.683 bytes.

Capturas: `docs/e2e-asistencia.png`, `docs/e2e-dashboard.png`.

---

## 4. Dos defectos encontrados y corregidos

Vale la pena dejarlos escritos porque los dos los encontró la verificación, no la
revisión de código.

**Los tests no se aislaban entre corridas.** El segundo `mvn test` fallaba sin que
nadie hubiera tocado nada: los datos de la corrida anterior seguían ahí. Se detectó
antes de repartir el trabajo, así que los tres agentes no lo heredaron. Corregido
limpiando y remigrando la base al arrancar el contexto de test.

**Las horas de clase se desplazaban cinco horas.** Un bloque de las **06:30**
llegaba al docente como **01:30**. La causa era `hibernate.jdbc.time_zone=UTC`, que
también convertía los `LocalTime`, y una hora de clase no tiene zona horaria. **Los
41 tests unitarios no lo veían** porque ninguno comprobaba la hora ya formateada;
solo apareció al mirar la pantalla con un navegador real. Corregido, con test de
regresión que falla si alguien vuelve a poner ese ajuste.

---

## 5. Decisiones de diseño que conviene no deshacer

- **La restricción anti-duplicados vive en la base**, no en la interfaz. Aunque un
  cliente esté mal programado, la base no acepta el duplicado.
- **El identificador del estudiante es el número de su tarjeta de identidad**, el que
  ya trae el carnet. No se genera ninguno.
- **El calendario es una tabla, no una regla en código.** Los festivos colombianos
  siguen la Ley Emiliani y además el colegio necesita marcar a mano paros y jornadas
  pedagógicas, que ninguna regla predice.
- **El orden de colores de los estados es P, T, F, E** y está validado. El orden
  "natural" P, T, E, F pone amarillo junto a naranja, con una separación de 13,6
  sobre un mínimo de 15: dos segmentos que no se distinguen ni con visión normal.
  Además, cada color va siempre con su letra y su etiqueta.
- **Sin librería de gráficas.** Pesaría más que toda la aplicación junta para dibujar
  dos figuras, sobre la conexión del colegio.
- **El eje del gráfico de tendencia no arranca en cero**, porque la asistencia real
  vive entre 85 % y 100 % y desde cero sería una raya plana. Se compensa etiquetando
  siempre el máximo y el mínimo.

---

## 6. Cierre ejecutado

El plan `docs/superpowers/plans/2026-08-21-cierre-y-produccion.md` se ejecutó
completo, con sus seis tareas:

1. El gráfico de tendencia ya no queda plano cuando solo hay un día registrado.
2. El docente ya tiene enlace a Consultas, y coordinación al Tablero (no lo tenía nadie).
3. `SpaConfig`: recargar `/asistencia` en producción ya no da 404.
4. `Dockerfile` de tres etapas y flujo de integración continua con PostgreSQL.
5. Importación de horario y acudientes por CSV, además de la de estudiantes.
6. **Envío de correos verificado de verdad** contra un servidor SMTP: 6 de 6
   entregados, 0 errores. Constancia en `docs/VERIFICACION-CORREO.md`.

### Además, tres defectos de proceso corregidos

- El backend estaba en *package-by-feature* y no en **MVC por capas**, que era lo
  pedido. Se reestructuró: 36 clases movidas, 45 ficheros reescritos, tests en verde.
- El *driver* que gobierna a los agentes permitía **tres instancias simultáneas** sobre
  el mismo worktree, que se pisaban los commits y duplicaban tareas. Ahora usa un
  bloqueo por worktree y exige árbol de trabajo limpio antes de arrancar.
- El *driver* marcó la tarea 6 como completada **sin que produjera su entregable**: el
  agente decidió "esperar a que el planificador dispare" y terminó con éxito. La
  verificación humana lo detectó y la tarea se rehízo a mano. Un agente que reporta
  éxito no es evidencia de éxito.

## 6.b Segunda iteración: administración y verificación en CI

**Pantalla de administración** (`/admin`, solo rol ADMIN), con tres pestañas:

- **Usuarios**: alta, búsqueda por rol y nombre, baja lógica y reseteo de contraseña.
  Las bajas no borran: un docente tiene asistencias con su `recorded_by`, y borrarlo
  rompería la trazabilidad de quién marcó qué.
- **Calendario**: cambiar el tipo de cualquier día con su motivo.
- **Carga de datos**: los tres CSV con sus cabeceras y el orden correcto a la vista.

Verificado de punta a punta en navegador real: el administrador cambió el 21 de agosto
a `SUSPENDIDO` desde la pantalla, quedó en la base con `updated_by = 1`, y el servidor
pasó a rechazar la asistencia de ese día con "La fecha no es un dia lectivo".
**El rector puede cerrar un día sin que nadie toque SQL**, que era el objetivo.

### Dos bugs que solo apareció la integración continua

**La suite dependía del orden de ejecución.** Tres tests fallaban en CI y pasaban en
local. Varios tests mutaban los datos de la semilla —uno le cambiaba el curso a una
estudiante, otro le añadía bloques al docente— y rompían a sus vecinos según el orden
en que Surefire ejecutara las clases. **En local pasaba por suerte.** Corregido: cada
test usa sus propios datos, verificado en tres órdenes distintos, y la CI ahora corre
con `-Dsurefire.runOrder=random` para que no vuelva a pasar inadvertido.

**La imagen Docker no compilaba el frontend.** `mock.ts` importa los fixtures del
contrato con `../../../contracts/`, y la etapa de compilación usaba una carpeta plana
donde esa ruta no existe. El fallo **solo se manifestaba dentro de la imagen**. Como
Docker Desktop exige elevación de administrador y no se pudo instalar aquí, la CI fue
la única forma de detectarlo. Corregido y **la imagen ya se construye en verde**.

### Matriz de roles verificada contra la API real

| Rol | Acción | Resultado |
|---|---|---|
| ACUDIENTE | consultar sus hijos | solo el suyo |
| ACUDIENTE | tablero de coordinación | 403 |
| DOCENTE | importar datos | 403 |
| DOCENTE | portal de acudientes | 403 |
| COORDINADOR | administrar usuarios | 403 |

Capturas: `docs/e2e-admin-calendario.png`.

---

## 6.c Tercera iteración: tests de interfaz y un driver que verifica

**El frontend pasó de 0 a 16 tests de interfaz.** Las 19 pruebas anteriores cubrían
solo los módulos sin pantalla; 17 componentes no tenían ninguna. Se cubrieron los
cuatro con más lógica y más riesgo: el bloqueo por día no lectivo, el estado de
conexión, la pantalla de toma de asistencia y el panel de calendario del rector.

### Un test inestable y un mensaje falso

El test de `SelectorFecha` fallaba de forma intermitente. La causa no era el
componente: `findByRole` leía el **primer render**, antes de que resolviera la consulta
a IndexedDB, así que el resultado dependía de lo rápido que respondiera la base.
Corregido con `waitFor`.

Pero al investigarlo apareció algo real: el componente afirmaba *"esa fecha no está en
el calendario descargado"* **antes de haberlo consultado**. En un teléfono lento el
docente veía ese mensaje alarmante y falso durante un instante. Ahora no dice nada
hasta saberlo.

### El driver no verificaba nada

Dos veces una tarea se dio por completa sin dejar el entregable o dejando un test en
rojo, porque el driver solo miraba el código de salida de `claude -p`. **Que un agente
diga "listo" no es evidencia de nada.** Ahora el driver ejecuta los tests del backend y
del frontend y comprueba que haya commit antes de marcar la tarea; si algo falla, la
reintenta.

Se probó en los dos sentidos —aprueba un worktree verde y detecta uno con un test roto
a propósito—, porque un chequeo que nunca falla no sirve de nada.

---

## 7. Lo que sigue faltando

Requieren su propio plan:

- **Días institucionales A/B** y separación de laboratorios, como pidió Miguel Bacca.
- **Calendario de 2027 en adelante** (hoy está sembrado 2026).
- **Notificación de llegada tarde**: falta que el colegio defina desde qué hora una
  tardanza se reporta. Es decisión de la institución, no técnica.

**Cómo desplegarlo está escrito en `docs/DESPLIEGUE.md`**: dos opciones (Fly.io o un
VPS con Caddy), las variables de entorno obligatorias, el orden de carga de los datos,
las copias de seguridad y la lista de comprobaciones posteriores. La integración
continua publica la imagen en GHCR desde `main`.

Requieren una persona, hardware o datos que no tenemos:

- **Escanear un carnet real** y comprobar que el código impreso coincide con
  `document_id`. Si no coincide, el problema son los datos, y es mejor descubrirlo con
  un carnet en la mano que el primer día de clases.
- **Instalar la PWA en un teléfono**, lo que exige HTTPS.
- **Los datos reales**: 1.200 estudiantes, horario completo y contactos. El archivo
  `legacy/Toma de asistencia.xlsx` tiene corrupción de codificación visible
  (`CASTA?EDA`) que hay que corregir **antes** de importar.
- **Confirmar el calendario con la rectoría**: los festivos nacionales son correctos,
  los recesos son los típicos del calendario A.
