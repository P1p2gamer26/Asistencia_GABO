# Sistema de Asistencia — Colegio Gabriel García Márquez

Aplicación web instalable (PWA) para la toma de asistencia, offline-first.
Reemplaza la solución anterior en Power Apps + Excel, que queda en `../legacy/`
únicamente como referencia visual.

## Estructura

```
app/
├── backend/      Spring Boot 3.4 · Java 21 · PostgreSQL 16 · API JSON
├── frontend/     React 18 · TypeScript · Vite · PWA
├── contracts/    Contrato de API congelado + fixtures compartidos
└── docker-compose.yml
```

## Convención de paquetes del backend (MVC por funcionalidad)

Cada funcionalidad es un paquete, y **dentro** de cada funcionalidad se separan las
capas MVC. Así el código de una misma feature vive junto (se lee y se borra de una
pieza) y a la vez cada clase tiene su capa explícita.

```
co.edu.ggm.asistencia
├── AsistenciaApplication.java
├── shared/
│   ├── config/          SecurityConfig, JwtFilter, SpaConfig, TestDatabaseConfig
│   └── service/         JwtService y utilidades transversales
├── calendar/
│   ├── controller/      CalendarController      ← C de MVC (capa web)
│   ├── service/         CalendarService         ← lógica de negocio
│   ├── repository/      CalendarRepository      ← acceso a datos
│   └── model/           SchoolDay, DayType      ← M de MVC (entidades)
├── user/                misma división
├── student/             misma división
├── schedule/            misma división
├── attendance/          misma división
├── entry/               misma división
├── report/              misma división
└── notify/              misma división
```

Reglas que no se negocian:

1. **Un controlador nunca habla con un repositorio.** Siempre pasa por un servicio.
   La única excepción son las consultas de solo lectura ya proyectadas a DTO, y aun
   así se prefiere un servicio si hay alguna decisión de por medio.
2. **Las entidades JPA no salen del backend.** Los controladores devuelven `record`
   DTO declarados en el propio controlador o en `model/dto/`. Nunca se serializa una
   entidad directamente: expondría columnas internas y ataría la API al esquema.
3. **La "V" de MVC es el frontend.** El backend no renderiza vistas: expone JSON.
   La capa de presentación es React, y ahí la separación es página / componente.
4. **Nada de lógica de negocio en el repositorio** más allá de la consulta. Si hay
   un `if`, va en el servicio.

## Puesta en marcha

Requisitos: Java 21, Maven 3.9+, Node 20+, PostgreSQL 16.

```bash
# Base de datos (una vez)
psql -U postgres -c "CREATE DATABASE asistencia"
psql -U postgres -c "CREATE DATABASE asistencia_test"

# Backend  → http://localhost:8080
cd backend && mvn spring-boot:run

# Frontend → http://localhost:5173
cd frontend && npm install && npm run dev

# Frontend sin backend, contra los fixtures del contrato
cd frontend && VITE_MOCK=1 npm run dev
```

Tests:

```bash
cd backend  && mvn test     # requiere PostgreSQL en localhost:5432
cd frontend && npm test
```

Variables de entorno de los tests (con estos valores por defecto):
`TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test`,
`TEST_DB_USER=postgres`, `TEST_DB_PASSWORD=postgres`.

## Documentación

- Plan de implementación: `../docs/superpowers/plans/2026-08-20-sistema-asistencia-paralelo.md`
- Contrato de API: `contracts/api.md`
- Estado de los tracks: `../docs/ESTADO.md`
