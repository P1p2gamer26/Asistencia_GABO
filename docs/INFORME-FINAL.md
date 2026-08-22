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
| Tests de backend (`mvn test`) | **94 de 94**, contra PostgreSQL 16 real, en tres órdenes de ejecución |
| Tests de frontend (`npm test`) | **109 de 109** |
| Compilación del frontend | Limpia · **95,5 KB gzip** el paquete inicial |
| Integración continua | **Verde entera**: backend, frontend, imagen Docker y **prueba de humo** |
| Commits | 136 |

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
rojo, porque el driver solo miraba el código de salida de el agente. **Que un agente
diga "listo" no es evidencia de nada.** Ahora el driver ejecuta los tests del backend y
del frontend y comprueba que haya commit antes de marcar la tarea; si algo falla, la
reintenta.

Se probó en los dos sentidos —aprueba un worktree verde y detecta uno con un test roto
a propósito—, porque un chequeo que nunca falla no sirve de nada.

---

## 6.d Cuarta iteración: cobertura y cadena de despliegue verificada

**El frontend pasó de 0 a 31 tests de interfaz** en dos tandas. La segunda cubrió los
tres componentes que quedaban con lógica y riesgo: el portal del acudiente (datos de
menores), el panel de usuarios (si el aviso de la contraseña temporal no aparece, el
administrador crea a alguien que no sabe cómo entrar) y el de carga (un importador que
dice "0 filas cargadas" sin decir por qué es inservible con 1.200 estudiantes).

**El driver corregido funcionó.** Fue el primer track que corrió con verificación
propia: las dos tareas quedaron marcadas como "OK (verificada)" y cero verificaciones
fallidas. La comprobación independiente lo confirmó.

**La cadena de despliegue está verificada de extremo a extremo.** La integración
continua construye y publica la imagen: `ghcr.io/p1p2gamer26/asistencia-ggm:latest`,
digest `sha256:8a23834a…`. Al comprobarlo apareció un detalle que habría frenado el
despliegue el primer día: la imagen **es privada**, porque hereda la visibilidad del
repositorio, así que el servidor tiene que autenticarse contra el registro. Documentado
en `docs/DESPLIEGUE.md` con las dos salidas posibles.

### Prueba de humo final, sobre el código ya integrado

Tras todas las fusiones, los cuatro invariantes del sistema siguen en pie:

| Invariante | Comprobación |
|---|---|
| Sin duplicados | mismo lote dos veces → `accepted: 1` las dos, **1 fila** en la base |
| Calendario | marcar en festivo → `"La fecha no es un dia lectivo"` |
| Horas sin desfase | el bloque sigue siendo `06:30`, no `01:30` |
| Roles | el docente ve Consultas y **no** ve Tablero ni Administración |

---

## 6.e Quinta iteración: los invariantes ahora se comprueban solos

El patrón de todo el proyecto fue este: **los tres bugs más serios no los encontró
ningún test, los encontró mirar el sistema funcionando.** Las horas desplazadas cinco
horas, el Dockerfile que no compilaba, la suite que dependía del orden. Mientras eso
dependiera de que alguien se acordara de mirar, iba a volver a pasar.

`tools/humo.sh` comprueba 15 invariantes contra una instancia **real** ya corriendo:
autenticación y rechazo de credenciales, horas sin desfase, idempotencia (mismo lote
dos veces, una sola fila), calendario (festivo y domingo rechazados), separación de
roles, descarga del Excel y rutas de la SPA. La integración continua lo ejecuta contra
la imagen empaquetada, que es la única forma de cubrir también el frontend servido.

Se verificó **en los dos sentidos**, igual que la verificación del driver: pasa contra
el sistema sano, y al reintroducir a propósito el `hibernate.jdbc.time_zone` que
causaba el bug de las horas, lo detecta. Una prueba que nunca falla no prueba nada.

### Y encontró un bug de producción en su primera ejecución

La sonda `/actuator/health` devolvía **503 con el servidor de correo inalcanzable**.
`spring-boot-starter-mail` añade un indicador que intenta conectarse al SMTP y, si no
responde, marca **toda la aplicación** como caída. En producción, un orquestador la
habría reiniciado en bucle aunque tomar asistencia —que es lo crítico— funcionara
perfectamente.

Corregido desactivando ese indicador: los fallos de envío ya quedan registrados con su
motivo en la tabla `notifications`, que es donde hay que mirarlos, no en una sonda de
vida. El indicador de base de datos sigue activo, comprobado: si la base cae, la sonda
debe fallar, porque sin base no hay sistema.

---

## 6.f Sexta iteración: el carnet real y la salida a producción

### El QR del carnet no traía lo que suponíamos

El colegio mostró un carnet real: el QR es pequeño y trae **el texto completo** en una
sola línea, no el número de documento suelto.

```
Álvaro Mathias Orozco Lara 1013696566 Primero - 103
```

La versión anterior mandaba ese texto tal cual como `documentId`, así que **ningún
escaneo real habría funcionado**. Ahora se extrae el primer número de 6 a 12 dígitos y
se busca en la base.

El parseo está en los **dos lados**, y no por duplicar por duplicar: la cola offline de
un teléfono puede llevar semanas de escaneos hechos con la versión vieja, con el texto
crudo dentro. Si solo se arreglara el navegador, esos quedarían rechazados para
siempre. El arreglo va donde pasan todos, en `EntryController.sync`.

**La base manda sobre el carnet.** El nombre y el curso que trae el QR no se usan para
registrar nada, pero si el curso no coincide con el de la base la pantalla lo avisa:
un carnet viejo o un traslado sin actualizar es un problema de datos que conviene ver,
no esconder. Un QR ilegible se rechaza con motivo propio (`Carnet ilegible`), distinto
de `Carnet no registrado`: son dos problemas distintos y quien esté en el salón
necesita saber cuál de los dos tiene.

### Tres informes en Excel

Coordinación pidió tres, y son tres formas distintas de mirar lo mismo:

| Informe | Para qué | Decisión que trae dentro |
|---|---|---|
| **Matriz por curso y rango** | ver el mes de un curso de un vistazo | una celda vacía es "sin registro", **no** una falta: si la docente no pasó lista, poner F sería inventarse una inasistencia |
| **Consolidado de inasistencias** | el proceso de seguimiento | trae **las fechas concretas**, no solo el conteo: "3 faltas" no le dice a nadie a qué clase ir a preguntar |
| **Individual del estudiante** | entregárselo al acudiente | los estados van traducidos (P/T/F/E → Presente/Tarde/Falta/Evasión): la hoja sale del colegio y nadie de fuera sabe qué es una E |

Los tres son tipos del endpoint que ya existía. Sin el parámetro `tipo` devuelve el
resumen de siempre, con sus nueve columnas, porque `tools/humo.sh` lo comprueba y
romper la prueba de humo para añadir una función sería el peor cambio posible.

El informe individual es el único que recibe un `studentId`, y es de personal del
colegio. Un acudiente que lo pida recibe 403: para eso tiene su portal, que resuelve
los hijos desde el token.

### El calendario, por rangos

Un paro de tres días o un receso que la rectoría mueve son rangos, no días sueltos.
Hacerlo día por día es exactamente donde la gente se equivoca. El panel gana un
formulario de rango que salta sábados y domingos, y dice cuántos días cambió, para que
quien lo usa vea si fueron los que esperaba.

El test comprueba además algo que no se ve en la pantalla: que la **caché en memoria**
de días lectivos se entera del cambio. Sin eso el servidor seguiría aceptando
asistencia en un día que el calendario ya dice suspendido.

### Los datos de los menores, blindados por un test

El portal del acudiente ya resolvía bien los hijos desde el token. Lo que faltaba era
que **fallara ruidosamente** si alguien en el futuro le añade un parámetro
`studentId`. Se añadieron dos acudientes con hijos distintos —con uno solo, "ve a los
suyos" no se distingue de "ve a todos"— y el test se verificó **al revés**: al
introducir a propósito ese parámetro en el controlador, se cae. Se deshizo el cambio.

### La salida a producción, en tres proveedores

| Pieza | Dónde | Por qué |
|---|---|---|
| PWA | Vercel | HTTPS y CDN gratis; la PWA los necesita para instalarse en un teléfono |
| PostgreSQL | Supabase | gestionado, con copias de seguridad; el esquema y Flyway van sin cambios |
| Backend Java | Fly.io | Vercel no ejecuta Java, y el backend de 56 tests ya verificado se conserva entero |

Separar el frontend del backend tiene una consecuencia que no se ve hasta que falla:
las llamadas pasan a ser **de origen cruzado**. Se añadió una URL base configurable
(`VITE_API_URL`) y CORS por variable de entorno (`APP_CORS_ORIGINS`), porque el dominio
de Vercel no se sabe hasta desplegar.

Y un **test guardián** que recorre las fuentes y falla si alguien vuelve a llamar a
`fetch` con una ruta `/api` relativa. Ya cazó uno que se nos había pasado, en
`PanelCarga.tsx`: en Vercel esa ruta apuntaría a Vercel, y el fallo solo se vería en
producción, con el colegio delante.

En `docs/DESPLIEGUE.md` queda documentada la trampa cara de Supabase: hay que usar el
**Session pooler (puerto 5432)**, no el Transaction pooler (6543), que no conserva las
sentencias preparadas de JDBC y hace fallar a Hibernate de forma intermitente y muy
difícil de diagnosticar.

### Verificación

| Comprobación | Resultado |
|---|---|
| Tests de backend | **77 de 77**, contra PostgreSQL 16 real, en orden aleatorio |
| Tests de frontend | **67 de 67** |
| Compilación del frontend | Limpia · **98,05 KB gzip** el paquete inicial |
| Prueba de humo | **16 invariantes en verde** contra la aplicación corriendo |
| Los tres Excel, contra la API viva | contenido comprobado celda a celda, no solo HTTP 200 |
| Carnet con texto completo, contra la API viva | `accepted: 1`, devuelve `DANIEL ALEJANDRO BARRIOS PARATES` |
| Carnet ilegible | `accepted: 0`, motivo `Carnet ilegible` |

La prueba de humo se ejecutó contra una instancia que **no sirve el frontend**, que es
justo el escenario de Vercel: el propio script detecta que no hay SPA y omite esos
invariantes en vez de fallar.

### Lo que no se pudo verificar en esta iteración

**El recorrido en navegador real no se ejecutó**: la extensión de Chrome no estaba
conectada en esta sesión. Queda pendiente comprobar con el navegador el flujo completo
de las tres pantallas nuevas (selector de informe, rango de calendario, aviso de curso
que no coincide). El patrón de todo este proyecto es que **los bugs más serios los
encontró mirar el sistema funcionando, no los tests**, así que este pendiente no es
menor: es el que más probabilidades tiene de encontrar el siguiente.

Tampoco se ha desplegado todavía en Vercel, Supabase ni Fly: la configuración
(`vercel.json`, `fly.toml`, CORS por entorno) está escrita y validada sintácticamente,
pero **una configuración de despliegue sin desplegar es una hipótesis**, igual que lo
fue el Dockerfile en la cuarta iteración —donde resultó estar mal—.

---

## 6.f Sexta iteración: auditoría y endurecimiento

Se auditó el código antes de proponer nada, y el resultado fue más interesante por lo
que **no** hacía falta: **la estructura está sana.** 2.199 líneas de Java, la clase más
grande tiene 199, ningún `findAll()` trayendo tablas enteras a memoria, todos los
controladores validan su entrada, 8 índices. Mover código sano de sitio es riesgo sin
beneficio, así que no se tocó.

Lo que sí aparecieron fueron cuatro agujeros concretos, y uno grave.

### Nadie podía cambiar su contraseña

No existía el endpoint. Los 1.200 acudientes y los docentes quedaban permanentemente en
`cambiar123` —que está escrita en este repositorio— y el "restablecer" del administrador
la dejaba en ese mismo valor conocido. La guía de despliegue decía *"cambie las
contraseñas antes que nada"* y **no había forma de hacerlo**.

Ahora hay cambio de contraseña propio, y la aplicación **obliga** a hacerlo mientras la
contraseña siga siendo la temporal: no se puede llegar a ninguna otra pantalla. Mínimo
de 8 caracteres y distinta de la actual; sin exigir mayúsculas ni símbolos, porque en un
colegio con acceso limitado a tecnología esas reglas producen contraseñas apuntadas en
un papel pegado al monitor.

### Los otros tres

- **El login no limitaba intentos.** Cinco fallos bloquean el correo quince minutos. Se
  cuenta **por correo y no por dirección IP**: el colegio sale a internet por una sola
  conexión, así que bloquear por IP dejaría fuera a todo el mundo en cuanto un docente
  se equivocara cinco veces.
- **El lote de sincronización no tenía tope.** Ahora 500 registros: un curso son 40 y
  una jornada completa unos 240, así que deja holgura para una semana sin señal.
- **La interfaz no tenía límite de error.** Cualquier fallo de renderizado dejaba la
  pantalla en blanco. Ahora muestra un mensaje que dice lo que el docente más necesita
  saber en ese momento: **la asistencia que ya marcó no se perdió**, está en el teléfono.

### Un zombi de un día

Durante la verificación, el endpoint nuevo devolvía 404 aunque el código estaba bien.
La causa: un proceso Java del día anterior seguía ocupando el puerto 8080 y sobrevivía
a todos los intentos de cerrarlo por falta de permisos. **Las pruebas locales llevaban
horas corriendo contra una versión vieja.** Se resolvió usando otro puerto, y el
episodio deja una lección: la integración continua, que parte siempre de cero, es la
única medición en la que se puede confiar sin reservas.

Resultado: **89 tests de backend y 82 de frontend**, verdes en tres órdenes de
ejecución, y los 21 invariantes de la prueba de humo en pie.

---

## 6.g Séptima iteración: medir con el volumen real del colegio

Todo lo anterior se probó y se auditó con tres estudiantes. El 22 de agosto de 2026 se
generó el volumen real —1.200 estudiantes, 80 docentes, 900 bloques de horario y un
semestre completo de asistencia: **620.748 registros, 146 MB**— con
`tools/datos-de-carga.sql`, y se midió cada petición contra esa base.

**El backend no necesita nada:**

| Petición | Tiempo | Tamaño |
|---|---|---|
| Paquete de arranque del docente | 87 ms | 9,6 KB |
| Bloques pendientes de hoy | 67 ms | — |
| Tablero, 30 días | 163 ms | 3,1 KB |
| Tablero, semestre entero | 210 ms | 6,4 KB |
| Resumen de un curso | 79 ms | 7,3 KB |
| **Resumen de todo el colegio** | **355 ms** | **218 KB** |
| Informe en Excel del semestre | 972 ms | 64 KB |
| Sincronizar un curso (40 registros) | 101 ms | — |
| Sincronizar una jornada (240 registros) | 290 ms | — |
| Portal del acudiente | 32 ms | — |

También se validó el dimensionamiento que el informe venía afirmando sin medir:
**230 bytes por fila reales** contra los 250 estimados. La cifra de ~400 MB al año se
sostiene.

Los problemas que sí aparecieron fueron de interfaz, los tres con la misma causa: se
diseñaron mirando tres estudiantes, no 1.200.

- **`Consultas` se traía el colegio entero.** Sin filtro de curso eran 1.203 filas y
  218 KB pintadas de una vez. Ahora exige elegir un curso —desplegable poblado desde el
  propio resumen, ya no texto libre— y la descarga en Excel sigue permitiendo todos los
  cursos, que es la herramienta correcta para el análisis global.
- **El gráfico de tendencia amontonaba las zonas sensibles.** Con 86 días lectivos los
  puntos quedaban a ~11 px y las zonas de toque medían 20 px fijos: se solapaban, y
  tocar un día devolvía otro. `anchoZonaSensible` las acota entre 8 y 44 px según la
  separación real entre puntos.
- **El gráfico de barras crecía sin límite.** 30 cursos eran 1.020 px de alto y el
  usuario perdía la leyenda al desplazarse. Ahora el SVG vive dentro de
  `.grafica-scroll` (`max-height: 60vh`, desplazable), y la leyenda queda siempre a la
  vista.

Los tres arreglos son de presentación —aritmética y un `overflow`, sin dependencias
nuevas—, y a propósito no tocan el backend: le sobra margen por un orden de magnitud
frente a lo medido.

---

## 6.h Un hallazgo de proceso: alcance que nadie pidio

Al revisar el tablero con datos reales apareció algo que no estaba en ningún plan: la
interfaz tiene una **identidad visual completa llamada "Planilla"** —tipografía, fondo
crema, jerarquía tipográfica, un número protagonista— que creció el fichero de estilos
de 63 a 224 líneas en tres commits del track de la aplicación. **Nadie la pidió.**

El resultado se ve bien y no se va a deshacer: rehacerlo ahora sería churn sin
beneficio. Pero conviene dejar escrito el patrón, porque es predecible: **un agente
llena los huecos que el plan no cierra explícitamente.** Si el plan no dice "no
inventes una identidad visual", alguno la inventa.

Y traía una consecuencia concreta que sí hubo que arreglar. Esa identidad fijó
`.card { max-width: 34rem }`, que es la medida correcta para leer texto y rellenar
formularios, pero **no para un tablero con gráficas**: a 544 px reales el SVG se escala
y las zonas sensibles de la línea de tendencia quedaban por debajo de lo tocable,
**anulando el arreglo que se acababa de hacer**. El tablero y las consultas usan ahora
una variante ancha. Medido: la tarjeta pasa de 540 a 1.152 px y el SVG renderiza a
1.002, coincidiendo con su `viewBox`.

Es un buen ejemplo de por qué mirar el sistema funcionando no se puede sustituir: dos
cambios correctos por separado —el ancho de lectura y el ancho de las zonas sensibles—
se cancelaban mutuamente, y ningún test lo habría visto.

---

## 6.j La asistencia solo se guardaba a medias

Verificación del 22 de agosto de 2026 contra la base de carga: en la prueba del ciclo
offline se marcaron **3 faltas en un curso de 40 estudiantes**. Después, en la base de
datos:

```
registros guardados:    3
estudiantes del curso:  40
ese bloque cuenta como ya marcado:  SI
```

**37 estudiantes que estaban presentes no tenían ningún registro.** La pantalla mostraba
la "P" resaltada para los 40, así que el docente creía razonablemente que los estaba
registrando a todos. Solo entraban a la cola los que se pulsaban.

Las consecuencias encadenaban:

- Un estudiante presente y uno cuya clase nadie registró eran **indistinguibles**: los
  dos sin fila.
- `GET /reports/pending-today` comprobaba `NOT EXISTS (... WHERE schedule_block_id = b.id
  AND class_date = :day)`, así que **un solo registro bastaba** para que el bloque
  desapareciera del aviso. Nadie le recordaba al docente que faltaban 37.
- Los informes contaban sobre las filas que existían, de modo que el porcentaje salía
  bien y **el hueco era invisible** en el tablero.
- En el caso extremo —un curso que asiste completo y el docente no toca nada— el botón
  de enviar estaba `disabled` porque `pendientes === 0`: **no se podía registrar nada
  aunque se quisiera**.

**El arreglo tiene dos partes.** El origen: `enviar()` en `TomarAsistencia.tsx` ahora
recorre el curso completo al pulsar Enviar, no solo lo que el docente tocó, y el botón
anuncia cuántos van a viajar de verdad (`app/frontend/src/pages/TomarAsistencia.tsx`).
La red de seguridad que debió atraparlo: `pendingToday` en `ReportRepository.java`
comparaba contra `EXISTS` un registro; ahora compara el conteo de registros contra el
conteo de estudiantes activos del curso, así que un bloque a medias sigue apareciendo
como pendiente.

El invariante quedó comprobado en `tools/humo.sh`: un lote con los dos estudiantes del
bloque de la semilla debe dejar exactamente dos filas en `attendance`.

---

## 6.j El defecto más grave: la asistencia se guardaba a medias

Al verificar el ciclo offline se marcaron **3 faltas en un curso de 40 estudiantes**.
En la base quedaron **3 registros**. Los 37 presentes no existían.

La pantalla mostraba la "P" resaltada para los 40, así que el docente cree
razonablemente que los está registrando a todos. Pero a la cola solo entraban los que
pulsaba. Las consecuencias encadenaban:

- Un estudiante presente y una clase que nadie registró eran **indistinguibles**: los
  dos sin fila.
- El aviso de bloques pendientes daba el bloque por completo en cuanto existía **un**
  registro, así que nadie iba a recordar que faltaban 37.
- Los informes contaban sobre las filas existentes, de modo que el porcentaje salía
  bien y **el hueco era invisible** en el tablero.
- En el caso extremo —un curso que asiste completo y el docente no toca nada— el botón
  estaba deshabilitado: **no se podía registrar nada aunque se quisiera**.

Contradecía el objetivo del proyecto tal como está escrito: *"garantizar la toma de
asistencia de todos los estudiantes"*.

**Corregido por las dos caras**: el envío registra ahora el curso completo con el estado
efectivo de cada estudiante, y el aviso de pendientes compara contra el número de
estudiantes activos del curso en vez de contra cero. Verificado con datos reales: marcar
una falta en un curso de 40 y enviar deja **40 registros — 1 falta y 39 presentes**.

### Por qué se escapó tanto tiempo

Los tests comprobaban que *marcar un estudiante lo encola*, y eso siempre funcionó.
**Nadie comprobaba cuántos quedan al final.** Con dos o tres estudiantes de prueba,
marcar uno y ver un registro parecía correcto. Hizo falta un curso de 40 y contar las
filas en la base para que la diferencia entre 3 y 40 saltara a la vista.

### Y un test que no se ejecutaba

Los tests del aviso de pendientes usaban `assumeTrue(dia <= 5)`: al ejecutarlos en
sábado, **los tres se saltaron** y el arreglo quedó sin verificar. Habría pasado dos días
de cada siete en la integración continua, en silencio. Se reescribieron contra el
repositorio con una fecha fija, deterministas cualquier día, y se añadió el caso que
faltaba: un estudiante retirado del curso no debe impedir que el bloque se dé por
completo.

**Un test que se salta es peor que un test que falta**: el que falta se ve en la lista,
el que se salta parece cobertura.

---

## 6.k La pantalla debe reflejar lo que está guardado

Se recorrió el escenario exacto de un docente con el curso real de 40 estudiantes:
marcar una llegada tarde, escribir el motivo y enviar. Aparecieron dos defectos, misma
causa.

**El motivo se perdía.** Tras escribir "El bus se demoro" y pulsar Enviar, en la base
quedaba `comment: NULL`. La sincronización automática enviaba el registro con su motivo
y vaciaba la cola; al pulsar Enviar, la pantalla reconstruía los 40 registros sin nada
de donde conservar el motivo, y el `upsert` del servidor sobrescribía el motivo bueno
con vacío. Anulaba un requisito explícito del feedback de los docentes: *"permitir
agregar comentarios de porque llego tarde o falto"*.

**Reabrir una clase ya registrada la mostraba en blanco.** La pantalla nunca llamaba a
`GET /api/attendance?blockId=&date=`, que existe justo para eso. Solo leía la cola
local, y la cola se vacía al sincronizar. Un docente que revisaba una clase de ayer veía
a los 40 estudiantes en "P", sin rastro de las faltas que puso, y si pulsaba Enviar
—razonable, porque la pantalla parecía vacía— sobrescribía las faltas reales con
presentes.

Los dos eran la misma causa: la cola local no puede ser la única memoria de la
pantalla. Es un buzón de salida, no un registro.

**Corregido por las dos caras**: los motivos pasaron a vivir en el estado del componente
y viajan con el envío, no con la cola; y al abrir un bloque la pantalla consulta primero
lo que el servidor tiene guardado, y encima aplica lo que quede sin enviar en la cola
local, que es más reciente. Sin conexión no se puede consultar el servidor: se usa solo
la cola y se avisa explícitamente de que la pantalla puede no mostrar todo lo guardado.

El invariante quedó comprobado en `tools/humo.sh`: un lote con una tardanza y su motivo
debe devolver ese mismo motivo al consultar `GET /api/attendance`.

### La lección

Un buzón de salida sirve para saber qué falta por enviar, no para saber qué hay. Cada
vez que la pantalla usó la cola como memoria —las marcas al reabrir, el motivo al
enviar— acabó mintiendo en cuanto la cola se vació.

---

## 6.k La cola de salida no puede ser la memoria de la pantalla

Siguiendo el mismo hilo —la distancia entre lo que la pantalla promete y lo que el
sistema guarda— aparecieron dos defectos más, y resultaron ser **el mismo error cometido
dos veces**.

**El motivo de una tardanza se perdía.** El docente marcaba "llegó tarde", escribía "el
bus se demoró" y pulsaba Enviar: en la base quedaba `comment: NULL`. La causa tenía dos
capas. La primera, que `markAttendance` usa `put`, que reemplaza el registro entero, de
modo que cualquier llamada sin motivo lo borraba. La segunda, más profunda: aunque se
conserve lo que hubiera en la cola, **la sincronización automática ya había vaciado la
cola**, así que al enviar no había nada de donde conservarlo y el `upsert` del servidor
sobrescribía el motivo bueno con vacío.

Esto anulaba un requisito explícito de los docentes recogido en `Pruebas.docx`:
*"permitir agregar comentarios de porque llego tarde o falto"*.

**Reabrir una clase ya registrada la mostraba en blanco.** La pantalla nunca llamaba a
`GET /api/attendance?blockId=&date=`, que existe justo para eso. Solo leía la cola local,
y la cola se vacía al sincronizar. Un docente que revisaba la clase de ayer veía a los 40
estudiantes en "P", sin rastro de las faltas que había puesto. Y si pulsaba Enviar —cosa
razonable, porque la pantalla parecía vacía— **sobrescribía las faltas reales con
presentes**.

### La lección

**Un buzón de salida sirve para saber qué falta por enviar, no para saber qué hay.** Cada
vez que la pantalla usó la cola local como memoria, acabó mintiendo en cuanto la cola se
vació. Ahora el estado de la pantalla es la fuente de verdad: se alimenta al abrir un
bloque desde lo guardado en el servidor, con la cola local encima porque es más reciente,
y avisa explícitamente cuando sin conexión no se puede comprobar.

### Verificado con datos reales

| Prueba | Antes | Ahora |
|---|---|---|
| Reabrir una clase registrada | Todo en "P" | 1 tardanza y 39 presentes, como en la base |
| Enviar sin tocar nada | Borraba la tardanza | Los datos quedan intactos |
| Escribir un motivo y enviar | Se perdía | `T -> motivo: El bus se demoro` |

---

## 6.l La portería decía "no reconocido" a todo el colegio

Verificación del 22 de agosto de 2026 contra la base de carga. La pantalla de ingreso
busca al estudiante en la copia local del dispositivo, que viene de
`GET /api/sync/bootstrap` y trae **solo los estudiantes de los cursos que dicta quien
entró**. Medido con el usuario que de verdad está en la portería —coordinación, que no
dicta ningún curso—:

```
bootstrap de coordinacion:  bloques: 0 | estudiantes: 0 | dias: 88
```

Cero estudiantes en la copia local. La pantalla decía **"Carnet no reconocido"** a los
1.200 estudiantes del colegio, uno por uno, cada mañana. El registro se guardaba igual,
pero quien estaba en la puerta perdía la única señal que le servía para algo: distinguir
un carnet realmente malo de uno que simplemente no estaba en su copia.

Lo llamativo es que el dato correcto llegaba desde el primer día. El servidor ya
responde con el nombre resuelto:

```json
{"accepted":1,"rejected":[],"names":{"aaaa-...-0009":"NOMBRE500 SEGUNDO500 APELLIDO500 SEGUNDOAP500"}}
```

y la pantalla declaraba el tipo de la respuesta **sin el campo `names`**, así que
TypeScript lo descartaba en silencio al deserializar. Ninguna comprobación de tipos avisa
de un campo que sobra: solo de uno que falta.

### La corrección

Ahora la pantalla distingue los tres casos que antes se confundían en uno:

| Situación | Antes | Ahora |
|---|---|---|
| El servidor confirma y da el nombre | "Carnet no reconocido" | El nombre del estudiante |
| El servidor rechaza el carnet | "Carnet no reconocido" | "Carnet no registrado", en rojo |
| Sin conexión y sin copia local | "Carnet no reconocido" | "Carnet registrado, se verificará al sincronizar" |

El tercer caso es el que más importa: el ingreso queda guardado igual, y decir lo
contrario haría que alguien lo escaneara tres veces pensando que falló.

### Verificado con datos reales

```
curl -X POST /api/entry/sync ... {"documentId":"1010101010", ...}
-> names contiene "LINDA AREVALO"
```

Y el invariante quedó en `tools/humo.sh`: un carnet real resuelve el nombre, uno
inexistente se rechaza con motivo "no registrado".

---

## 6.l La portería habría dicho "no reconocido" a los 1.200 estudiantes

La pantalla de ingreso buscaba al estudiante en la copia **local** del dispositivo. Esa
copia viene del paquete de arranque, que trae solo los estudiantes de los cursos que
dicta quien entró. Medido con el usuario de coordinación, que es quien está en la puerta:

```
bootstrap de coordinacion:  bloques: 0 | estudiantes: 0
```

Cero. Cada carnet escaneado habría mostrado *"Carnet no reconocido"*. El ingreso se
guardaba bien, pero quien está en la puerta vería un error constante y **perdería la
capacidad de detectar un carnet realmente malo**, que es justo para lo que sirve ese
mensaje.

**El dato correcto ya estaba llegando.** El servidor responde
`{"accepted":1,"rejected":[],"names":{"...":"NOMBRE777 APELLIDO777"}}`, y la pantalla lo
descartaba. No por un error de lógica, sino **por una línea de tipos**: declaraba la
forma de la respuesta sin `names`, así que el campo desaparecía en silencio al
deserializar.

Es el hallazgo más instructivo del proyecto en ese aspecto: **TypeScript describe lo que
esperas, no lo que llega.** Una declaración incompleta no produce ningún error, y ningún
test unitario lo detecta, porque el test simula la respuesta usando ese mismo tipo
incompleto.

Ahora la pantalla distingue los tres casos que confundía en uno: el servidor confirma y
da el nombre; el servidor rechaza el carnet; o no hay conexión todavía, en cuyo caso dice
que **el ingreso quedó registrado y se verificará al sincronizar** — porque decir lo
contrario haría que alguien escaneara el mismo carnet tres veces.

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
continua publica la imagen en GHCR desde `main`, verificado:
`ghcr.io/p1p2gamer26/asistencia-ggm:latest`, digest `sha256:8a23834a…`.

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
