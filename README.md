# Sistema de Asistencia — Colegio Gabriel García Márquez

Sistema **offline-first** de registro de asistencia escolar en producción, desarrollado
para el Colegio Gabriel García Márquez. Reemplaza la solución anterior en Power Apps +
Excel (conservada en [`legacy/`](legacy/) solo como referencia visual).

## Descripción

Una PWA instalable que permite a los docentes tomar la asistencia **sin conexión a
internet** y sincronizarla automáticamente al recuperar la red. Incluye portal para
acudientes, planilla de horarios, control de ingreso por portería, reportes y
notificaciones por correo.

Diseñada para el volumen real del colegio: **~1.200 estudiantes**, 900 bloques de
horario y un semestre completo (~620.000 registros de asistencia).

## Características

- **Asistencia offline-first**: se marca sin conexión y la cola de sincronización se
  vacía sola al restaurar la red; resolución de conflictos con regla de *última marca*.
- **Roles**: administración, coordinación, docentes y acudientes (JWT + refresh).
- **Planilla de horarios**: bloques de 60 minutos, cursos por grado, detección de
  sancuentros y edición de la planilla.
- **Portal de acudientes**: consulta de la asistencia de sus hijos.
- **Control de ingreso**: registro de entradas por portería.
- **Reportes en Excel** del periodo y **notificaciones por correo** (faltas, llegadas
  tarde y evasión, configurables por variable de entorno).
- **Importación por CSV** de estudiantes, horario y acudientes (rol administración).
- **Seguridad**: contraseñas con hash (BCrypt), límite de intentos de login y cambio de
  contraseña obligatorio donde aplica.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 · TypeScript · Vite · PWA (Service Worker / Workbox) · IndexedDB (Dexie) |
| Backend | Spring Boot 3 · Java 21 · REST JSON · JPA/Hibernate |
| Base de datos | PostgreSQL 16 · migraciones Flyway |
| Infraestructura | Docker · GitHub Actions (CI + imagen GHCR) · configuración para Render, Fly.io y Vercel |

## Arquitectura

- **Backend por capas** (`controller → service → repository → model`). La entidades JPA
  nunca se serializan: los controladores exponen DTO en forma de `record`.
- **Frontend como SPA**: el backend solo sirve JSON; la presentación vive en React con
  separación página / componente.
- **Sincronización**: la PWA escribe en IndexedDB y envía la cola de cambios cuando hay
  red, con reintentos y orden garantizado.

## Puesta en marcha (local)

Requisitos: Java 21, Maven 3.9+, Node.js 20+, PostgreSQL 16.

```bash
# 1. Base de datos (una sola vez)
psql -U postgres -c "CREATE DATABASE asistencia"

# 2. Backend — http://localhost:8080
cd app/backend
DB_URL=jdbc:postgresql://localhost:5432/asistencia \
DB_USER=postgres \
DB_PASSWORD=postgres \
mvn spring-boot:run

# 3. Frontend — http://localhost:5173
cd app/frontend
npm install
npm run dev
```

Las migraciones de Flyway se aplican solas al arrancar. Verifica con
`http://localhost:8080/actuator/health` (debe responder `{"status":"UP"}`).

En Windows (PowerShell), las variables de entorno se escriben con `$env:DB_URL = "..."`,
`$env:DB_USER = "..."`, etc.

> Toda credencial se inyecta por variables de entorno; no hay secretos versionados.
> **Nunca** apuntes el backend local a la base de producción.

### Datos de demostración (solo local)

```bash
psql -U postgres -d asistencia -f tools/datos-colegio.sql
```

Crea 12 cursos, 25 estudiantes por curso, docentes con su materia, el horario y la
asistencia del mes — incluidos casos borde (curso sin registros, estudiante retirado,
jornada institucional). Es idempotente. También incluye cuentas demo con contraseña
temporal (detalles en [`app/README.md`](app/README.md)).

## Pruebas

```bash
cd app/backend  && mvn test          # requiere PostgreSQL en localhost:5432
cd app/frontend && npm test
```

La CI (GitHub Actions) corre backend, frontend y una **prueba de humo** sobre la imagen
Docker real, incluidas las rutas de la SPA servidas por Spring Boot.

## Rendimiento

Carga concurrente simulada (40 docentes sincronizando a la vez, el escenario de las
7:00 de la mañana):

- **1.600 registros, 305 ms de media, 599 ms el peor caso** y 2,4 s en total.
- Contención real probada: ocho docentes marcando el mismo bloque y los mismos
  estudiantes terminan con 40 filas (no 320) y aplica la última marca.

## Despliegue

La imagen Docker se publica a GHCR desde `main` (GitHub Actions). Los archivos
[`Dockerfile`](Dockerfile), [`render.yaml`](render.yaml), [`fly.toml`](fly.toml) y
[`vercel.json`](vercel.json) traen la configuración de despliegue. Las credenciales de
producción (`DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`) se definen en el panel del
proveedor como secretos y **nunca** se versionan.

## Documentación

- [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md) — despliegue en producción
- [`docs/INFORME-FINAL.md`](docs/INFORME-FINAL.md) — informe del proyecto
- [`app/README.md`](app/README.md) — arquitectura, contrato de API y guías de desarrollo
- [`app/contracts/api.md`](app/contracts/api.md) — contrato de la API