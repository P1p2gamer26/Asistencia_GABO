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
| Tests de backend (`mvn test`) | **41 de 41**, contra PostgreSQL 16 real |
| Tests de frontend (`npm test`) | **14 de 14** |
| Compilación del frontend | Limpia · **95,5 KB gzip** el paquete inicial |
| Clases de test backend | 13 |

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

## 6. Lo que falta

Detallado, con plan de ejecución, en
`docs/superpowers/plans/2026-08-21-cierre-y-produccion.md`.

En resumen: empaquetado y despliegue (Dockerfile, integración continua, HTTPS),
carga de los datos reales del colegio (1.200 estudiantes, horario y acudientes),
pantalla de administración para que el colegio se maneje solo, y las pruebas que
solo se pueden hacer con hardware y datos reales — escanear un carnet de verdad e
instalar la PWA en un teléfono.
