# Spec v2 — Producción real del Sistema de Asistencia GGM

Fecha: 2026-08-21 · Decidido con el usuario (Julián) antes de escribir el plan.

## Problema

La v1 funciona y está verificada, pero vive solo en la máquina de desarrollo y en
una imagen Docker privada en GHCR. Nadie del colegio la puede usar todavía. Además
aparecieron tres requisitos nuevos del colegio.

## Requisitos

### R1 — Escaneo del carnet con el formato real

El QR impreso en el carnet es **pequeño** y contiene el texto completo del
estudiante en una sola línea, no solo el número:

```
Álvaro Mathias Orozco Lara 1013696566 Primero - 103
```

- El sistema debe **extraer el documento** (`1013696566`) y buscar al estudiante en
  la base. **La base manda**: el nombre y el curso del carnet son informativos.
- Si el nombre o el curso del carnet **no coinciden** con la base, se registra igual
  pero se **avisa en pantalla**. Un carnet viejo o un traslado de curso sin
  actualizar es un problema de datos que hay que ver, no que ocultar.
- Si el documento no existe en la base: se rechaza con motivo legible.
- **Quien escanea es la docente en el salón**, no el vigilante en portería. No hay
  informe de ingresos por portería en esta versión.

### R2 — Informes en Excel (tres)

1. **Asistencia por curso y rango de fechas** — matriz estudiantes × días lectivos
   con P/T/F/E y el % de asistencia sobre días lectivos.
2. **Consolidado de inasistencias** — solo estudiantes con faltas, ordenados de más
   a menos, con el detalle de fechas. Para el proceso de seguimiento.
3. **Informe individual del estudiante** — historial completo de uno solo, para
   entregar al acudiente.

El informe de resumen actual (`/api/reports/excel` sin parámetros) se conserva tal
cual: `tools/humo.sh` lo comprueba.

### R3 — El calendario lo deciden los administradores

Ya existe el calendario sembrado de 2026 (190 lectivos, 18 festivos, 3 recesos) y el
panel para cambiar un día. Falta poder **marcar un rango completo** de una vez: una
semana de paro o un receso que la rectoría mueve son rangos, no días sueltos.

### R4 — Los acudientes solo ven a sus hijos

Ya implementado (`GuardianController` no acepta `studentId` por parámetro, resuelve
los hijos desde el JWT vía `guardianships`). Falta un **test de regresión explícito**
que falle si alguien introduce un parámetro de estudiante en el futuro. Es dato de
menores: la garantía tiene que estar escrita en un test, no en la memoria de nadie.

### R5 — Despliegue real: Vercel + Supabase + Fly.io

Decisión del usuario (opción 2 de las tres ofrecidas):

| Pieza | Dónde | Por qué |
|---|---|---|
| Frontend (PWA React) | **Vercel** | HTTPS y CDN gratis; la PWA necesita HTTPS para instalarse en el teléfono |
| Base de datos | **Supabase** | PostgreSQL 16 gestionado con copias de seguridad; el esquema y las migraciones Flyway funcionan sin cambios |
| Backend (Spring Boot) | **Fly.io** | Vercel no ejecuta Java. Se conserva el backend entero: 56 tests, 40 clases, ya verificado |

Consecuencias técnicas que el plan debe cubrir:

- El frontend deja de estar servido por Spring: las llamadas pasan a ser **de origen
  cruzado**. Hace falta una URL base configurable y CORS por variable de entorno.
- Supabase exige **SSL** y su *pooler* de transacciones rompe las sentencias
  preparadas de JDBC. Hay que documentar qué puerto usar.
- El *service worker* de la PWA cachea por ruta relativa `/api/`; con la API en otro
  dominio esa regla deja de aplicar.

### R6 — Verificado en el navegador real

Al terminar, comprobar el despliegue con **agent-browser** contra las URL públicas:
login, escaneo (con un QR de prueba del formato de R1), descarga de los tres Excel,
edición del calendario por rango y portal del acudiente.

## Fuera de alcance

- Días institucionales A/B y separación de laboratorios.
- Calendario 2027 en adelante.
- Notificación de llegada tarde (falta que el colegio defina la hora de corte).
- Importar los 1.200 estudiantes reales (`legacy/Toma de asistencia.xlsx` tiene
  corrupción de codificación pendiente de corregir).

## Invariantes que no se pueden romper

Los 15 de `tools/humo.sh` siguen en verde al final, en particular: sin duplicados,
rechazo de días no lectivos, horas sin desfase y separación de roles.
