# Sistema de Asistencia GGM — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.


> **SUSTITUIDO por** `docs/superpowers/plans/2026-08-20-sistema-asistencia-paralelo.md` (plan paralelo de 3 terminales, con calendario academico y dashboard). Este documento sigue siendo la referencia de codigo: el plan paralelo apunta a sus tareas por numero para todo lo que no cambio.

**Goal:** Reemplazar la app Power Apps + Excel del Colegio Gabriel García Márquez por una PWA multiusuario offline-first con backend Java/Spring Boot y PostgreSQL.

**Architecture:** Backend Spring Boot 3.4 (Java 21) que expone solo JSON, con PostgreSQL + Flyway y autenticación JWT stateless. Frontend React + Vite compilado a PWA instalable: descarga el horario y los estudiantes del docente a IndexedDB, permite marcar asistencia sin señal y sincroniza con una cola idempotente (UUID generado en el cliente + constraint UNIQUE en la BD). La app Power Apps existente se conserva únicamente como mockup de referencia visual.

**Tech Stack:** Java 21, Spring Boot 3.4, Spring Data JPA, Spring Security (JWT), PostgreSQL 16, Flyway, Apache POI, Maven, JUnit 5 + Testcontainers, React 18 + TypeScript + Vite, vite-plugin-pwa (Workbox), Dexie (IndexedDB), react-router.

**Spec:** `PSU - Toma de asistencia/Documento de Contexto - Proyecto Social Universitario (2).docx`, `PSU - Toma de asistencia/Pruebas.docx` (feedback docentes), `README.md` (pendientes). Mockups de referencia: `Sistema_asistencia_20260527051853/` (Power Apps).

## Global Constraints

- **Java 21**, Spring Boot **3.4.x**, Maven. Nada de Gradle.
- **PostgreSQL 16** en todos los entornos. H2 está prohibido incluso en tests: se usa **Testcontainers** para que el test corra contra el mismo motor que producción.
- **Todo el esquema se crea con migraciones Flyway** (`src/main/resources/db/migration/V__*.sql`). `spring.jpa.hibernate.ddl-auto=validate` siempre. Nunca `update`.
- **Ancho de banda es el recurso escaso.** Bundle inicial objetivo < 200 KB gzip. Prohibido: librerías de componentes (MUI, Ant), icon fonts, Google Fonts remotas, imágenes > 30 KB. CSS a mano.
- **Toda escritura es idempotente.** El cliente genera el `id` (UUID v4); el servidor hace `INSERT ... ON CONFLICT DO UPDATE`. Reintentar una sincronización nunca puede duplicar registros.
- **Zona horaria:** el servidor guarda `TIMESTAMPTZ` en UTC. La conversión a `America/Bogota` es responsabilidad de la capa de presentación. Prohibido el truco de restar 5 horas a mano.
- **Idioma:** identificadores de código en inglés, texto visible al usuario en español. Sin tildes ni `ñ` en nombres de columnas, tablas, campos JSON ni ficheros.
- **Roles:** `ADMIN`, `COORDINADOR`, `DOCENTE`, `ACUDIENTE`. Toda ruta de la API declara su rol.
- **Estados de asistencia:** `P` (presente), `T` (tarde), `F` (falta), `E` (evasión).
- **Commits:** un commit por tarea como mínimo, en español, formato Conventional Commits.

## Dimensionamiento (fijado, no re-discutir)

1200 estudiantes × 6 bloques × 200 días lectivos ≈ **1,44 M filas/año** de asistencia (+240 K de ingreso). A ~250 B/fila con índices: **~420 MB el primer año, ~2,5 GB a 5 años**. Cualquier VPS pequeño o tier gratis de Neon/Supabase lo soporta. No se optimiza por tamaño; se optimiza por ancho de banda del cliente.

## File Structure

```
backend/
  pom.xml
  src/main/java/co/edu/ggm/asistencia/
    AsistenciaApplication.java
    config/         SecurityConfig, JwtFilter, CorsConfig
    user/           User, Role, UserRepository, AuthController, AuthService, JwtService
    student/        Student, StudentRepository, Guardian link
    schedule/       Subject, ScheduleBlock, ScheduleRepository, ScheduleController
    attendance/     Attendance, AttendanceStatus, AttendanceRepository,
                    AttendanceController, SyncService, dto/
    entry/          EntryLog, EntryRepository, EntryController
    report/         ReportController, ExcelReportService
    notify/         NotificationService, MailSender, EvasionJob
  src/main/resources/db/migration/V1__schema.sql ...
  src/test/java/...  (Testcontainers)
frontend/
  vite.config.ts, package.json
  src/
    main.tsx, App.tsx, router.tsx
    api/client.ts          fetch + JWT + reintentos
    db/local.ts            esquema Dexie (outbox, cache)
    sync/engine.ts         cola de salida + descarga delta
    pages/Login, Home, TomarAsistencia, Ingreso, Consultas, Padre
    components/            EstudianteFila, EstadoSelector, BannerOffline
    styles.css
```

---

## Fase 1 — Cimientos del backend

### Task 1: Esqueleto Spring Boot con PostgreSQL real en tests

**Files:**
- Create: `backend/pom.xml`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/AsistenciaApplication.java`
- Create: `backend/src/main/resources/application.yml`
- Create: `docker-compose.yml` (Postgres para desarrollo local)
- Test: `backend/src/test/java/co/edu/ggm/asistencia/AbstractIntegrationTest.java`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/SmokeTest.java`

**Interfaces:**
- Consumes: nada.
- Produces: `AbstractIntegrationTest` — clase base que **todas** las tareas siguientes extienden para obtener un PostgreSQL 16 efimero via Testcontainers, con el contenedor compartido por toda la suite.

- [ ] **Step 1: Crear `backend/pom.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.4.1</version>
    <relativePath/>
  </parent>
  <groupId>co.edu.ggm</groupId>
  <artifactId>asistencia</artifactId>
  <version>0.1.0</version>
  <properties><java.version>21</java.version></properties>
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-data-jpa</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-security</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-validation</artifactId></dependency>
    <dependency><groupId>org.flywaydb</groupId><artifactId>flyway-core</artifactId></dependency>
    <dependency><groupId>org.flywaydb</groupId><artifactId>flyway-database-postgresql</artifactId></dependency>
    <dependency><groupId>org.postgresql</groupId><artifactId>postgresql</artifactId><scope>runtime</scope></dependency>
    <dependency><groupId>org.projectlombok</groupId><artifactId>lombok</artifactId><optional>true</optional></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-test</artifactId><scope>test</scope></dependency>
    <dependency><groupId>org.springframework.security</groupId><artifactId>spring-security-test</artifactId><scope>test</scope></dependency>
    <dependency><groupId>org.testcontainers</groupId><artifactId>postgresql</artifactId><scope>test</scope></dependency>
    <dependency><groupId>org.testcontainers</groupId><artifactId>junit-jupiter</artifactId><scope>test</scope></dependency>
  </dependencies>
  <build><plugins>
    <plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin>
  </plugins></build>
</project>
```

- [ ] **Step 2: Crear la clase principal**

```java
package co.edu.ggm.asistencia;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class AsistenciaApplication {
    public static void main(String[] args) {
        SpringApplication.run(AsistenciaApplication.class, args);
    }
}
```

- [ ] **Step 3: Crear `application.yml`**

```yaml
spring:
  datasource:
    url: ${DB_URL:jdbc:postgresql://localhost:5432/asistencia}
    username: ${DB_USER:asistencia}
    password: ${DB_PASSWORD:asistencia}
  jpa:
    hibernate.ddl-auto: validate
    open-in-view: false
    properties.hibernate.jdbc.time_zone: UTC
  flyway.enabled: true
  jackson.default-property-inclusion: non_null
app:
  jwt:
    secret: ${JWT_SECRET:cambiar-en-produccion-minimo-32-bytes-de-entropia}
    access-ttl-minutes: 60
    refresh-ttl-days: 30
server:
  compression:
    enabled: true
    mime-types: application/json
    min-response-size: 512
```

- [ ] **Step 4: Crear `docker-compose.yml` en la raiz del repo**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: asistencia
      POSTGRES_USER: asistencia
      POSTGRES_PASSWORD: asistencia
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
volumes:
  pgdata:
```

- [ ] **Step 5: Escribir la base de tests con Testcontainers**

Un unico contenedor estatico compartido por la suite: arrancar uno por clase la vuelve inusablemente lenta.

```java
package co.edu.ggm.asistencia;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

@SpringBootTest
public abstract class AbstractIntegrationTest {

    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine");

    static { POSTGRES.start(); }

    @DynamicPropertySource
    static void datasourceProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }
}
```

- [ ] **Step 6: Escribir el test de humo**

```java
package co.edu.ggm.asistencia;

import org.junit.jupiter.api.Test;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Autowired;
import static org.assertj.core.api.Assertions.assertThat;

class SmokeTest extends AbstractIntegrationTest {

    @Autowired DataSource dataSource;

    @Test
    void el_contexto_arranca_contra_postgres_real() throws Exception {
        try (var conn = dataSource.getConnection()) {
            assertThat(conn.getMetaData().getDatabaseProductName()).isEqualTo("PostgreSQL");
        }
    }
}
```

- [ ] **Step 7: Ejecutar el test — debe fallar**

Run: `cd backend && ./mvnw test -Dtest=SmokeTest`
Expected: FAIL. No hay ninguna migracion Flyway todavia y `ddl-auto=validate` no encuentra tablas. Este fallo lo resuelve la Task 2.

- [ ] **Step 8: Commit**

```bash
git add backend docker-compose.yml
git commit -m "chore: esqueleto Spring Boot 3.4 con PostgreSQL y Testcontainers"
```

---

### Task 2: Esquema de base de datos (Flyway) y datos semilla

**Files:**
- Create: `backend/src/main/resources/db/migration/V1__esquema_inicial.sql`
- Create: `backend/src/main/resources/db/migration/V2__datos_semilla.sql`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/SchemaTest.java`

**Interfaces:**
- Consumes: `AbstractIntegrationTest` (Task 1).
- Produces: tablas `users`, `students`, `guardianships`, `subjects`, `schedule_blocks`, `attendance`, `entry_log`. La constraint `attendance_unique_slot` es la que elimina de raiz el bug de duplicados de la app Power Apps.

- [ ] **Step 1: Escribir `V1__esquema_inicial.sql`**

`attendance.id` es un UUID generado por el **cliente**, no por la BD: es lo que hace idempotente el reintento de sincronizacion. La `UNIQUE (student_id, schedule_block_id, class_date)` es el cinturon de seguridad por si el cliente pierde su UUID y reenvia con uno nuevo.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    email         VARCHAR(160) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    full_name     VARCHAR(160) NOT NULL,
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('ADMIN','COORDINADOR','DOCENTE','ACUDIENTE')),
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE students (
    id             BIGSERIAL PRIMARY KEY,
    document_id    VARCHAR(32)  NOT NULL UNIQUE,
    first_name     VARCHAR(60)  NOT NULL,
    middle_name    VARCHAR(60),
    last_name      VARCHAR(60)  NOT NULL,
    second_surname VARCHAR(60),
    grade          VARCHAR(10)  NOT NULL,
    eps            VARCHAR(80),
    address        VARCHAR(160),
    phone          VARCHAR(30),
    active         BOOLEAN      NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_students_grade ON students (grade) WHERE active;

CREATE TABLE guardianships (
    student_id   BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    guardian_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    relationship VARCHAR(40),
    PRIMARY KEY (student_id, guardian_id)
);

CREATE TABLE subjects (
    id   BIGSERIAL PRIMARY KEY,
    name VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE schedule_blocks (
    id          BIGSERIAL PRIMARY KEY,
    grade       VARCHAR(10) NOT NULL,
    weekday     SMALLINT    NOT NULL CHECK (weekday BETWEEN 1 AND 5),
    block_no    SMALLINT    NOT NULL CHECK (block_no BETWEEN 1 AND 8),
    start_time  TIME        NOT NULL,
    end_time    TIME        NOT NULL,
    subject_id  BIGINT      NOT NULL REFERENCES subjects(id),
    teacher_id  BIGINT      NOT NULL REFERENCES users(id),
    UNIQUE (grade, weekday, block_no)
);
CREATE INDEX idx_schedule_teacher ON schedule_blocks (teacher_id, weekday);

CREATE TABLE attendance (
    id                UUID        PRIMARY KEY,
    student_id        BIGINT      NOT NULL REFERENCES students(id),
    schedule_block_id BIGINT      NOT NULL REFERENCES schedule_blocks(id),
    class_date        DATE        NOT NULL,
    status            CHAR(1)     NOT NULL CHECK (status IN ('P','T','F','E')),
    comment           VARCHAR(280),
    recorded_by       BIGINT      NOT NULL REFERENCES users(id),
    recorded_at       TIMESTAMPTZ NOT NULL,
    synced_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT attendance_unique_slot UNIQUE (student_id, schedule_block_id, class_date)
);
CREATE INDEX idx_attendance_student_date ON attendance (student_id, class_date DESC);
CREATE INDEX idx_attendance_date_status  ON attendance (class_date, status);

CREATE TABLE entry_log (
    id          UUID        PRIMARY KEY,
    student_id  BIGINT      NOT NULL REFERENCES students(id),
    entry_date  DATE        NOT NULL,
    scanned_at  TIMESTAMPTZ NOT NULL,
    recorded_by BIGINT      NOT NULL REFERENCES users(id),
    CONSTRAINT entry_unique_day UNIQUE (student_id, entry_date)
);
```

- [ ] **Step 2: Escribir `V2__datos_semilla.sql`**

Password de todos los usuarios semilla: `cambiar123` (hash BCrypt coste 10). Solo desarrollo y tests.

```sql
INSERT INTO users (email, password_hash, full_name, role) VALUES
 ('admin@ggm.edu.co',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Administrador GGM', 'ADMIN'),
 ('coord@ggm.edu.co',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Coordinacion GGM',  'COORDINADOR'),
 ('fpalacios@ggm.edu.co','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Francisco Palacios','DOCENTE');

INSERT INTO subjects (name) VALUES ('Matematicas'), ('Espanol'), ('Informatica');

INSERT INTO students (document_id, first_name, middle_name, last_name, second_surname, grade) VALUES
 ('1010101010','LINDA','ISABELLA','AREVALO','FIGUEROA','601'),
 ('1010101011','JUAN','DIEGO','AVILA','VERGARA','601'),
 ('1010101012','DANIEL','ALEJANDRO','BARRIOS','PARATES','602');

INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time, subject_id, teacher_id)
SELECT '601', 1, 1, '06:30', '07:20', s.id, u.id
FROM subjects s, users u
WHERE s.name = 'Matematicas' AND u.email = 'fpalacios@ggm.edu.co';
```

- [ ] **Step 3: Escribir el test de esquema**

```java
package co.edu.ggm.asistencia;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SchemaTest extends AbstractIntegrationTest {

    @Autowired JdbcTemplate jdbc;

    private static final String INSERT_ASISTENCIA = """
            INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status, recorded_by, recorded_at)
            VALUES (gen_random_uuid(),
                    (SELECT id FROM students WHERE document_id = '1010101010'),
                    (SELECT id FROM schedule_blocks LIMIT 1),
                    DATE '2026-03-02', 'P',
                    (SELECT id FROM users WHERE email = 'fpalacios@ggm.edu.co'), now())
            """;

    @Test
    void la_semilla_carga_los_estudiantes() {
        Integer total = jdbc.queryForObject("SELECT count(*) FROM students", Integer.class);
        assertThat(total).isEqualTo(3);
    }

    @Test
    void no_se_puede_registrar_dos_veces_el_mismo_estudiante_en_el_mismo_bloque_y_dia() {
        jdbc.update(INSERT_ASISTENCIA);
        assertThatThrownBy(() -> jdbc.update(INSERT_ASISTENCIA))
                .hasMessageContaining("attendance_unique_slot");
    }

    @Test
    void el_estado_de_asistencia_solo_admite_P_T_F_E() {
        assertThatThrownBy(() -> jdbc.update(INSERT_ASISTENCIA.replace("'P',", "'X',")))
                .hasMessageContaining("status");
    }
}
```

- [ ] **Step 4: Ejecutar los tests**

Run: `cd backend && ./mvnw test -Dtest='SmokeTest,SchemaTest'`
Expected: PASS los cuatro tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration backend/src/test
git commit -m "feat: esquema inicial con constraint anti-duplicados y datos semilla"
```

---

### Task 3: Autenticacion JWT y los cuatro roles

**Files:**
- Modify: `backend/pom.xml` (anadir jjwt)
- Create: `backend/src/main/java/co/edu/ggm/asistencia/user/Role.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/user/User.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/user/UserRepository.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/config/JwtService.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/config/JwtFilter.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/config/SecurityConfig.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/user/AuthController.java`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/user/AuthTest.java`

**Interfaces:**
- Consumes: tabla `users` (Task 2), `AbstractIntegrationTest` (Task 1).
- Produces:
  - `POST /api/auth/login` body `{"email":String,"password":String}` -> `200 {"token":String,"refreshToken":String,"role":String,"fullName":String,"userId":Long}`; `401` si las credenciales fallan.
  - `POST /api/auth/refresh` body `{"refreshToken":String}` -> mismo cuerpo que login.
  - `JwtService.currentUserId()` -> `Long` del usuario autenticado; lo usan todas las tareas siguientes.
  - Autoridades Spring Security con prefijo `ROLE_` (`ROLE_DOCENTE`, etc.).

El token de acceso dura 60 min y el de refresco 30 dias **a proposito**: un docente puede pasar semanas sin buena senal y no puede quedar bloqueado fuera de la app en pleno salon.

- [ ] **Step 1: Anadir jjwt a `pom.xml`** (dentro de `<dependencies>`)

```xml
<dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-api</artifactId><version>0.12.6</version></dependency>
<dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-impl</artifactId><version>0.12.6</version><scope>runtime</scope></dependency>
<dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-jackson</artifactId><version>0.12.6</version><scope>runtime</scope></dependency>
```

- [ ] **Step 2: Escribir el test de autenticacion (falla)**

```java
package co.edu.ggm.asistencia.user;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class AuthTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void login_correcto_devuelve_token_y_rol() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json("fpalacios@ggm.edu.co", "cambiar123")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.token").isNotEmpty())
           .andExpect(jsonPath("$.role").value("DOCENTE"))
           .andExpect(jsonPath("$.fullName").value("Francisco Palacios"));
    }

    @Test
    void login_con_password_incorrecta_devuelve_401() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json("fpalacios@ggm.edu.co", "nope")))
           .andExpect(status().isUnauthorized());
    }

    @Test
    void una_ruta_protegida_sin_token_devuelve_401() throws Exception {
        mvc.perform(get("/api/schedule/mine")).andExpect(status().isUnauthorized());
    }

    private static String json(String email, String password) {
        return "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}";
    }
}
```

- [ ] **Step 3: Ejecutar — debe fallar**

Run: `cd backend && ./mvnw test -Dtest=AuthTest`
Expected: FAIL con 404 en `/api/auth/login` (el controlador no existe todavia).

- [ ] **Step 4: Escribir `Role` y `User`**

```java
package co.edu.ggm.asistencia.user;

public enum Role { ADMIN, COORDINADOR, DOCENTE, ACUDIENTE }
```

```java
package co.edu.ggm.asistencia.user;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "users")
@Getter
@Setter
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String email;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "full_name")
    private String fullName;

    @Enumerated(EnumType.STRING)
    private Role role;

    private boolean active;
}
```

- [ ] **Step 5: Escribir `UserRepository`**

```java
package co.edu.ggm.asistencia.user;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmailAndActiveTrue(String email);
}
```

- [ ] **Step 6: Escribir `JwtService`**

```java
package co.edu.ggm.asistencia.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;

@Service
public class JwtService {

    private final SecretKey key;
    private final Duration accessTtl;
    private final Duration refreshTtl;

    public JwtService(@Value("${app.jwt.secret}") String secret,
                      @Value("${app.jwt.access-ttl-minutes}") long accessMinutes,
                      @Value("${app.jwt.refresh-ttl-days}") long refreshDays) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.accessTtl = Duration.ofMinutes(accessMinutes);
        this.refreshTtl = Duration.ofDays(refreshDays);
    }

    public String issueAccess(Long userId, String role) {
        return build(userId, role, "access", accessTtl);
    }

    public String issueRefresh(Long userId, String role) {
        return build(userId, role, "refresh", refreshTtl);
    }

    private String build(Long userId, String role, String type, Duration ttl) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim("role", role)
                .claim("typ", type)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttl)))
                .signWith(key)
                .compact();
    }

    /** Lanza JwtException si el token es invalido o expiro. */
    public Claims parse(String token) {
        return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
    }

    /** Id del usuario autenticado en la peticion en curso. */
    public static Long currentUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
```

- [ ] **Step 7: Escribir `JwtFilter`**

```java
package co.edu.ggm.asistencia.config;

import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
public class JwtFilter extends OncePerRequestFilter {

    private final JwtService jwt;

    public JwtFilter(JwtService jwt) { this.jwt = jwt; }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String header = req.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            try {
                var claims = jwt.parse(header.substring(7));
                if ("access".equals(claims.get("typ", String.class))) {
                    var authority = new SimpleGrantedAuthority("ROLE_" + claims.get("role", String.class));
                    var auth = new UsernamePasswordAuthenticationToken(
                            claims.getSubject(), null, List.of(authority));
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            } catch (JwtException ignored) {
                // token invalido: la peticion sigue sin autenticar y SecurityConfig responde 401
            }
        }
        chain.doFilter(req, res);
    }
}
```

- [ ] **Step 8: Escribir `SecurityConfig`**

```java
package co.edu.ggm.asistencia.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;

import java.util.List;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, JwtFilter jwtFilter) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)   // API stateless con JWT, sin cookies de sesion
            .cors(cors -> cors.configurationSource(request -> {
                var config = new CorsConfiguration();
                config.setAllowedOriginPatterns(List.of("http://localhost:5173", "https://*.ggm.edu.co"));
                config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE"));
                config.setAllowedHeaders(List.of("*"));
                return config;
            }))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**", "/actuator/health").permitAll()
                .anyRequest().authenticated())
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
```

- [ ] **Step 9: Escribir `AuthController`**

```java
package co.edu.ggm.asistencia.user;

import co.edu.ggm.asistencia.config.JwtService;
import io.jsonwebtoken.JwtException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;

    public AuthController(UserRepository users, PasswordEncoder encoder, JwtService jwt) {
        this.users = users; this.encoder = encoder; this.jwt = jwt;
    }

    public record LoginRequest(@NotBlank String email, @NotBlank String password) {}
    public record RefreshRequest(@NotBlank String refreshToken) {}
    public record Session(String token, String refreshToken, String role, String fullName, Long userId) {}

    @PostMapping("/login")
    public Session login(@Valid @RequestBody LoginRequest req) {
        User user = users.findByEmailAndActiveTrue(req.email().trim().toLowerCase())
                .filter(u -> encoder.matches(req.password(), u.getPasswordHash()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credenciales invalidas"));
        return sessionFor(user);
    }

    @PostMapping("/refresh")
    public Session refresh(@Valid @RequestBody RefreshRequest req) {
        try {
            var claims = jwt.parse(req.refreshToken());
            if (!"refresh".equals(claims.get("typ", String.class))) throw new JwtException("tipo invalido");
            User user = users.findById(Long.valueOf(claims.getSubject()))
                    .filter(User::isActive)
                    .orElseThrow(() -> new JwtException("usuario inactivo"));
            return sessionFor(user);
        } catch (JwtException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesion expirada");
        }
    }

    private Session sessionFor(User user) {
        String role = user.getRole().name();
        return new Session(jwt.issueAccess(user.getId(), role), jwt.issueRefresh(user.getId(), role),
                role, user.getFullName(), user.getId());
    }
}
```

- [ ] **Step 10: Ejecutar los tests**

Run: `cd backend && ./mvnw test -Dtest=AuthTest`
Expected: PASS los tres. El tercero da 401 porque `/api/schedule/mine` aun no existe pero cae en `anyRequest().authenticated()` — es el comportamiento correcto.

- [ ] **Step 11: Commit**

```bash
git add backend
git commit -m "feat: autenticacion JWT con roles ADMIN, COORDINADOR, DOCENTE y ACUDIENTE"
```

---

## Fase 2 — API de asistencia offline-first

### Task 4: Paquete de arranque del docente (`/api/sync/bootstrap`)

**Files:**
- Create: `backend/src/main/java/co/edu/ggm/asistencia/schedule/Subject.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/schedule/ScheduleBlock.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/schedule/ScheduleRepository.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/student/Student.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/student/StudentRepository.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/sync/BootstrapController.java`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/sync/BootstrapTest.java`

**Interfaces:**
- Consumes: `JwtService.currentUserId()` (Task 3), tablas de la Task 2.
- Produces: `GET /api/sync/bootstrap` (rol DOCENTE, COORDINADOR o ADMIN) ->
  `{"blocks":[{"id":Long,"grade":String,"weekday":int,"blockNo":int,"subject":String,"startTime":"HH:mm"}], "students":[{"id":Long,"documentId":String,"fullName":String,"grade":String}]}`
- Produces: `GET /api/schedule/mine` — alias de conveniencia que devuelve solo `blocks`.

Esta es **la** llamada critica para el ancho de banda: es lo unico que el docente descarga y a partir de ahi trabaja sin senal. Solo devuelve los estudiantes de los grados que ese docente dicta, no los 1200: un docente tipico ve 4-6 cursos, unos 200 estudiantes, ~15 KB de JSON gzip. Se manda `fullName` ya concatenado para no gastar bytes en cuatro campos separados que el cliente solo va a unir.

- [ ] **Step 1: Escribir el test (falla)**

```java
package co.edu.ggm.asistencia.sync;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.config.JwtService;
import co.edu.ggm.asistencia.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class BootstrapTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;

    private String tokenDocente() {
        var u = users.findByEmailAndActiveTrue("fpalacios@ggm.edu.co").orElseThrow();
        return "Bearer " + jwt.issueAccess(u.getId(), "DOCENTE");
    }

    @Test
    void el_docente_recibe_solo_sus_bloques_y_los_estudiantes_de_esos_grados() throws Exception {
        mvc.perform(get("/api/sync/bootstrap").header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.blocks.length()").value(1))
           .andExpect(jsonPath("$.blocks[0].grade").value("601"))
           .andExpect(jsonPath("$.blocks[0].subject").value("Matematicas"))
           // el estudiante de 602 NO debe venir: ese docente no dicta ese grado
           .andExpect(jsonPath("$.students.length()").value(2))
           .andExpect(jsonPath("$.students[0].fullName").value("LINDA ISABELLA AREVALO FIGUEROA"));
    }
}
```

- [ ] **Step 2: Ejecutar — debe fallar**

Run: `cd backend && ./mvnw test -Dtest=BootstrapTest`
Expected: FAIL con 404.

- [ ] **Step 3: Escribir las entidades `Subject` y `ScheduleBlock`**

```java
package co.edu.ggm.asistencia.schedule;

import jakarta.persistence.*;
import lombok.Getter;

@Entity
@Table(name = "subjects")
@Getter
public class Subject {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;
}
```

```java
package co.edu.ggm.asistencia.schedule;

import jakarta.persistence.*;
import lombok.Getter;
import java.time.LocalTime;

@Entity
@Table(name = "schedule_blocks")
@Getter
public class ScheduleBlock {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String grade;
    private short weekday;

    @Column(name = "block_no")
    private short blockNo;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "subject_id")
    private Subject subject;

    @Column(name = "teacher_id")
    private Long teacherId;
}
```

- [ ] **Step 4: Escribir `ScheduleRepository`**

```java
package co.edu.ggm.asistencia.schedule;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ScheduleRepository extends JpaRepository<ScheduleBlock, Long> {
    List<ScheduleBlock> findByTeacherIdOrderByWeekdayAscBlockNoAsc(Long teacherId);
}
```

- [ ] **Step 5: Escribir `Student` y `StudentRepository`**

```java
package co.edu.ggm.asistencia.student;

import jakarta.persistence.*;
import lombok.Getter;

@Entity
@Table(name = "students")
@Getter
public class Student {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "document_id")
    private String documentId;

    @Column(name = "first_name")  private String firstName;
    @Column(name = "middle_name") private String middleName;
    @Column(name = "last_name")   private String lastName;
    @Column(name = "second_surname") private String secondSurname;

    private String grade;
    private String eps;
    private String address;
    private String phone;
    private boolean active;

    /** Nombre completo sin espacios dobles cuando faltan segundo nombre o segundo apellido. */
    public String fullName() {
        return String.join(" ", java.util.stream.Stream.of(firstName, middleName, lastName, secondSurname)
                .filter(s -> s != null && !s.isBlank()).toList());
    }
}
```

```java
package co.edu.ggm.asistencia.student;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Collection;
import java.util.List;

public interface StudentRepository extends JpaRepository<Student, Long> {
    List<Student> findByActiveTrueAndGradeInOrderByLastNameAscFirstNameAsc(Collection<String> grades);
    List<Student> findByActiveTrueAndGradeOrderByLastNameAscFirstNameAsc(String grade);
    java.util.Optional<Student> findByDocumentIdAndActiveTrue(String documentId);
}
```

- [ ] **Step 6: Escribir `BootstrapController`**

```java
package co.edu.ggm.asistencia.sync;

import co.edu.ggm.asistencia.config.JwtService;
import co.edu.ggm.asistencia.schedule.ScheduleBlock;
import co.edu.ggm.asistencia.schedule.ScheduleRepository;
import co.edu.ggm.asistencia.student.Student;
import co.edu.ggm.asistencia.student.StudentRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalTime;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
@PreAuthorize("hasAnyRole('DOCENTE','COORDINADOR','ADMIN')")
public class BootstrapController {

    private final ScheduleRepository schedules;
    private final StudentRepository students;

    public BootstrapController(ScheduleRepository schedules, StudentRepository students) {
        this.schedules = schedules; this.students = students;
    }

    public record BlockDto(Long id, String grade, int weekday, int blockNo, String subject, String startTime) {}
    public record StudentDto(Long id, String documentId, String fullName, String grade) {}
    public record Bootstrap(List<BlockDto> blocks, List<StudentDto> students) {}

    @GetMapping("/sync/bootstrap")
    public Bootstrap bootstrap() {
        List<ScheduleBlock> myBlocks = schedules
                .findByTeacherIdOrderByWeekdayAscBlockNoAsc(JwtService.currentUserId());
        Set<String> grades = myBlocks.stream().map(ScheduleBlock::getGrade).collect(Collectors.toSet());
        List<Student> myStudents = grades.isEmpty()
                ? List.of()
                : students.findByActiveTrueAndGradeInOrderByLastNameAscFirstNameAsc(grades);
        return new Bootstrap(
                myBlocks.stream().map(BootstrapController::toDto).toList(),
                myStudents.stream()
                        .map(s -> new StudentDto(s.getId(), s.getDocumentId(), s.fullName(), s.getGrade()))
                        .toList());
    }

    @GetMapping("/schedule/mine")
    public List<BlockDto> mine() {
        return bootstrap().blocks();
    }

    private static BlockDto toDto(ScheduleBlock b) {
        LocalTime start = b.getStartTime();
        return new BlockDto(b.getId(), b.getGrade(), b.getWeekday(), b.getBlockNo(),
                b.getSubject().getName(), String.format("%02d:%02d", start.getHour(), start.getMinute()));
    }
}
```

- [ ] **Step 7: Ejecutar los tests**

Run: `cd backend && ./mvnw test -Dtest='BootstrapTest,AuthTest'`
Expected: PASS todos. `AuthTest.una_ruta_protegida_sin_token_devuelve_401` ahora golpea un endpoint real y sigue dando 401.

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -m "feat: paquete de arranque con horario y estudiantes del docente"
```

---

### Task 5: Sincronizacion idempotente de asistencia

**Files:**
- Create: `backend/src/main/java/co/edu/ggm/asistencia/attendance/Attendance.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/attendance/AttendanceRepository.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/attendance/SyncService.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/attendance/AttendanceController.java`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/attendance/SyncTest.java`

**Interfaces:**
- Consumes: Task 3 (auth), Task 4 (bloques y estudiantes).
- Produces:
  - `POST /api/attendance/sync` body `{"records":[{"id":UUID,"studentId":Long,"scheduleBlockId":Long,"classDate":"YYYY-MM-DD","status":"P|T|F|E","comment":String?,"recordedAt":"ISO-8601 con offset"}]}` -> `200 {"accepted":int,"rejected":[{"id":UUID,"reason":String}]}`
  - `GET /api/attendance?blockId={Long}&date={YYYY-MM-DD}` -> `[{"id":UUID,"studentId":Long,"status":String,"comment":String}]`, para que el cliente pinte lo ya guardado.

El corazon del offline. Reglas que el test blinda:
1. Reenviar el **mismo lote dos veces no duplica** ni falla: hace upsert por `id`.
2. Un registro con el mismo `(student_id, block, date)` pero **otro** `id` **actualiza** el existente en vez de reventar contra la constraint — es el docente corrigiendo desde otro dispositivo.
3. Un lote parcialmente invalido guarda lo bueno y reporta lo malo: nunca se pierde el trabajo del docente por una fila mala.
4. Cualquier docente puede registrar cualquier bloque (requisito explicito del feedback de Laura: los reemplazos), pero queda grabado en `recorded_by` quien lo hizo.

- [ ] **Step 1: Escribir el test (falla)**

```java
package co.edu.ggm.asistencia.attendance;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.config.JwtService;
import co.edu.ggm.asistencia.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class SyncTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;

    private String token() {
        var u = users.findByEmailAndActiveTrue("fpalacios@ggm.edu.co").orElseThrow();
        return "Bearer " + jwt.issueAccess(u.getId(), "DOCENTE");
    }

    private Long studentId(String doc) {
        return jdbc.queryForObject("SELECT id FROM students WHERE document_id = ?", Long.class, doc);
    }

    private Long blockId() {
        return jdbc.queryForObject("SELECT id FROM schedule_blocks LIMIT 1", Long.class);
    }

    private String lote(String uuid, Long student, String status, String fecha) {
        return """
               {"records":[{"id":"%s","studentId":%d,"scheduleBlockId":%d,
                "classDate":"%s","status":"%s","recordedAt":"%sT11:30:00Z"}]}
               """.formatted(uuid, student, blockId(), fecha, status, fecha);
    }

    private void enviar(String cuerpo, int aceptados) throws Exception {
        mvc.perform(post("/api/attendance/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(aceptados));
    }

    @Test
    void reenviar_el_mismo_lote_no_duplica_registros() throws Exception {
        String cuerpo = lote("11111111-1111-4111-8111-111111111111",
                             studentId("1010101010"), "P", "2026-04-06");
        enviar(cuerpo, 1);
        enviar(cuerpo, 1);   // reintento tras recuperar la senal
        Integer total = jdbc.queryForObject(
                "SELECT count(*) FROM attendance WHERE class_date = DATE '2026-04-06'", Integer.class);
        assertThat(total).isEqualTo(1);
    }

    @Test
    void otro_uuid_para_el_mismo_estudiante_bloque_y_fecha_actualiza_en_vez_de_fallar() throws Exception {
        Long student = studentId("1010101011");
        enviar(lote("22222222-2222-4222-8222-222222222222", student, "F", "2026-04-08"), 1);
        enviar(lote("33333333-3333-4333-8333-333333333333", student, "T", "2026-04-08"), 1);
        String estado = jdbc.queryForObject(
                "SELECT status FROM attendance WHERE student_id = ? AND class_date = DATE '2026-04-08'",
                String.class, student);
        assertThat(estado).isEqualTo("T");
    }

    @Test
    void un_registro_invalido_no_tumba_el_resto_del_lote() throws Exception {
        String cuerpo = """
              {"records":[
                {"id":"44444444-4444-4444-8444-444444444444","studentId":%d,"scheduleBlockId":%d,
                 "classDate":"2026-04-07","status":"P","recordedAt":"2026-04-07T11:30:00Z"},
                {"id":"55555555-5555-4555-8555-555555555555","studentId":999999,"scheduleBlockId":%d,
                 "classDate":"2026-04-07","status":"P","recordedAt":"2026-04-07T11:30:00Z"}]}
              """.formatted(studentId("1010101010"), blockId(), blockId());
        mvc.perform(post("/api/attendance/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(1))
           .andExpect(jsonPath("$.rejected.length()").value(1));
    }
}
```

- [ ] **Step 2: Ejecutar — debe fallar**

Run: `cd backend && ./mvnw test -Dtest=SyncTest`
Expected: FAIL con 404 en `/api/attendance/sync`.

- [ ] **Step 3: Escribir la entidad `Attendance`**

`@Id` sin `@GeneratedValue`: el UUID lo trae el cliente.

```java
package co.edu.ggm.asistencia.attendance;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "attendance")
@Getter
@Setter
public class Attendance {
    @Id
    private UUID id;

    @Column(name = "student_id")        private Long studentId;
    @Column(name = "schedule_block_id") private Long scheduleBlockId;
    @Column(name = "class_date")        private LocalDate classDate;

    private String status;
    private String comment;

    @Column(name = "recorded_by") private Long recordedBy;
    @Column(name = "recorded_at") private Instant recordedAt;
    @Column(name = "synced_at")   private Instant syncedAt;
}
```

- [ ] **Step 4: Escribir `AttendanceRepository` con el upsert**

Un solo `INSERT ... ON CONFLICT` por fila resuelve los dos casos de idempotencia. El conflicto por PK (`id`) cubre el reintento; el conflicto por `attendance_unique_slot` cubre la correccion desde otro dispositivo. PostgreSQL solo permite una clausula `ON CONFLICT` por sentencia, asi que se intenta primero por slot — que es la constraint mas amplia — y el `WHERE` de la PK se resuelve borrando antes cualquier fila con la misma PK y distinto slot (caso imposible en la practica pero barato de blindar).

```java
package co.edu.ggm.asistencia.attendance;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface AttendanceRepository extends JpaRepository<Attendance, UUID> {

    List<Attendance> findByScheduleBlockIdAndClassDate(Long scheduleBlockId, LocalDate classDate);

    List<Attendance> findByStudentIdAndClassDateBetweenOrderByClassDateDesc(
            Long studentId, LocalDate desde, LocalDate hasta);

    /** Actualiza la marca existente de ese estudiante/bloque/fecha. Devuelve 1 si actualizo algo. */
    @Modifying
    @Query(value = """
            UPDATE attendance
               SET status = :status, comment = :comment, recorded_by = :recordedBy,
                   recorded_at = :recordedAt, synced_at = now()
             WHERE student_id = :studentId
               AND schedule_block_id = :blockId
               AND class_date = :classDate
               AND recorded_at <= :recordedAt
            """, nativeQuery = true)
    int updateExisting(@Param("studentId") Long studentId,
                       @Param("blockId") Long blockId,
                       @Param("classDate") LocalDate classDate,
                       @Param("status") String status,
                       @Param("comment") String comment,
                       @Param("recordedBy") Long recordedBy,
                       @Param("recordedAt") Instant recordedAt);

    /** Inserta la marca. DO NOTHING absorbe la carrera entre dos dispositivos sincronizando a la vez. */
    @Modifying
    @Query(value = """
            INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                    status, comment, recorded_by, recorded_at, synced_at)
            VALUES (:id, :studentId, :blockId, :classDate, :status, :comment,
                    :recordedBy, :recordedAt, now())
            ON CONFLICT DO NOTHING
            """, nativeQuery = true)
    int insertIfAbsent(@Param("id") UUID id,
                       @Param("studentId") Long studentId,
                       @Param("blockId") Long blockId,
                       @Param("classDate") LocalDate classDate,
                       @Param("status") String status,
                       @Param("comment") String comment,
                       @Param("recordedBy") Long recordedBy,
                       @Param("recordedAt") Instant recordedAt);
}
```

Dos sentencias y no un solo `ON CONFLICT ... DO UPDATE`, por una razon concreta: la fila puede chocar a la vez contra la clave primaria (`id`) y contra `attendance_unique_slot`, y PostgreSQL solo admite **un** indice arbitro por sentencia; el otro conflicto lanzaria excepcion. `UPDATE` primero, `INSERT ... ON CONFLICT DO NOTHING` si no habia nada: aburrido y correcto en los dos casos.

El `AND recorded_at <= :recordedAt` del `UPDATE` es deliberado: si dos dispositivos sincronizan tarde y en desorden, gana el registro que el docente marco **mas recientemente**, no el que llego ultimo a la red.

- [ ] **Step 5: Escribir `SyncService`**

Cada registro va en su **propia** transaccion (`REQUIRES_NEW`): asi una fila mala no arrastra al lote entero. Es exactamente la regla 3.

```java
package co.edu.ggm.asistencia.attendance;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

@Service
public class SyncService {

    private static final Set<String> ESTADOS = Set.of("P", "T", "F", "E");

    private final AttendanceRepository repo;

    public SyncService(AttendanceRepository repo) { this.repo = repo; }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void save(UUID id, Long studentId, Long blockId, LocalDate classDate,
                     String status, String comment, Long recordedBy, Instant recordedAt) {
        if (!ESTADOS.contains(status)) {
            throw new IllegalArgumentException("Estado invalido: " + status);
        }
        String limpio = (comment == null || comment.isBlank()) ? null : comment.trim();
        int actualizadas = repo.updateExisting(studentId, blockId, classDate, status,
                limpio, recordedBy, recordedAt);
        if (actualizadas == 0) {
            repo.insertIfAbsent(id, studentId, blockId, classDate, status,
                    limpio, recordedBy, recordedAt);
        }
    }
}
```

- [ ] **Step 6: Escribir `AttendanceController`**

```java
package co.edu.ggm.asistencia.attendance;

import co.edu.ggm.asistencia.config.JwtService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/attendance")
@PreAuthorize("hasAnyRole('DOCENTE','COORDINADOR','ADMIN')")
public class AttendanceController {

    private static final Logger log = LoggerFactory.getLogger(AttendanceController.class);

    private final SyncService sync;
    private final AttendanceRepository repo;

    public AttendanceController(SyncService sync, AttendanceRepository repo) {
        this.sync = sync; this.repo = repo;
    }

    public record RecordDto(@NotNull UUID id, @NotNull Long studentId, @NotNull Long scheduleBlockId,
                            @NotNull LocalDate classDate, @NotNull String status,
                            String comment, @NotNull Instant recordedAt) {}
    public record SyncRequest(@NotEmpty List<RecordDto> records) {}
    public record Rejection(UUID id, String reason) {}
    public record SyncResult(int accepted, List<Rejection> rejected) {}
    public record SavedDto(UUID id, Long studentId, String status, String comment) {}

    @PostMapping("/sync")
    public SyncResult sync(@Valid @RequestBody SyncRequest req) {
        Long userId = JwtService.currentUserId();
        List<Rejection> rejected = new ArrayList<>();
        int accepted = 0;
        for (RecordDto r : req.records()) {
            try {
                sync.save(r.id(), r.studentId(), r.scheduleBlockId(), r.classDate(),
                        r.status(), r.comment(), userId, r.recordedAt());
                accepted++;
            } catch (RuntimeException e) {
                log.warn("Registro rechazado {}: {}", r.id(), e.getMessage());
                rejected.add(new Rejection(r.id(), e.getMessage()));
            }
        }
        return new SyncResult(accepted, rejected);
    }

    @GetMapping
    public List<SavedDto> ofBlock(@RequestParam Long blockId,
                                  @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return repo.findByScheduleBlockIdAndClassDate(blockId, date).stream()
                .map(a -> new SavedDto(a.getId(), a.getStudentId(), a.getStatus(), a.getComment()))
                .toList();
    }
}
```

- [ ] **Step 7: Ejecutar los tests**

Run: `cd backend && ./mvnw test -Dtest=SyncTest`
Expected: PASS los tres. Si el tercero falla con `accepted=2`, la FK a `students` no se esta violando en el momento esperado: comprobar que `SyncService.save` esta anotado `REQUIRES_NEW` y que se invoca **a traves del bean** (no como llamada interna, que se salta el proxy de Spring).

- [ ] **Step 8: Ejecutar toda la suite**

Run: `cd backend && ./mvnw test`
Expected: PASS todo.

- [ ] **Step 9: Commit**

```bash
git add backend
git commit -m "feat: sincronizacion idempotente de asistencia con upsert y lote parcial"
```

---

## Fase 3 — PWA offline-first

### Task 6: Esqueleto React + Vite, cliente HTTP y login

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/pages/Login.tsx`
- Create: `frontend/src/styles.css`
- Test: `frontend/src/api/client.test.ts`

**Interfaces:**
- Consumes: `POST /api/auth/login` y `/api/auth/refresh` (Task 3).
- Produces:
  - `api.login(email, password): Promise<Session>`, `api.get<T>(path)`, `api.post<T>(path, body)`.
  - `getSession(): Session | null` y `clearSession()` desde `src/api/client.ts`.
  - El token vive en `localStorage` bajo la clave `ggm.session`. **Decision consciente:** una cookie httpOnly es mas segura frente a XSS, pero necesita renovacion online y aqui el dispositivo puede pasar dias sin red; el riesgo se acota con TTL y con que la app no incrusta HTML de terceros.
  - Ante un `401`, el cliente intenta **una** vez el refresh y reintenta; si tambien falla, limpia la sesion y redirige a `/login`.

Sin librerias de UI ni de estado: React, react-router y CSS a mano. Cada KB cuenta con la conexion del colegio.

- [ ] **Step 1: Crear `frontend/package.json`**

```json
{
  "name": "ggm-asistencia",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "dexie": "^4.0.10",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "fake-indexeddb": "^6.0.0",
    "typescript": "^5.7.2",
    "vite": "^6.0.5",
    "vite-plugin-pwa": "^0.21.1",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Crear `vite.config.ts`** (el plugin PWA se configura en la Task 9)

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
  build: {
    target: 'es2020',
    // Un solo bundle: con conexion mala, menos peticiones gana a menos bytes por peticion.
    rollupOptions: { output: { manualChunks: undefined } },
  },
  test: { environment: 'jsdom', setupFiles: [] },
});
```

- [ ] **Step 3: Crear `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "vitest/globals"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Crear `index.html`**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#3860b2" />
    <title>Asistencia GGM</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Escribir el test del cliente HTTP (falla)**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, getSession, clearSession } from './client';

describe('cliente http', () => {
  beforeEach(() => {
    localStorage.clear();
    clearSession();
  });

  it('guarda la sesion tras un login correcto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ token: 't', refreshToken: 'r', role: 'DOCENTE', fullName: 'Fran', userId: 3 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await api.login('fpalacios@ggm.edu.co', 'cambiar123');

    expect(getSession()?.role).toBe('DOCENTE');
    expect(getSession()?.token).toBe('t');
  });

  it('ante un 401 renueva el token una vez y reintenta la peticion', async () => {
    localStorage.setItem('ggm.session', JSON.stringify(
      { token: 'viejo', refreshToken: 'r', role: 'DOCENTE', fullName: 'Fran', userId: 3 }));

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ token: 'nuevo', refreshToken: 'r2', role: 'DOCENTE', fullName: 'Fran', userId: 3 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await api.get<{ ok: boolean }>('/api/sync/bootstrap');

    expect(data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getSession()?.token).toBe('nuevo');
  });
});
```

- [ ] **Step 6: Ejecutar — debe fallar**

Run: `cd frontend && npm install && npm test`
Expected: FAIL, `./client` no existe.

- [ ] **Step 7: Escribir `src/api/client.ts`**

```ts
export type Session = {
  token: string;
  refreshToken: string;
  role: 'ADMIN' | 'COORDINADOR' | 'DOCENTE' | 'ACUDIENTE';
  fullName: string;
  userId: number;
};

const KEY = 'ggm.session';

export function getSession(): Session | null {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

function setSession(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** Error de red: la peticion no llego. Distinto de un error del servidor. */
export class OfflineError extends Error {}

async function request<T>(path: string, init: RequestInit, retry = true): Promise<T> {
  const session = getSession();
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new OfflineError('Sin conexion');
  }

  if (res.status === 401 && retry && session?.refreshToken) {
    const renewed = await refresh(session.refreshToken);
    if (renewed) return request<T>(path, init, false);
    clearSession();
    throw new Error('Sesion expirada');
  }
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return (await res.json()) as T;
}

async function refresh(refreshToken: string): Promise<boolean> {
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  setSession((await res.json()) as Session);
  return true;
}

export const api = {
  async login(email: string, password: string): Promise<Session> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Correo o contrasena incorrectos');
    const session = (await res.json()) as Session;
    setSession(session);
    return session;
  },
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
};
```

- [ ] **Step 8: Ejecutar el test**

Run: `cd frontend && npm test`
Expected: PASS los dos.

- [ ] **Step 9: Escribir `src/pages/Login.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible iniciar sesion');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card login" onSubmit={submit}>
      <h1>Asistencia GGM</h1>
      <label htmlFor="email">Correo institucional</label>
      <input id="email" type="email" autoComplete="username" required
             value={email} onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor="password">Contrasena</label>
      <input id="password" type="password" autoComplete="current-password" required
             value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p role="alert" className="error">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button>
    </form>
  );
}
```

- [ ] **Step 10: Escribir `src/App.tsx`, `src/main.tsx` y `src/styles.css`**

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import { getSession } from './api/client';

function Protegida({ children }: { children: React.ReactNode }) {
  return getSession() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protegida><p>Inicio (Task 8)</p></Protegida>} />
    </Routes>
  );
}
```

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter><App /></BrowserRouter>
  </StrictMode>,
);
```

```css
:root { --azul: #3860b2; --azul-oscuro: #00126b; --fondo: #f1f4f9; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: var(--fondo); color: #1a1a1a; }
.card { background: #fff; border-radius: 8px; padding: 16px; margin: 16px; }
.login { display: flex; flex-direction: column; gap: 8px; max-width: 420px; }
input, select, button { font: inherit; padding: 12px; border-radius: 6px; border: 1px solid #ccd; }
button { background: var(--azul); color: #fff; border: 0; min-height: 48px; }
button:disabled { opacity: .6; }
.error { color: #b00020; }
```

Tipografia del sistema, no Google Fonts: ahorra ~40 KB y una peticion externa que sin senal falla.

- [ ] **Step 11: Commit**

```bash
git add frontend
git commit -m "feat: esqueleto React con cliente HTTP, refresco de token y login"
```

---

### Task 7: Base local (IndexedDB) y motor de sincronizacion

**Files:**
- Create: `frontend/src/db/local.ts`
- Create: `frontend/src/sync/engine.ts`
- Test: `frontend/src/sync/engine.test.ts`

**Interfaces:**
- Consumes: `api` y `OfflineError` (Task 6), `/api/sync/bootstrap` (Task 4), `/api/attendance/sync` (Task 5).
- Produces:
  - `db` (Dexie) con tablas `blocks`, `students`, `outbox`, `meta`.
  - `markAttendance(record): Promise<void>` — escribe en `outbox` y **nunca** toca la red.
  - `flushOutbox(): Promise<{ sent: number; pending: number }>` — envia el outbox; si esta offline lo deja intacto.
  - `downloadBootstrap(): Promise<void>` — refresca `blocks` y `students`.
  - `pendingCount(): Promise<number>` — lo consume el banner de estado.

Reglas que el test blinda:
1. Marcar asistencia sin red **no lanza error** y deja el registro en el outbox.
2. `flushOutbox` solo borra del outbox lo que el servidor acepto (`accepted`); lo rechazado se marca con `error` y se conserva para que alguien lo revise, nunca se borra en silencio.
3. Estando offline, `flushOutbox` deja el outbox tal cual y no pierde nada.
4. Volver a marcar el mismo estudiante en el mismo bloque y fecha **reemplaza** la entrada del outbox (mismo `id` derivado), no acumula.

El `id` del registro es un UUID v4 aleatorio la primera vez y se **reutiliza** si ya existe una entrada para ese `(studentId, blockId, classDate)`: asi el reintento es idempotente de punta a punta.

- [ ] **Step 1: Escribir `src/db/local.ts`**

```ts
import Dexie, { type Table } from 'dexie';

export type LocalBlock = {
  id: number; grade: string; weekday: number; blockNo: number; subject: string; startTime: string;
};

export type LocalStudent = {
  id: number; documentId: string; fullName: string; grade: string;
};

export type OutboxRecord = {
  key: string;              // `${studentId}:${blockId}:${classDate}` — clave natural, evita duplicados locales
  id: string;               // UUID que viaja al servidor
  studentId: number;
  scheduleBlockId: number;
  classDate: string;        // YYYY-MM-DD
  status: 'P' | 'T' | 'F' | 'E';
  comment?: string;
  recordedAt: string;       // ISO-8601 con offset
  error?: string;           // si el servidor lo rechazo
};

class LocalDb extends Dexie {
  blocks!: Table<LocalBlock, number>;
  students!: Table<LocalStudent, number>;
  outbox!: Table<OutboxRecord, string>;
  meta!: Table<{ key: string; value: string }, string>;

  constructor() {
    super('ggm-asistencia');
    this.version(1).stores({
      blocks: 'id, grade, weekday',
      students: 'id, grade, documentId',
      outbox: 'key, classDate, error',
      meta: 'key',
    });
  }
}

export const db = new LocalDb();
```

- [ ] **Step 2: Escribir el test del motor (falla)**

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/local';
import { markAttendance, flushOutbox, pendingCount } from './engine';

const base = { studentId: 1, scheduleBlockId: 7, classDate: '2026-04-06' } as const;

describe('motor de sincronizacion', () => {
  beforeEach(async () => {
    await db.outbox.clear();
    vi.unstubAllGlobals();
  });

  it('marcar asistencia sin red no falla y deja el registro pendiente', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    await markAttendance({ ...base, status: 'P' });
    expect(await pendingCount()).toBe(1);
  });

  it('remarcar al mismo estudiante reemplaza la entrada en vez de acumular', async () => {
    await markAttendance({ ...base, status: 'P' });
    await markAttendance({ ...base, status: 'T' });
    expect(await pendingCount()).toBe(1);
    const [only] = await db.outbox.toArray();
    expect(only.status).toBe('T');
  });

  it('reutiliza el mismo uuid al corregir el estado', async () => {
    await markAttendance({ ...base, status: 'P' });
    const primero = (await db.outbox.toArray())[0].id;
    await markAttendance({ ...base, status: 'F' });
    expect((await db.outbox.toArray())[0].id).toBe(primero);
  });

  it('flush borra lo aceptado y conserva lo rechazado con su motivo', async () => {
    await markAttendance({ ...base, status: 'P' });
    await markAttendance({ ...base, studentId: 2, status: 'F' });
    const rechazado = (await db.outbox.toArray()).find((r) => r.studentId === 2)!;

    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ accepted: 1, rejected: [{ id: rechazado.id, reason: 'Estudiante inexistente' }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const res = await flushOutbox();

    expect(res.sent).toBe(1);
    const quedan = await db.outbox.toArray();
    expect(quedan).toHaveLength(1);
    expect(quedan[0].studentId).toBe(2);
    expect(quedan[0].error).toBe('Estudiante inexistente');
  });

  it('estando offline el flush no pierde nada', async () => {
    await markAttendance({ ...base, status: 'P' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    const res = await flushOutbox();
    expect(res.sent).toBe(0);
    expect(await pendingCount()).toBe(1);
  });
});
```

- [ ] **Step 3: Ejecutar — debe fallar**

Run: `cd frontend && npm test`
Expected: FAIL, `./engine` no existe.

- [ ] **Step 4: Escribir `src/sync/engine.ts`**

```ts
import { api, OfflineError } from '../api/client';
import { db, type LocalBlock, type LocalStudent, type OutboxRecord } from '../db/local';

type Mark = {
  studentId: number;
  scheduleBlockId: number;
  classDate: string;
  status: OutboxRecord['status'];
  comment?: string;
};

const keyOf = (m: Mark) => `${m.studentId}:${m.scheduleBlockId}:${m.classDate}`;

/** Escritura puramente local. Nunca toca la red: el docente esta en el salon sin senal. */
export async function markAttendance(mark: Mark): Promise<void> {
  const key = keyOf(mark);
  const previo = await db.outbox.get(key);
  await db.outbox.put({
    key,
    id: previo?.id ?? crypto.randomUUID(),
    ...mark,
    recordedAt: new Date().toISOString(),
    error: undefined,
  });
}

export const pendingCount = () => db.outbox.count();

export async function flushOutbox(): Promise<{ sent: number; pending: number }> {
  const records = await db.outbox.toArray();
  if (records.length === 0) return { sent: 0, pending: 0 };

  let result: { accepted: number; rejected: { id: string; reason: string }[] };
  try {
    result = await api.post('/api/attendance/sync', {
      records: records.map(({ key, error, ...r }) => r),
    });
  } catch (e) {
    if (e instanceof OfflineError) return { sent: 0, pending: records.length };
    throw e;
  }

  const rechazados = new Map(result.rejected.map((r) => [r.id, r.reason]));
  await db.transaction('rw', db.outbox, async () => {
    for (const r of records) {
      const motivo = rechazados.get(r.id);
      if (motivo) await db.outbox.update(r.key, { error: motivo });
      else await db.outbox.delete(r.key);
    }
  });

  return { sent: result.accepted, pending: await pendingCount() };
}

export async function downloadBootstrap(): Promise<void> {
  const data = await api.get<{ blocks: LocalBlock[]; students: LocalStudent[] }>('/api/sync/bootstrap');
  await db.transaction('rw', db.blocks, db.students, db.meta, async () => {
    await db.blocks.clear();
    await db.blocks.bulkPut(data.blocks);
    await db.students.clear();
    await db.students.bulkPut(data.students);
    await db.meta.put({ key: 'lastBootstrap', value: new Date().toISOString() });
  });
}

/** Intenta vaciar el outbox cuando el navegador recupera la conexion. */
export function startAutoSync(onChange?: (pending: number) => void) {
  const intentar = async () => {
    const { pending } = await flushOutbox().catch(() => ({ pending: -1 }));
    if (pending >= 0) onChange?.(pending);
  };
  window.addEventListener('online', intentar);
  const timer = window.setInterval(intentar, 60_000);
  void intentar();
  return () => {
    window.removeEventListener('online', intentar);
    window.clearInterval(timer);
  };
}
```

`flushOutbox` manda el outbox **entero** en una sola peticion. Con 40 estudiantes son ~4 KB; agrupar es mucho mas barato que 40 peticiones sobre una red que apenas responde.

- [ ] **Step 5: Ejecutar los tests**

Run: `cd frontend && npm test`
Expected: PASS los cinco del motor mas los dos del cliente.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/db frontend/src/sync
git commit -m "feat: base local IndexedDB y motor de sincronizacion con outbox"
```

---

### Task 8: Pantalla de toma de asistencia

**Files:**
- Create: `frontend/src/pages/Home.tsx`
- Create: `frontend/src/pages/TomarAsistencia.tsx`
- Create: `frontend/src/components/BannerEstado.tsx`
- Modify: `frontend/src/App.tsx` (rutas reales)
- Modify: `frontend/src/styles.css` (estilos de la lista)

**Interfaces:**
- Consumes: `db`, `markAttendance`, `flushOutbox`, `downloadBootstrap`, `startAutoSync` (Task 7).
- Produces: ruta `/asistencia` con selector de curso, selector de bloque, **selector de fecha** y la lista de estudiantes.

Correcciones frente al mockup de Power Apps, todas pedidas por los docentes en `Pruebas.docx`:
- El curso se elige de **los grados del docente**, no de todos (en Power Apps se listaban todos y `ColHorarioDocente` se cargaba sin usarse).
- Hay **selector de fecha** con `<input type="date">` nativo, por defecto hoy, porque los docentes piden registrar dias concretos y ponerse al dia con dias atrasados.
- El estado por defecto es `P` y se cambia con cuatro botones grandes, no con radios diminutos: se usa con el pulgar y de pie.
- `E` (evasion) es un estado de primera clase y se ve distinto.
- Cada estudiante admite un **comentario** ("llego tarde porque...").
- No hay boton "Guardar" que dispare una escritura remota: cada toque guarda local al instante. El boton solo fuerza el envio.

- [ ] **Step 1: Escribir `src/components/BannerEstado.tsx`**

```tsx
type Props = { online: boolean; pendientes: number; onSincronizar: () => void };

export default function BannerEstado({ online, pendientes, onSincronizar }: Props) {
  if (online && pendientes === 0) return null;
  return (
    <div className={online ? 'banner pendiente' : 'banner offline'} role="status">
      {online
        ? `${pendientes} registro(s) sin enviar`
        : 'Sin conexion. La asistencia se guarda en el telefono.'}
      {online && pendientes > 0 && (
        <button type="button" onClick={onSincronizar}>Enviar ahora</button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Escribir `src/pages/TomarAsistencia.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { db, type LocalBlock, type LocalStudent } from '../db/local';
import { flushOutbox, markAttendance, pendingCount, startAutoSync } from '../sync/engine';
import BannerEstado from '../components/BannerEstado';

type Estado = 'P' | 'T' | 'F' | 'E';
const ESTADOS: { valor: Estado; etiqueta: string }[] = [
  { valor: 'P', etiqueta: 'Presente' },
  { valor: 'T', etiqueta: 'Tarde' },
  { valor: 'F', etiqueta: 'Falta' },
  { valor: 'E', etiqueta: 'Evasion' },
];

const hoyISO = () => new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD en hora local

export default function TomarAsistencia() {
  const [blocks, setBlocks] = useState<LocalBlock[]>([]);
  const [students, setStudents] = useState<LocalStudent[]>([]);
  const [grade, setGrade] = useState('');
  const [blockId, setBlockId] = useState<number | null>(null);
  const [fecha, setFecha] = useState(hoyISO());
  const [marcas, setMarcas] = useState<Record<number, Estado>>({});
  const [online, setOnline] = useState(navigator.onLine);
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    void db.blocks.toArray().then(setBlocks);
    void pendingCount().then(setPendientes);
    const detener = startAutoSync(setPendientes);
    const cambio = () => setOnline(navigator.onLine);
    window.addEventListener('online', cambio);
    window.addEventListener('offline', cambio);
    return () => {
      detener();
      window.removeEventListener('online', cambio);
      window.removeEventListener('offline', cambio);
    };
  }, []);

  const grados = useMemo(
    () => [...new Set(blocks.map((b) => b.grade))].sort(),
    [blocks],
  );

  const bloquesDelGrado = useMemo(
    () => blocks.filter((b) => b.grade === grade),
    [blocks, grade],
  );

  useEffect(() => {
    if (!grade) { setStudents([]); return; }
    void db.students.where('grade').equals(grade).toArray()
      .then((lista) => setStudents(lista.sort((a, b) => a.fullName.localeCompare(b.fullName))));
  }, [grade]);

  // Al cambiar de curso, bloque o fecha se recupera lo ya marcado localmente para ese contexto.
  useEffect(() => {
    if (!blockId) { setMarcas({}); return; }
    void db.outbox.where('classDate').equals(fecha).toArray().then((pend) => {
      const previas: Record<number, Estado> = {};
      for (const r of pend) if (r.scheduleBlockId === blockId) previas[r.studentId] = r.status;
      setMarcas(previas);
    });
  }, [blockId, fecha]);

  async function marcar(studentId: number, status: Estado) {
    if (!blockId) return;
    setMarcas((prev) => ({ ...prev, [studentId]: status }));
    await markAttendance({ studentId, scheduleBlockId: blockId, classDate: fecha, status });
    setPendientes(await pendingCount());
  }

  async function comentar(studentId: number, comment: string) {
    if (!blockId) return;
    await markAttendance({
      studentId, scheduleBlockId: blockId, classDate: fecha,
      status: marcas[studentId] ?? 'P', comment,
    });
    setPendientes(await pendingCount());
  }

  async function enviar() {
    const { pending } = await flushOutbox();
    setPendientes(pending);
  }

  return (
    <main className="card">
      <BannerEstado online={online} pendientes={pendientes} onSincronizar={enviar} />

      <div className="filtros">
        <label htmlFor="grado">Curso</label>
        <select id="grado" value={grade} onChange={(e) => { setGrade(e.target.value); setBlockId(null); }}>
          <option value="">Seleccione...</option>
          {grados.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>

        <label htmlFor="bloque">Bloque</label>
        <select id="bloque" value={blockId ?? ''} disabled={!grade}
                onChange={(e) => setBlockId(Number(e.target.value) || null)}>
          <option value="">Seleccione...</option>
          {bloquesDelGrado.map((b) => (
            <option key={b.id} value={b.id}>{b.blockNo}. {b.subject} ({b.startTime})</option>
          ))}
        </select>

        <label htmlFor="fecha">Fecha</label>
        <input id="fecha" type="date" value={fecha} max={hoyISO()}
               onChange={(e) => setFecha(e.target.value)} />
      </div>

      {blockId === null
        ? <p>Elija curso y bloque para tomar la asistencia.</p>
        : (
          <ul className="estudiantes">
            {students.map((s) => (
              <li key={s.id}>
                <div className="nombre">
                  <strong>{s.fullName}</strong>
                  <small>ID {s.documentId}</small>
                </div>
                <div className="estados" role="group" aria-label={`Estado de ${s.fullName}`}>
                  {ESTADOS.map((e) => (
                    <button key={e.valor} type="button"
                            className={`estado ${e.valor} ${(marcas[s.id] ?? 'P') === e.valor ? 'activo' : ''}`}
                            aria-pressed={(marcas[s.id] ?? 'P') === e.valor}
                            title={e.etiqueta}
                            onClick={() => void marcar(s.id, e.valor)}>
                      {e.valor}
                    </button>
                  ))}
                </div>
                {(marcas[s.id] === 'T' || marcas[s.id] === 'F') && (
                  <input className="comentario" type="text" maxLength={280}
                         placeholder="Motivo (opcional)"
                         onBlur={(ev) => void comentar(s.id, ev.target.value)} />
                )}
              </li>
            ))}
          </ul>
        )}

      <button type="button" onClick={() => void enviar()} disabled={pendientes === 0}>
        Enviar asistencia ({pendientes})
      </button>
    </main>
  );
}
```

Ojo con `new Date().toLocaleDateString('en-CA')`: da `YYYY-MM-DD` en la zona del dispositivo. Es la forma corta y correcta de obtener "hoy" en Bogota sin restar horas a mano ni arrastrar una libreria de fechas.

- [ ] **Step 3: Escribir `src/pages/Home.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSession, clearSession } from '../api/client';
import { downloadBootstrap } from '../sync/engine';
import { db } from '../db/local';

export default function Home() {
  const session = getSession()!;
  const [ultima, setUltima] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void db.meta.get('lastBootstrap').then((m) => setUltima(m?.value ?? null));
  }, []);

  async function actualizar() {
    setError('');
    try {
      await downloadBootstrap();
      setUltima(new Date().toISOString());
    } catch {
      setError('No se pudo actualizar. Intente con mejor senal.');
    }
  }

  return (
    <main className="card">
      <h1>Asistencia GGM</h1>
      <p>Bienvenido, {session.fullName}</p>
      <nav className="acciones">
        <Link className="boton" to="/asistencia">Asistencia a clase</Link>
        <Link className="boton" to="/ingreso">Ingreso al colegio</Link>
        {session.role !== 'DOCENTE' && <Link className="boton" to="/consultas">Consultas</Link>}
      </nav>
      <p className="meta">
        Datos descargados: {ultima ? new Date(ultima).toLocaleString('es-CO') : 'nunca'}
      </p>
      {error && <p role="alert" className="error">{error}</p>}
      <button type="button" onClick={() => void actualizar()}>Actualizar datos</button>
      <button type="button" className="secundario"
              onClick={() => { clearSession(); location.href = '/login'; }}>
        Cerrar sesion
      </button>
    </main>
  );
}
```

- [ ] **Step 4: Actualizar `src/App.tsx` con las rutas reales**

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Home from './pages/Home';
import TomarAsistencia from './pages/TomarAsistencia';
import { getSession } from './api/client';

function Protegida({ children }: { children: React.ReactNode }) {
  return getSession() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protegida><Home /></Protegida>} />
      <Route path="/asistencia" element={<Protegida><TomarAsistencia /></Protegida>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 5: Anadir los estilos de la lista a `src/styles.css`**

Botones de 48 px minimo: se usan de pie, con el pulgar y a veces con guantes de laboratorio.

```css
.filtros { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center; }
.acciones { display: flex; flex-direction: column; gap: 12px; margin: 16px 0; }
.boton { display: block; text-align: center; padding: 16px; background: var(--azul);
         color: #fff; border-radius: 6px; text-decoration: none; }
.secundario { background: #667; }
.meta { color: #667; font-size: .9rem; }
.estudiantes { list-style: none; padding: 0; margin: 16px 0; }
.estudiantes li { border-bottom: 1px solid #e3e7ef; padding: 10px 0;
                  display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
.nombre { display: flex; flex-direction: column; }
.nombre small { color: #667; }
.estados { display: flex; gap: 4px; }
.estado { min-width: 48px; min-height: 48px; padding: 0; background: #fff;
          color: var(--azul-oscuro); border: 1px solid #ccd; font-weight: 700; }
.estado.activo { background: var(--azul); color: #fff; border-color: var(--azul); }
.estado.F.activo { background: #b00020; border-color: #b00020; }
.estado.E.activo { background: #b35c00; border-color: #b35c00; }
.estado.T.activo { background: #8a6d00; border-color: #8a6d00; }
.comentario { grid-column: 1 / -1; }
.banner { padding: 10px; border-radius: 6px; margin-bottom: 12px;
          display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.banner.offline { background: #ffe9b8; }
.banner.pendiente { background: #dbe6ff; }
.banner button { min-height: 40px; padding: 6px 12px; }
```

- [ ] **Step 6: Verificar a mano contra el backend**

Run (dos terminales):
```bash
docker compose up -d db && cd backend && ./mvnw spring-boot:run
cd frontend && npm run dev
```
Comprobar en `http://localhost:5173`:
1. Login con `fpalacios@ggm.edu.co` / `cambiar123`.
2. "Actualizar datos" trae el curso 601.
3. Marcar asistencia, luego en DevTools > Network activar **Offline** y seguir marcando: el banner naranja aparece y no hay errores.
4. Volver a online: el contador de pendientes baja a 0 solo.
5. `SELECT * FROM attendance;` en la BD muestra una fila por estudiante, sin duplicados aunque se pulse "Enviar" varias veces.

- [ ] **Step 7: Commit**

```bash
git add frontend
git commit -m "feat: pantalla de toma de asistencia offline con estados P/T/F/E y fecha"
```

---

### Task 9: Convertirla en PWA instalable

**Files:**
- Modify: `frontend/vite.config.ts`
- Create: `frontend/public/icon-192.png`, `frontend/public/icon-512.png`
- Modify: `frontend/index.html`
- Create: `frontend/src/components/BotonInstalar.tsx`
- Modify: `frontend/src/pages/Home.tsx`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `dist/` con manifest y service worker; la app se instala en Android desde "Anadir a pantalla de inicio" y abre sin barra de navegador.

Estrategia de cache deliberada:
- **App shell** (`js`, `css`, `html`, iconos): `precache`. Se descarga una vez y despues arranca a cero peticiones.
- **`/api/**`**: `NetworkOnly`. Nada de cachear respuestas de la API: el estado real vive en IndexedDB, que ya controlamos nosotros. Cachear la API duplicaria la fuente de verdad y traeria datos viejos sin avisar.

- [ ] **Step 1: Configurar `vite-plugin-pwa` en `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Asistencia Colegio Gabriel Garcia Marquez',
        short_name: 'Asistencia GGM',
        description: 'Toma de asistencia sin conexion',
        lang: 'es-CO',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f1f4f9',
        theme_color: '#3860b2',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          { urlPattern: /^\/api\//, handler: 'NetworkOnly' },
        ],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:8080' } },
  build: { target: 'es2020' },
  test: { environment: 'jsdom' },
});
```

- [ ] **Step 2: Crear los iconos**

Generar `frontend/public/icon-192.png` y `icon-512.png` con el escudo del colegio sobre fondo `#3860b2`. Peso maximo 20 KB cada uno (`pngquant` o similar). Reutilizar `Sistema_asistencia_20260527051853/Microsoft.PowerApps/apps/10561740734622616004/N7371a8b5-b7f8-44a8-aecc-9f9479edb953-logoSmallFile` como fuente si tiene resolucion suficiente.

- [ ] **Step 3: Enlazar el manifest en `index.html`**

Anadir dentro de `<head>`:

```html
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" href="/icon-192.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
```

- [ ] **Step 4: Escribir `src/components/BotonInstalar.tsx`**

Android dispara `beforeinstallprompt`; hay que capturarlo para poder ofrecer la instalacion cuando el docente quiera, no cuando el navegador decida.

```tsx
import { useEffect, useState } from 'react';

type PromptEvent = Event & { prompt: () => Promise<void> };

export default function BotonInstalar() {
  const [evento, setEvento] = useState<PromptEvent | null>(null);

  useEffect(() => {
    const capturar = (e: Event) => { e.preventDefault(); setEvento(e as PromptEvent); };
    window.addEventListener('beforeinstallprompt', capturar);
    return () => window.removeEventListener('beforeinstallprompt', capturar);
  }, []);

  if (!evento) return null;
  return (
    <button type="button" onClick={() => { void evento.prompt(); setEvento(null); }}>
      Instalar en el telefono
    </button>
  );
}
```

- [ ] **Step 5: Montar `BotonInstalar` en `Home.tsx`**

Anadir `import BotonInstalar from '../components/BotonInstalar';` y colocar `<BotonInstalar />` justo encima del boton "Cerrar sesion".

- [ ] **Step 6: Verificar la instalacion y el arranque sin red**

Run: `cd frontend && npm run build && npm run preview`
Comprobar:
1. Chrome DevTools > Application > Manifest: sin errores, "Installability: installable".
2. Application > Service Workers: activo.
3. Marcar la casilla **Offline** y **recargar**: la app sigue abriendo y permite tomar asistencia. Si en su lugar sale el dinosaurio, revisar `navigateFallback`.
4. Network > tamano del primer arranque: el bundle JS gzip debe estar por debajo de 200 KB. Si se pasa, `npx vite-bundle-visualizer` y quitar lo que sobre.

- [ ] **Step 7: Commit**

```bash
git add frontend
git commit -m "feat: PWA instalable con app shell precacheada y API sin cache"
```

---

## Fase 4 — Ingreso al colegio por QR

### Task 10: Escaneo del carnet y registro de ingreso

**Files:**
- Create: `backend/src/main/java/co/edu/ggm/asistencia/entry/EntryLog.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/entry/EntryRepository.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/entry/EntryController.java`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/entry/EntryTest.java`
- Create: `frontend/src/pages/Ingreso.tsx`
- Create: `frontend/src/scan/scanner.ts`
- Modify: `frontend/src/App.tsx` (ruta `/ingreso`)
- Modify: `frontend/package.json` (anadir `@zxing/browser`)

**Interfaces:**
- Consumes: auth (Task 3), `students.document_id` (Task 2).
- Produces:
  - `POST /api/entry/sync` body `{"entries":[{"id":UUID,"documentId":String,"scannedAt":"ISO-8601"}]}` -> `{"accepted":int,"rejected":[{"id":UUID,"reason":String}],"names":{"<UUID>":"NOMBRE DEL ESTUDIANTE"}}`
  - `scanOnce(video: HTMLVideoElement): Promise<string>` en `src/scan/scanner.ts`.

El codigo escaneado es el que **ya viene impreso en el carnet** (numero de documento), no uno inventado — requisito explicito del `README`. Por eso `document_id` es la clave de busqueda y no se genera nada.

El escaner usa **`BarcodeDetector` nativo** cuando el navegador lo trae (Chrome en Android: cero KB, sin descarga) y cae a `@zxing/browser` (~90 KB, carga **diferida** con `import()` dinamico) solo en los dispositivos que no lo soportan. Asi la mayoria de los telefonos no pagan el peso.

- [ ] **Step 1: Escribir el test del backend (falla)**

```java
package co.edu.ggm.asistencia.entry;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.config.JwtService;
import co.edu.ggm.asistencia.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class EntryTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;

    private String token() {
        var u = users.findByEmailAndActiveTrue("coord@ggm.edu.co").orElseThrow();
        return "Bearer " + jwt.issueAccess(u.getId(), "COORDINADOR");
    }

    private String lote(String uuid, String documento) {
        return """
               {"entries":[{"id":"%s","documentId":"%s","scannedAt":"2026-05-04T11:05:00Z"}]}
               """.formatted(uuid, documento);
    }

    @Test
    void un_escaneo_valido_registra_el_ingreso_y_devuelve_el_nombre() throws Exception {
        String uuid = "66666666-6666-4666-8666-666666666666";
        mvc.perform(post("/api/entry/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON).content(lote(uuid, "1010101012")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(1))
           .andExpect(jsonPath("$.names." + uuid).value("DANIEL ALEJANDRO BARRIOS PARATES"));
    }

    @Test
    void escanear_dos_veces_al_mismo_estudiante_el_mismo_dia_no_duplica() throws Exception {
        String cuerpo = lote("77777777-7777-4777-8777-777777777777", "1010101011");
        mvc.perform(post("/api/entry/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo)).andExpect(status().isOk());
        mvc.perform(post("/api/entry/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo)).andExpect(status().isOk());
        Integer total = jdbc.queryForObject(
                "SELECT count(*) FROM entry_log WHERE entry_date = DATE '2026-05-04'", Integer.class);
        assertThat(total).isEqualTo(1);
    }

    @Test
    void un_carnet_desconocido_se_rechaza_con_motivo() throws Exception {
        mvc.perform(post("/api/entry/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(lote("88888888-8888-4888-8888-888888888888", "0000000000")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(0))
           .andExpect(jsonPath("$.rejected[0].reason").value("Carnet no registrado"));
    }
}
```

- [ ] **Step 2: Ejecutar — debe fallar**

Run: `cd backend && ./mvnw test -Dtest=EntryTest`
Expected: FAIL con 404.

- [ ] **Step 3: Escribir `EntryLog` y `EntryRepository`**

```java
package co.edu.ggm.asistencia.entry;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "entry_log")
@Getter
@Setter
public class EntryLog {
    @Id private UUID id;
    @Column(name = "student_id")  private Long studentId;
    @Column(name = "entry_date")  private LocalDate entryDate;
    @Column(name = "scanned_at")  private Instant scannedAt;
    @Column(name = "recorded_by") private Long recordedBy;
}
```

```java
package co.edu.ggm.asistencia.entry;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public interface EntryRepository extends JpaRepository<EntryLog, UUID> {

    @Modifying
    @Query(value = """
            INSERT INTO entry_log (id, student_id, entry_date, scanned_at, recorded_by)
            VALUES (:id, :studentId, :entryDate, :scannedAt, :recordedBy)
            ON CONFLICT ON CONSTRAINT entry_unique_day DO NOTHING
            """, nativeQuery = true)
    void upsert(@Param("id") UUID id,
                @Param("studentId") Long studentId,
                @Param("entryDate") LocalDate entryDate,
                @Param("scannedAt") Instant scannedAt,
                @Param("recordedBy") Long recordedBy);
}
```

`DO NOTHING`, no `DO UPDATE`: para la entrada al colegio interesa **la primera** llegada del dia, que es la que determina si el estudiante llego tarde. Reescribirla con un segundo escaneo borraria justo el dato que importa.

- [ ] **Step 4: Escribir `EntryController`**

```java
package co.edu.ggm.asistencia.entry;

import co.edu.ggm.asistencia.config.JwtService;
import co.edu.ggm.asistencia.student.StudentRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/entry")
@PreAuthorize("hasAnyRole('DOCENTE','COORDINADOR','ADMIN')")
public class EntryController {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final EntryRepository entries;
    private final StudentRepository students;

    public EntryController(EntryRepository entries, StudentRepository students) {
        this.entries = entries; this.students = students;
    }

    public record EntryDto(@NotNull UUID id, @NotNull String documentId, @NotNull Instant scannedAt) {}
    public record EntryRequest(@NotEmpty List<EntryDto> entries) {}
    public record Rejection(UUID id, String reason) {}
    public record EntryResult(int accepted, List<Rejection> rejected, Map<String, String> names) {}

    @PostMapping("/sync")
    public EntryResult sync(@Valid @RequestBody EntryRequest req) {
        Long userId = JwtService.currentUserId();
        List<Rejection> rejected = new ArrayList<>();
        Map<String, String> names = new LinkedHashMap<>();
        int accepted = 0;

        for (EntryDto e : req.entries()) {
            var student = students.findByDocumentIdAndActiveTrue(e.documentId().trim());
            if (student.isEmpty()) {
                rejected.add(new Rejection(e.id(), "Carnet no registrado"));
                continue;
            }
            // La fecha del ingreso es el dia calendario en Bogota, no en UTC:
            // un escaneo de las 18:30 hora local caeria al dia siguiente si se usara UTC.
            LocalDate fecha = e.scannedAt().atZone(BOGOTA).toLocalDate();
            entries.upsert(e.id(), student.get().getId(), fecha, e.scannedAt(), userId);
            names.put(e.id().toString(), student.get().fullName());
            accepted++;
        }
        return new EntryResult(accepted, rejected, names);
    }
}
```

- [ ] **Step 5: Ejecutar los tests del backend**

Run: `cd backend && ./mvnw test -Dtest=EntryTest`
Expected: PASS los tres.

- [ ] **Step 6: Anadir `@zxing/browser` al `package.json`**

```bash
cd frontend && npm install @zxing/browser@^0.1.5
```

- [ ] **Step 7: Escribir `src/scan/scanner.ts`**

```ts
type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
  }
}

const FORMATOS = ['qr_code', 'code_128', 'code_39', 'ean_13'];

/** Escanea hasta encontrar un codigo. Devuelve el texto crudo del carnet. */
export async function scanOnce(video: HTMLVideoElement, signal: AbortSignal): Promise<string> {
  if (window.BarcodeDetector) return scanNativo(video, signal);
  const { BrowserMultiFormatReader } = await import('@zxing/browser');   // solo si hace falta
  const reader = new BrowserMultiFormatReader();
  const result = await reader.decodeOnceFromVideoElement(video);
  return result.getText();
}

async function scanNativo(video: HTMLVideoElement, signal: AbortSignal): Promise<string> {
  const detector = new window.BarcodeDetector!({ formats: FORMATOS });
  while (!signal.aborted) {
    const [hit] = await detector.detect(video);
    if (hit) return hit.rawValue;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Escaneo cancelado');
}

export async function abrirCamara(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}
```

- [ ] **Step 8: Ampliar la base local con la cola de ingresos**

Modificar `src/db/local.ts`: subir a `version(2)` sin borrar la version 1 (Dexie migra solo).

```ts
export type OutboxEntry = {
  id: string;          // UUID, tambien clave primaria local
  documentId: string;
  scannedAt: string;
  name?: string;       // se rellena cuando el servidor confirma
  error?: string;
};
```

Anadir el campo `entryOutbox!: Table<OutboxEntry, string>;` a la clase y, tras el bloque `this.version(1)...`:

```ts
this.version(2).stores({
  blocks: 'id, grade, weekday',
  students: 'id, grade, documentId',
  outbox: 'key, classDate, error',
  entryOutbox: 'id, scannedAt, error',
  meta: 'key',
});
```

- [ ] **Step 9: Escribir `src/pages/Ingreso.tsx`**

Resuelve el nombre **desde la base local** al instante (sin red) y encola el envio. En el mockup de Power Apps esta pantalla mostraba `User().Image`, la foto del profesor: aqui se muestra el nombre del estudiante escaneado, que es lo util.

```tsx
import { useEffect, useRef, useState } from 'react';
import { db } from '../db/local';
import { api, OfflineError } from '../api/client';
import { abrirCamara, scanOnce } from '../scan/scanner';

export default function Ingreso() {
  const video = useRef<HTMLVideoElement>(null);
  const [ultimo, setUltimo] = useState('');
  const [error, setError] = useState('');
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await abrirCamara(video.current!);
        while (!control.signal.aborted) {
          const codigo = await scanOnce(video.current!, control.signal);
          await registrar(codigo);
          await new Promise((r) => setTimeout(r, 1500));   // evita releer el mismo carnet
        }
      } catch (e) {
        if (!control.signal.aborted) setError('No se pudo abrir la camara. Revise los permisos.');
      }
    })();

    return () => {
      control.abort();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function registrar(documentId: string) {
    const estudiante = await db.students.where('documentId').equals(documentId).first();
    setUltimo(estudiante ? estudiante.fullName : `Carnet ${documentId} no reconocido`);
    await db.entryOutbox.put({ id: crypto.randomUUID(), documentId, scannedAt: new Date().toISOString() });
    await enviar();
  }

  async function enviar() {
    const cola = await db.entryOutbox.toArray();
    setPendientes(cola.length);
    if (cola.length === 0) return;
    try {
      const res = await api.post<{ accepted: number; rejected: { id: string; reason: string }[] }>(
        '/api/entry/sync',
        { entries: cola.map(({ name, error, ...e }) => e) },
      );
      const malos = new Map(res.rejected.map((r) => [r.id, r.reason]));
      for (const e of cola) {
        if (malos.has(e.id)) await db.entryOutbox.update(e.id, { error: malos.get(e.id) });
        else await db.entryOutbox.delete(e.id);
      }
    } catch (e) {
      if (!(e instanceof OfflineError)) throw e;   // sin senal: la cola se queda para despues
    }
    setPendientes(await db.entryOutbox.count());
  }

  return (
    <main className="card">
      <h1>Ingreso al colegio</h1>
      <p>Acerque el carnet del estudiante a la camara.</p>
      <video ref={video} className="camara" muted playsInline />
      {ultimo && <p className="ultimo" role="status">{ultimo}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <p className="meta">{pendientes} ingreso(s) sin enviar</p>
    </main>
  );
}
```

Anadir a `styles.css`:

```css
.camara { width: 100%; max-height: 50vh; background: #000; border-radius: 8px; }
.ultimo { font-size: 1.2rem; font-weight: 700; color: var(--azul-oscuro); }
```

- [ ] **Step 10: Anadir la ruta `/ingreso` en `App.tsx`**

```tsx
<Route path="/ingreso" element={<Protegida><Ingreso /></Protegida>} />
```
con `import Ingreso from './pages/Ingreso';`.

- [ ] **Step 11: Probar en un telefono real**

El escaner **no funciona sobre http** salvo en `localhost`: `getUserMedia` exige HTTPS. Para probar en el celular:

```bash
cd frontend && npm run build && npx vite preview --host
```
y servir tras un tunel HTTPS (`npx localtunnel --port 4173`) o instalar un certificado local. Escanear un carnet real y verificar que el numero leido coincide con `students.document_id`. **Si no coincide, el problema son los datos, no el codigo**: ese es el punto del `README` sobre usar los codigos del carnet y no inventarlos.

- [ ] **Step 12: Commit**

```bash
git add backend frontend
git commit -m "feat: registro de ingreso por QR con lector nativo y respaldo zxing"
```

---

## Fase 5 — Consultas e informe en Excel

### Task 11: Reportes de asistencia y descarga .xlsx

**Files:**
- Modify: `backend/pom.xml` (anadir Apache POI)
- Create: `backend/src/main/java/co/edu/ggm/asistencia/report/ReportRepository.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/report/ExcelReportService.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/report/ReportController.java`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/report/ReportTest.java`
- Create: `frontend/src/pages/Consultas.tsx`
- Modify: `frontend/src/App.tsx` (ruta `/consultas`)

**Interfaces:**
- Consumes: `attendance` (Task 5), auth (Task 3).
- Produces:
  - `GET /api/reports/summary?grade=&from=&to=` (COORDINADOR, ADMIN, DOCENTE) -> `[{"studentId":Long,"fullName":String,"grade":String,"present":int,"late":int,"absent":int,"evasion":int}]`
  - `GET /api/reports/excel?grade=&from=&to=` -> binario `.xlsx`, `Content-Disposition: attachment`.
  - `GET /api/reports/pending-today` -> `[{"blockId":Long,"grade":String,"subject":String,"blockNo":int}]` — bloques de hoy del docente **sin** asistencia registrada. Es la "pantalla de confirmacion" que pedia el `README` para que nadie olvide marcar.

El resumen se calcula en **SQL agregado**, no trayendo filas a Java: con 1,4 M de registros al ano, un `COUNT ... FILTER` en Postgres tarda milisegundos y transferir las filas crudas no.

- [ ] **Step 1: Anadir POI a `pom.xml`**

```xml
<dependency><groupId>org.apache.poi</groupId><artifactId>poi-ooxml</artifactId><version>5.3.0</version></dependency>
```

- [ ] **Step 2: Escribir el test (falla)**

```java
package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.config.JwtService;
import co.edu.ggm.asistencia.user.UserRepository;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.io.ByteArrayInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
class ReportTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;

    private String token() {
        var u = users.findByEmailAndActiveTrue("coord@ggm.edu.co").orElseThrow();
        return "Bearer " + jwt.issueAccess(u.getId(), "COORDINADOR");
    }

    @BeforeEach
    void datos() {
        jdbc.update("DELETE FROM attendance");
        jdbc.update("""
            INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status, recorded_by, recorded_at)
            SELECT gen_random_uuid(), s.id, b.id, x.dia, x.estado, u.id, now()
            FROM students s
            CROSS JOIN (SELECT id FROM schedule_blocks LIMIT 1) b
            CROSS JOIN users u
            CROSS JOIN (VALUES (DATE '2026-06-01', 'P'),
                               (DATE '2026-06-02', 'F'),
                               (DATE '2026-06-03', 'E')) AS x(dia, estado)
            WHERE s.document_id = '1010101010' AND u.email = 'coord@ggm.edu.co'
            """);
    }

    @Test
    void el_resumen_cuenta_cada_estado_por_estudiante() throws Exception {
        mvc.perform(get("/api/reports/summary")
                        .param("grade", "601").param("from", "2026-06-01").param("to", "2026-06-30")
                        .header("Authorization", token()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].fullName").value("LINDA ISABELLA AREVALO FIGUEROA"))
           .andExpect(jsonPath("$[0].present").value(1))
           .andExpect(jsonPath("$[0].absent").value(1))
           .andExpect(jsonPath("$[0].evasion").value(1));
    }

    @Test
    void el_excel_se_descarga_y_es_un_libro_valido_con_encabezados() throws Exception {
        byte[] bytes = mvc.perform(get("/api/reports/excel")
                        .param("grade", "601").param("from", "2026-06-01").param("to", "2026-06-30")
                        .header("Authorization", token()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition",
                        org.hamcrest.Matchers.containsString("attachment")))
                .andReturn().getResponse().getContentAsByteArray();

        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            var hoja = wb.getSheetAt(0);
            assertThat(hoja.getRow(0).getCell(0).getStringCellValue()).isEqualTo("Documento");
            assertThat(hoja.getRow(1).getCell(1).getStringCellValue())
                    .isEqualTo("LINDA ISABELLA AREVALO FIGUEROA");
        }
    }
}
```

- [ ] **Step 3: Ejecutar — debe fallar**

Run: `cd backend && ./mvnw test -Dtest=ReportTest`
Expected: FAIL con 404.

- [ ] **Step 4: Escribir `ReportRepository`**

```java
package co.edu.ggm.asistencia.report;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface ReportRepository extends Repository<co.edu.ggm.asistencia.student.Student, Long> {

    interface Row {
        Long getStudentId();
        String getDocumentId();
        String getFullName();
        String getGrade();
        int getPresent();
        int getLate();
        int getAbsent();
        int getEvasion();
    }

    @Query(value = """
            SELECT s.id AS studentId,
                   s.document_id AS documentId,
                   trim(regexp_replace(concat_ws(' ', s.first_name, s.middle_name,
                        s.last_name, s.second_surname), '\s+', ' ', 'g')) AS fullName,
                   s.grade AS grade,
                   count(*) FILTER (WHERE a.status = 'P') AS present,
                   count(*) FILTER (WHERE a.status = 'T') AS late,
                   count(*) FILTER (WHERE a.status = 'F') AS absent,
                   count(*) FILTER (WHERE a.status = 'E') AS evasion
            FROM students s
            LEFT JOIN attendance a ON a.student_id = s.id AND a.class_date BETWEEN :from AND :to
            WHERE s.active AND (:grade IS NULL OR s.grade = :grade)
            GROUP BY s.id, s.document_id, s.first_name, s.middle_name,
                     s.last_name, s.second_surname, s.grade
            ORDER BY s.grade, s.last_name, s.first_name
            """, nativeQuery = true)
    List<Row> summary(@Param("grade") String grade,
                      @Param("from") LocalDate from,
                      @Param("to") LocalDate to);

    interface PendingBlock {
        Long getBlockId();
        String getGrade();
        String getSubject();
        int getBlockNo();
    }

    @Query(value = """
            SELECT b.id AS blockId, b.grade AS grade, sub.name AS subject, b.block_no AS blockNo
            FROM schedule_blocks b
            JOIN subjects sub ON sub.id = b.subject_id
            WHERE b.teacher_id = :teacherId
              AND b.weekday = :weekday
              AND NOT EXISTS (SELECT 1 FROM attendance a
                              WHERE a.schedule_block_id = b.id AND a.class_date = :day)
            ORDER BY b.block_no
            """, nativeQuery = true)
    List<PendingBlock> pendingToday(@Param("teacherId") Long teacherId,
                                    @Param("weekday") int weekday,
                                    @Param("day") LocalDate day);
}
```

- [ ] **Step 5: Escribir `ExcelReportService`**

`SXSSFWorkbook` en vez de `XSSFWorkbook`: escribe en streaming y no carga el libro entero en memoria. Con un ano completo y 1200 estudiantes, `XSSFWorkbook` puede tumbar el proceso.

```java
package co.edu.ggm.asistencia.report;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import java.util.List;

@Service
public class ExcelReportService {

    private static final String[] CABECERAS =
            {"Documento", "Estudiante", "Curso", "Presente", "Tarde", "Falta", "Evasion", "% Asistencia"};

    public byte[] build(List<ReportRepository.Row> filas, LocalDate from, LocalDate to) {
        try (var wb = new SXSSFWorkbook(100); var out = new ByteArrayOutputStream()) {
            var hoja = wb.createSheet("Asistencia " + from + " a " + to);

            Row cabecera = hoja.createRow(0);
            for (int i = 0; i < CABECERAS.length; i++) cabecera.createCell(i).setCellValue(CABECERAS[i]);

            int n = 1;
            for (var f : filas) {
                Row r = hoja.createRow(n++);
                r.createCell(0).setCellValue(f.getDocumentId());
                r.createCell(1).setCellValue(f.getFullName());
                r.createCell(2).setCellValue(f.getGrade());
                r.createCell(3).setCellValue(f.getPresent());
                r.createCell(4).setCellValue(f.getLate());
                r.createCell(5).setCellValue(f.getAbsent());
                r.createCell(6).setCellValue(f.getEvasion());
                int total = f.getPresent() + f.getLate() + f.getAbsent() + f.getEvasion();
                r.createCell(7).setCellValue(total == 0 ? 0
                        : Math.round((f.getPresent() + f.getLate()) * 1000.0 / total) / 10.0);
            }
            wb.write(out);
            wb.dispose();
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
```

- [ ] **Step 6: Escribir `ReportController`**

```java
package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.config.JwtService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

@RestController
@RequestMapping("/api/reports")
@PreAuthorize("hasAnyRole('DOCENTE','COORDINADOR','ADMIN')")
public class ReportController {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final ReportRepository repo;
    private final ExcelReportService excel;

    public ReportController(ReportRepository repo, ExcelReportService excel) {
        this.repo = repo; this.excel = excel;
    }

    @GetMapping("/summary")
    public List<ReportRepository.Row> summary(
            @RequestParam(required = false) String grade,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return repo.summary(grade, from, to);
    }

    @GetMapping("/excel")
    public ResponseEntity<byte[]> excel(
            @RequestParam(required = false) String grade,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        byte[] libro = excel.build(repo.summary(grade, from, to), from, to);
        String nombre = "asistencia_%s_%s_%s.xlsx".formatted(grade == null ? "todos" : grade, from, to);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + nombre + "\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(libro);
    }

    @GetMapping("/pending-today")
    public List<ReportRepository.PendingBlock> pendingToday() {
        LocalDate hoy = LocalDate.now(BOGOTA);
        return repo.pendingToday(JwtService.currentUserId(), hoy.getDayOfWeek().getValue(), hoy);
    }
}
```

- [ ] **Step 7: Ejecutar los tests**

Run: `cd backend && ./mvnw test -Dtest=ReportTest`
Expected: PASS los dos.

- [ ] **Step 8: Escribir `src/pages/Consultas.tsx`**

La descarga del Excel necesita el header `Authorization`, asi que no puede ser un `<a href>` pelado: se pide con `fetch`, se convierte a `blob` y se dispara la descarga con un enlace temporal.

```tsx
import { useState } from 'react';
import { getSession } from '../api/client';
import { api } from '../api/client';

type Fila = {
  studentId: number; documentId: string; fullName: string; grade: string;
  present: number; late: number; absent: number; evasion: number;
};

export default function Consultas() {
  const [grade, setGrade] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filas, setFilas] = useState<Fila[]>([]);
  const [error, setError] = useState('');

  const query = () =>
    `grade=${encodeURIComponent(grade)}&from=${from}&to=${to}`;

  async function buscar() {
    setError('');
    try {
      setFilas(await api.get<Fila[]>(`/api/reports/summary?${query()}`));
    } catch {
      setError('No se pudo consultar. Requiere conexion.');
    }
  }

  async function descargar() {
    setError('');
    try {
      const res = await fetch(`/api/reports/excel?${query()}`, {
        headers: { Authorization: `Bearer ${getSession()!.token}` },
      });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `asistencia_${grade || 'todos'}_${from}_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('No se pudo descargar el informe.');
    }
  }

  return (
    <main className="card">
      <h1>Consultas</h1>
      <div className="filtros">
        <label htmlFor="curso">Curso</label>
        <input id="curso" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="601 (vacio = todos)" />
        <label htmlFor="desde">Desde</label>
        <input id="desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label htmlFor="hasta">Hasta</label>
        <input id="hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <button type="button" onClick={() => void buscar()} disabled={!from || !to}>Consultar</button>
      <button type="button" className="secundario" onClick={() => void descargar()} disabled={!from || !to}>
        Descargar Excel
      </button>
      {error && <p role="alert" className="error">{error}</p>}
      {filas.length > 0 && (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr><th>Estudiante</th><th>Curso</th><th>P</th><th>T</th><th>F</th><th>E</th></tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.studentId}>
                  <td>{f.fullName}</td><td>{f.grade}</td>
                  <td>{f.present}</td><td>{f.late}</td><td>{f.absent}</td><td>{f.evasion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
```

Anadir a `styles.css`:

```css
.tabla-scroll { overflow-x: auto; margin-top: 16px; }
table { border-collapse: collapse; width: 100%; font-size: .95rem; }
th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e3e7ef; white-space: nowrap; }
```

- [ ] **Step 9: Anadir la ruta `/consultas` en `App.tsx`**

```tsx
<Route path="/consultas" element={<Protegida><Consultas /></Protegida>} />
```
con `import Consultas from './pages/Consultas';`.

- [ ] **Step 10: Mostrar los bloques pendientes de hoy en `Home.tsx`**

Es la "pantalla de confirmacion" del `README` y evita el olvido que hoy nadie detecta. Anadir dentro de `Home`:

```tsx
const [pendientesHoy, setPendientesHoy] = useState<{ blockId: number; grade: string; subject: string }[]>([]);

useEffect(() => {
  api.get<{ blockId: number; grade: string; subject: string }[]>('/api/reports/pending-today')
     .then(setPendientesHoy)
     .catch(() => {});   // sin conexion no se puede saber; no es un error que mostrar
}, []);
```

y en el JSX, encima de `<nav>`:

```tsx
{pendientesHoy.length > 0 && (
  <div className="banner pendiente" role="status">
    Hoy falta marcar: {pendientesHoy.map((b) => `${b.grade} ${b.subject}`).join(', ')}
  </div>
)}
```

- [ ] **Step 11: Commit**

```bash
git add backend frontend
git commit -m "feat: consultas de asistencia, informe Excel y aviso de bloques sin marcar"
```

---

## Fase 6 — Notificaciones

### Task 12: Avisos de evasion a coordinacion y de falta a los acudientes

**Files:**
- Modify: `backend/pom.xml` (anadir `spring-boot-starter-mail`)
- Create: `backend/src/main/resources/db/migration/V3__notificaciones.sql`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/notify/Notification.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/notify/NotificationRepository.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/notify/NotificationService.java`
- Create: `backend/src/main/java/co/edu/ggm/asistencia/notify/NotificationJob.java`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/notify/NotificationTest.java`
- Modify: `backend/src/main/resources/application.yml`

**Interfaces:**
- Consumes: `attendance` (Task 5), `guardianships` (Task 2).
- Produces:
  - Tabla `notifications (id, attendance_id, kind, recipient, sent_at, error)` con `UNIQUE (attendance_id, kind)`.
  - `NotificationService.enqueuePending(): int` — busca asistencias sin notificar y crea las filas.
  - `NotificationService.dispatchPending(): int` — envia los correos que faltan y marca `sent_at`.
  - `NotificationJob` con `@Scheduled(cron = "0 */15 * * * *", zone = "America/Bogota")`.

Decision clave: **no se envia nada dentro del `POST /sync`**. Un lote llega cuando el docente recupera senal, a veces horas despues y en bloque; mandar correos ahi haria lento e inestable justo el momento mas fragil. La tabla `notifications` es la cola, y su `UNIQUE (attendance_id, kind)` garantiza que un reenvio del mismo lote no dispare dos correos al mismo padre — el error tipico y el mas caro socialmente.

Un correo a un padre por cada falta de cada bloque seria spam (6 correos en un dia de ausencia). Por eso `kind = 'AUSENCIA_DIA'` se agrupa por estudiante y dia, no por bloque, y `kind = 'EVASION'` si es por registro porque cada evasion es un incidente que coordinacion sigue por separado.

- [ ] **Step 1: Anadir la dependencia de correo a `pom.xml`**

```xml
<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-mail</artifactId></dependency>
```

- [ ] **Step 2: Escribir `V3__notificaciones.sql`**

```sql
CREATE TABLE notifications (
    id            BIGSERIAL PRIMARY KEY,
    attendance_id UUID        NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
    kind          VARCHAR(20) NOT NULL CHECK (kind IN ('EVASION','AUSENCIA_DIA','LLEGADA_TARDE')),
    recipient     VARCHAR(160) NOT NULL,
    subject       VARCHAR(200) NOT NULL,
    body          TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at       TIMESTAMPTZ,
    error         VARCHAR(300),
    CONSTRAINT notification_unique UNIQUE (attendance_id, kind, recipient)
);
CREATE INDEX idx_notifications_pendientes ON notifications (created_at) WHERE sent_at IS NULL;
```

- [ ] **Step 3: Configurar el correo en `application.yml`**

```yaml
spring:
  mail:
    host: ${MAIL_HOST:localhost}
    port: ${MAIL_PORT:1025}
    username: ${MAIL_USER:}
    password: ${MAIL_PASSWORD:}
    properties.mail.smtp.starttls.enable: ${MAIL_TLS:false}
app:
  notify:
    enabled: ${NOTIFY_ENABLED:true}
    from: ${MAIL_FROM:asistencia@ggm.edu.co}
    coordination: ${MAIL_COORDINACION:coord@ggm.edu.co}
```

- [ ] **Step 4: Escribir el test (falla)**

```java
package co.edu.ggm.asistencia.notify;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationTest extends AbstractIntegrationTest {

    @Autowired NotificationService service;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void limpiar() {
        jdbc.update("DELETE FROM notifications");
        jdbc.update("DELETE FROM attendance");
        jdbc.update("DELETE FROM guardianships");
    }

    private void asistencia(String documento, String estado) {
        jdbc.update("""
            INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status, recorded_by, recorded_at)
            VALUES (gen_random_uuid(),
                    (SELECT id FROM students WHERE document_id = ?),
                    (SELECT id FROM schedule_blocks LIMIT 1),
                    DATE '2026-07-13', ?,
                    (SELECT id FROM users WHERE email = 'fpalacios@ggm.edu.co'), now())
            """, documento, estado);
    }

    private void acudiente(String documento, String correo) {
        jdbc.update("""
            INSERT INTO users (email, password_hash, full_name, role) VALUES (?, 'x', 'Acudiente', 'ACUDIENTE')
            ON CONFLICT (email) DO NOTHING
            """, correo);
        jdbc.update("""
            INSERT INTO guardianships (student_id, guardian_id, relationship)
            VALUES ((SELECT id FROM students WHERE document_id = ?),
                    (SELECT id FROM users WHERE email = ?), 'Madre')
            """, documento, correo);
    }

    @Test
    void una_evasion_encola_un_aviso_a_coordinacion() {
        asistencia("1010101010", "E");
        assertThat(service.enqueuePending()).isEqualTo(1);
        String destino = jdbc.queryForObject(
                "SELECT recipient FROM notifications WHERE kind = 'EVASION'", String.class);
        assertThat(destino).isEqualTo("coord@ggm.edu.co");
    }

    @Test
    void una_falta_encola_un_aviso_al_acudiente() {
        acudiente("1010101011", "mama@correo.com");
        asistencia("1010101011", "F");
        service.enqueuePending();
        String destino = jdbc.queryForObject(
                "SELECT recipient FROM notifications WHERE kind = 'AUSENCIA_DIA'", String.class);
        assertThat(destino).isEqualTo("mama@correo.com");
    }

    @Test
    void encolar_dos_veces_no_genera_avisos_repetidos() {
        acudiente("1010101011", "mama@correo.com");
        asistencia("1010101011", "F");
        service.enqueuePending();
        service.enqueuePending();
        Integer total = jdbc.queryForObject("SELECT count(*) FROM notifications", Integer.class);
        assertThat(total).isEqualTo(1);
    }

    @Test
    void una_falta_sin_acudiente_registrado_no_encola_nada_y_no_revienta() {
        asistencia("1010101010", "F");
        service.enqueuePending();
        Integer total = jdbc.queryForObject(
                "SELECT count(*) FROM notifications WHERE kind = 'AUSENCIA_DIA'", Integer.class);
        assertThat(total).isZero();
    }
}
```

- [ ] **Step 5: Ejecutar — debe fallar**

Run: `cd backend && ./mvnw test -Dtest=NotificationTest`
Expected: FAIL, `NotificationService` no existe.

- [ ] **Step 6: Escribir `Notification` y `NotificationRepository`**

```java
package co.edu.ggm.asistencia.notify;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "notifications")
@Getter
@Setter
public class Notification {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "attendance_id") private UUID attendanceId;
    private String kind;
    private String recipient;
    private String subject;
    private String body;
    @Column(name = "sent_at") private Instant sentAt;
    private String error;
}
```

```java
package co.edu.ggm.asistencia.notify;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findTop200BySentAtIsNullAndErrorIsNullOrderByIdAsc();

    /**
     * Encola avisos de evasion a coordinacion para toda asistencia 'E' que aun no lo tenga.
     * ON CONFLICT DO NOTHING mas la constraint notification_unique = nunca dos correos por lo mismo.
     */
    @Modifying
    @Query(value = """
            INSERT INTO notifications (attendance_id, kind, recipient, subject, body)
            SELECT a.id, 'EVASION', :coordination,
                   'Evasion de clase: ' || st.first_name || ' ' || st.last_name,
                   'El estudiante ' || st.first_name || ' ' || st.last_name ||
                   ' (' || st.grade || ') fue marcado como evadiendo clase el ' ||
                   to_char(a.class_date, 'DD/MM/YYYY') || ' por ' || u.full_name || '.'
            FROM attendance a
            JOIN students st ON st.id = a.student_id
            JOIN users u ON u.id = a.recorded_by
            WHERE a.status = 'E'
            ON CONFLICT ON CONSTRAINT notification_unique DO NOTHING
            """, nativeQuery = true)
    int enqueueEvasion(@Param("coordination") String coordination);

    /**
     * Un solo aviso por estudiante y dia (no uno por bloque), anclado a la asistencia
     * de menor id de ese dia para que la constraint lo deduplique.
     */
    @Modifying
    @Query(value = """
            INSERT INTO notifications (attendance_id, kind, recipient, subject, body)
            SELECT DISTINCT ON (a.student_id, a.class_date, g.guardian_id)
                   a.id, 'AUSENCIA_DIA', gu.email,
                   'Inasistencia de ' || st.first_name || ' ' || st.last_name,
                   'Le informamos que ' || st.first_name || ' ' || st.last_name ||
                   ' no asistio a clase el ' || to_char(a.class_date, 'DD/MM/YYYY') ||
                   '. Colegio Gabriel Garcia Marquez.'
            FROM attendance a
            JOIN students st ON st.id = a.student_id
            JOIN guardianships g ON g.student_id = a.student_id
            JOIN users gu ON gu.id = g.guardian_id AND gu.active
            WHERE a.status = 'F'
            ORDER BY a.student_id, a.class_date, g.guardian_id, a.id
            ON CONFLICT ON CONSTRAINT notification_unique DO NOTHING
            """, nativeQuery = true)
    int enqueueAusencias();
}
```

- [ ] **Step 7: Escribir `NotificationService`**

```java
package co.edu.ggm.asistencia.notify;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository repo;
    private final JavaMailSender mailer;
    private final String coordination;
    private final String from;
    private final boolean enabled;

    public NotificationService(NotificationRepository repo, JavaMailSender mailer,
                               @Value("${app.notify.coordination}") String coordination,
                               @Value("${app.notify.from}") String from,
                               @Value("${app.notify.enabled}") boolean enabled) {
        this.repo = repo; this.mailer = mailer;
        this.coordination = coordination; this.from = from; this.enabled = enabled;
    }

    @Transactional
    public int enqueuePending() {
        return repo.enqueueEvasion(coordination) + repo.enqueueAusencias();
    }

    @Transactional
    public int dispatchPending() {
        if (!enabled) return 0;
        int enviados = 0;
        for (Notification n : repo.findTop200BySentAtIsNullAndErrorIsNullOrderByIdAsc()) {
            try {
                var msg = new SimpleMailMessage();
                msg.setFrom(from);
                msg.setTo(n.getRecipient());
                msg.setSubject(n.getSubject());
                msg.setText(n.getBody());
                mailer.send(msg);
                n.setSentAt(Instant.now());
                enviados++;
            } catch (MailException e) {
                // Se guarda el motivo y se deja de reintentar: un correo mal escrito
                // reintentado en bucle bloquea la cola entera.
                String motivo = String.valueOf(e.getMessage());
                log.warn("Fallo el envio de la notificacion {}: {}", n.getId(), motivo);
                n.setError(motivo.substring(0, Math.min(300, motivo.length())));
            }
            repo.save(n);
        }
        return enviados;
    }
}
```

- [ ] **Step 8: Escribir `NotificationJob` y activar el planificador**

```java
package co.edu.ggm.asistencia.notify;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class NotificationJob {

    private static final Logger log = LoggerFactory.getLogger(NotificationJob.class);

    private final NotificationService service;

    public NotificationJob(NotificationService service) { this.service = service; }

    @Scheduled(cron = "0 */15 * * * *", zone = "America/Bogota")
    public void ejecutar() {
        int encolados = service.enqueuePending();
        int enviados = service.dispatchPending();
        if (encolados + enviados > 0) {
            log.info("Notificaciones: {} encoladas, {} enviadas", encolados, enviados);
        }
    }
}
```

Anadir `@EnableScheduling` sobre `AsistenciaApplication` (el metodo `main` no cambia):

```java
@SpringBootApplication
@org.springframework.scheduling.annotation.EnableScheduling
public class AsistenciaApplication {
    public static void main(String[] args) {
        SpringApplication.run(AsistenciaApplication.class, args);
    }
}
```

- [ ] **Step 9: Ejecutar los tests**

Run: `cd backend && ./mvnw test -Dtest=NotificationTest`
Expected: PASS los cuatro. Los tests solo ejercitan `enqueuePending`, que no toca SMTP; `dispatchPending` se valida a mano en el Step 10.

- [ ] **Step 10: Probar el envio real contra un SMTP falso**

```bash
docker run --rm -p 1025:1025 -p 8025:8025 mailhog/mailhog
```
Arrancar el backend, marcar una evasion desde la app y abrir `http://localhost:8025`: el correo a coordinacion debe aparecer en el siguiente ciclo del job.

- [ ] **Step 11: Commit**

```bash
git add backend
git commit -m "feat: cola de notificaciones de evasion e inasistencia con envio periodico"
```

---

## Fase 7 — Portal del acudiente

### Task 13: Consulta de asistencia para padres de familia

**Files:**
- Create: `backend/src/main/java/co/edu/ggm/asistencia/student/GuardianController.java`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/student/GuardianTest.java`
- Create: `frontend/src/pages/Padre.tsx`
- Modify: `frontend/src/App.tsx` (enrutado por rol)
- Modify: `frontend/src/pages/Home.tsx` (redirigir al acudiente)

**Interfaces:**
- Consumes: `guardianships` (Task 2), `attendance` (Task 5).
- Produces: `GET /api/guardian/children` (rol ACUDIENTE) ->
  `[{"studentId":Long,"fullName":String,"grade":String,"recent":[{"classDate":"YYYY-MM-DD","subject":String,"status":String,"comment":String}]}]` con los ultimos 30 dias.

El unico requisito de seguridad no negociable de esta tarea: **un acudiente solo puede ver a sus propios hijos**. La consulta parte de `guardianships` filtrando por el usuario del token; no acepta ningun `studentId` por parametro, porque un parametro es una invitacion a que alguien lo cambie a mano.

- [ ] **Step 1: Escribir el test (falla)**

```java
package co.edu.ggm.asistencia.student;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.config.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class GuardianTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;

    private Long acudienteId;

    @BeforeEach
    void datos() {
        jdbc.update("DELETE FROM guardianships");
        jdbc.update("""
            INSERT INTO users (email, password_hash, full_name, role)
            VALUES ('papa@correo.com', 'x', 'Papa de Juan', 'ACUDIENTE')
            ON CONFLICT (email) DO NOTHING
            """);
        acudienteId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = 'papa@correo.com'", Long.class);
        jdbc.update("""
            INSERT INTO guardianships (student_id, guardian_id, relationship)
            VALUES ((SELECT id FROM students WHERE document_id = '1010101011'), ?, 'Padre')
            """, acudienteId);
    }

    @Test
    void el_acudiente_ve_solo_a_su_hijo() throws Exception {
        mvc.perform(get("/api/guardian/children")
                        .header("Authorization", "Bearer " + jwt.issueAccess(acudienteId, "ACUDIENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.length()").value(1))
           .andExpect(jsonPath("$[0].fullName").value("JUAN DIEGO AVILA VERGARA"));
    }

    @Test
    void un_docente_no_puede_usar_el_portal_de_acudientes() throws Exception {
        mvc.perform(get("/api/guardian/children")
                        .header("Authorization", "Bearer " + jwt.issueAccess(1L, "DOCENTE")))
           .andExpect(status().isForbidden());
    }
}
```

- [ ] **Step 2: Ejecutar — debe fallar**

Run: `cd backend && ./mvnw test -Dtest=GuardianTest`
Expected: FAIL con 404.

- [ ] **Step 3: Ampliar `StudentRepository` con la consulta de hijos**

Anadir a la interfaz creada en la Task 4:

```java
    interface ChildRow {
        Long getStudentId();
        String getFullName();
        String getGrade();
    }

    @org.springframework.data.jpa.repository.Query(value = """
            SELECT s.id AS studentId,
                   trim(regexp_replace(concat_ws(' ', s.first_name, s.middle_name,
                        s.last_name, s.second_surname), '\s+', ' ', 'g')) AS fullName,
                   s.grade AS grade
            FROM students s
            JOIN guardianships g ON g.student_id = s.id
            WHERE g.guardian_id = :guardianId AND s.active
            ORDER BY s.first_name
            """, nativeQuery = true)
    java.util.List<ChildRow> findChildren(
            @org.springframework.data.repository.query.Param("guardianId") Long guardianId);
```

- [ ] **Step 4: Escribir `GuardianController`**

```java
package co.edu.ggm.asistencia.student;

import co.edu.ggm.asistencia.attendance.AttendanceRepository;
import co.edu.ggm.asistencia.config.JwtService;
import co.edu.ggm.asistencia.schedule.ScheduleRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/guardian")
@PreAuthorize("hasRole('ACUDIENTE')")
public class GuardianController {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final StudentRepository students;
    private final AttendanceRepository attendance;
    private final ScheduleRepository schedules;

    public GuardianController(StudentRepository students, AttendanceRepository attendance,
                              ScheduleRepository schedules) {
        this.students = students; this.attendance = attendance; this.schedules = schedules;
    }

    public record Mark(LocalDate classDate, String subject, String status, String comment) {}
    public record Child(Long studentId, String fullName, String grade, List<Mark> recent) {}

    @GetMapping("/children")
    public List<Child> children() {
        LocalDate hasta = LocalDate.now(BOGOTA);
        LocalDate desde = hasta.minusDays(30);

        Map<Long, String> materias = schedules.findAll().stream()
                .collect(Collectors.toMap(b -> b.getId(), b -> b.getSubject().getName(),
                        (a, b) -> a));

        return students.findChildren(JwtService.currentUserId()).stream()
                .map(c -> new Child(c.getStudentId(), c.getFullName(), c.getGrade(),
                        attendance.findByStudentIdAndClassDateBetweenOrderByClassDateDesc(
                                        c.getStudentId(), desde, hasta).stream()
                                .map(a -> new Mark(a.getClassDate(),
                                        materias.getOrDefault(a.getScheduleBlockId(), "Clase"),
                                        a.getStatus(), a.getComment()))
                                .toList()))
                .toList();
    }
}
```

`schedules.findAll()` es aceptable aqui: el horario del colegio son unos cientos de filas y se consulta una vez por peticion. Si el numero de bloques creciera un orden de magnitud, cambiarlo por un `JOIN` en la consulta de asistencia.

- [ ] **Step 5: Ejecutar los tests**

Run: `cd backend && ./mvnw test -Dtest=GuardianTest`
Expected: PASS los dos. El 403 del segundo lo produce `@PreAuthorize` gracias a `@EnableMethodSecurity` (Task 3).

- [ ] **Step 6: Escribir `src/pages/Padre.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { api, clearSession, getSession } from '../api/client';

type Mark = { classDate: string; subject: string; status: string; comment?: string };
type Child = { studentId: number; fullName: string; grade: string; recent: Mark[] };

const ETIQUETA: Record<string, string> = {
  P: 'Presente', T: 'Llego tarde', F: 'No asistio', E: 'Evadio clase',
};

export default function Padre() {
  const [hijos, setHijos] = useState<Child[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Child[]>('/api/guardian/children')
       .then(setHijos)
       .catch(() => setError('No se pudo consultar. Intente con conexion a internet.'));
  }, []);

  return (
    <main className="card">
      <h1>Asistencia de mis hijos</h1>
      <p>{getSession()!.fullName}</p>
      {error && <p role="alert" className="error">{error}</p>}
      {hijos.map((h) => {
        const faltas = h.recent.filter((m) => m.status !== 'P').length;
        return (
          <section key={h.studentId}>
            <h2>{h.fullName} <small>({h.grade})</small></h2>
            <p className="meta">{faltas} novedad(es) en los ultimos 30 dias</p>
            <ul className="novedades">
              {h.recent.filter((m) => m.status !== 'P').map((m, i) => (
                <li key={i}>
                  <strong>{new Date(`${m.classDate}T00:00`).toLocaleDateString('es-CO')}</strong>
                  {' '}{m.subject}: {ETIQUETA[m.status] ?? m.status}
                  {m.comment && <em> — {m.comment}</em>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <button type="button" className="secundario"
              onClick={() => { clearSession(); location.href = '/login'; }}>
        Cerrar sesion
      </button>
    </main>
  );
}
```

`new Date(\`${m.classDate}T00:00\`)` y no `new Date(m.classDate)`: la segunda forma interpreta la cadena como UTC y en Bogota muestra el dia anterior. Es el bug de fechas mas comun y aqui le mostraria al padre un dia equivocado.

Anadir a `styles.css`:

```css
.novedades { list-style: none; padding: 0; }
.novedades li { padding: 8px 0; border-bottom: 1px solid #e3e7ef; }
.novedades em { color: #667; }
```

- [ ] **Step 7: Enrutar al acudiente a su portal en `App.tsx`**

Un acudiente que abra `/` no debe ver el menu del docente.

```tsx
import Padre from './pages/Padre';

function Inicio() {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  return session.role === 'ACUDIENTE' ? <Padre /> : <Home />;
}
```
y sustituir la ruta `/` por `<Route path="/" element={<Protegida><Inicio /></Protegida>} />`.

- [ ] **Step 8: Commit**

```bash
git add backend frontend
git commit -m "feat: portal del acudiente con la asistencia de sus hijos"
```

---

## Fase 8 — Datos reales y despliegue

### Task 14: Carga del listado real y puesta en produccion

**Files:**
- Create: `backend/src/main/java/co/edu/ggm/asistencia/admin/ImportController.java`
- Test: `backend/src/test/java/co/edu/ggm/asistencia/admin/ImportTest.java`
- Create: `Dockerfile`
- Modify: `backend/src/main/resources/application.yml` (perfil de produccion)
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `POST /api/admin/import/students` (rol ADMIN), `multipart/form-data` con un CSV `document_id,first_name,middle_name,last_name,second_surname,grade` -> `{"imported":int,"errors":[String]}`.

CSV y no `.xlsx` para la importacion: el archivo `Toma de asistencia.xlsx` se exporta a CSV en dos clics y evita meter la lectura de Excel donde no aporta. POI ya esta en el proyecto para *generar* informes, que es donde si hace falta.

- [ ] **Step 1: Escribir el test (falla)**

```java
package co.edu.ggm.asistencia.admin;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.config.JwtService;
import co.edu.ggm.asistencia.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class ImportTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;

    private String tokenAdmin() {
        var u = users.findByEmailAndActiveTrue("admin@ggm.edu.co").orElseThrow();
        return "Bearer " + jwt.issueAccess(u.getId(), "ADMIN");
    }

    private MockMultipartFile csv(String contenido) {
        return new MockMultipartFile("file", "estudiantes.csv", "text/csv",
                contenido.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void importa_estudiantes_nuevos_y_actualiza_los_existentes_sin_duplicar() throws Exception {
        String contenido = """
                document_id,first_name,middle_name,last_name,second_surname,grade
                2020202020,MARIA,JOSE,GOMEZ,PEREZ,701
                1010101010,LINDA,ISABELLA,AREVALO,FIGUEROA,602
                """;
        mvc.perform(multipart("/api/admin/import/students").file(csv(contenido))
                        .header("Authorization", tokenAdmin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.imported").value(2))
           .andExpect(jsonPath("$.errors.length()").value(0));

        // el estudiante ya existente cambio de curso, no se duplico
        mvc.perform(multipart("/api/admin/import/students").file(csv(contenido))
                        .header("Authorization", tokenAdmin()))
           .andExpect(jsonPath("$.imported").value(2));
    }

    @Test
    void una_linea_mal_formada_se_reporta_sin_abortar_la_importacion() throws Exception {
        String contenido = """
                document_id,first_name,middle_name,last_name,second_surname,grade
                3030303030,PEDRO,,RUIZ,,801
                esto,no,sirve
                """;
        mvc.perform(multipart("/api/admin/import/students").file(csv(contenido))
                        .header("Authorization", tokenAdmin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.imported").value(1))
           .andExpect(jsonPath("$.errors.length()").value(1));
    }

    @Test
    void un_docente_no_puede_importar() throws Exception {
        mvc.perform(multipart("/api/admin/import/students").file(csv("document_id\n1"))
                        .header("Authorization", "Bearer " + jwt.issueAccess(1L, "DOCENTE")))
           .andExpect(status().isForbidden());
    }
}
```

- [ ] **Step 2: Ejecutar — debe fallar**

Run: `cd backend && ./mvnw test -Dtest=ImportTest`
Expected: FAIL con 404.

- [ ] **Step 3: Anadir el upsert de estudiantes a `StudentRepository`**

```java
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query(value = """
            INSERT INTO students (document_id, first_name, middle_name, last_name, second_surname, grade)
            VALUES (:documentId, :firstName, :middleName, :lastName, :secondSurname, :grade)
            ON CONFLICT (document_id) DO UPDATE
              SET first_name = EXCLUDED.first_name,
                  middle_name = EXCLUDED.middle_name,
                  last_name = EXCLUDED.last_name,
                  second_surname = EXCLUDED.second_surname,
                  grade = EXCLUDED.grade,
                  active = TRUE
            """, nativeQuery = true)
    void upsert(@org.springframework.data.repository.query.Param("documentId") String documentId,
                @org.springframework.data.repository.query.Param("firstName") String firstName,
                @org.springframework.data.repository.query.Param("middleName") String middleName,
                @org.springframework.data.repository.query.Param("lastName") String lastName,
                @org.springframework.data.repository.query.Param("secondSurname") String secondSurname,
                @org.springframework.data.repository.query.Param("grade") String grade);
```

El `document_id` es la clave natural: reimportar el listado actualiza el curso al pasar de ano en vez de crear un estudiante nuevo. Es lo que evita que la base se llene de fantasmas cada febrero.

- [ ] **Step 4: Escribir `ImportController`**

Parseo de CSV a mano, sin libreria: seis columnas sin comillas ni comas embebidas no justifican una dependencia. Si el colegio empieza a mandar nombres con comas, cambiar a `commons-csv` y no antes.

```java
package co.edu.ggm.asistencia.admin;

import co.edu.ggm.asistencia.student.StudentRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/admin/import")
@PreAuthorize("hasRole('ADMIN')")
public class ImportController {

    private final StudentRepository students;

    public ImportController(StudentRepository students) { this.students = students; }

    public record ImportResult(int imported, List<String> errors) {}

    @PostMapping("/students")
    @Transactional
    public ImportResult students(@RequestParam("file") MultipartFile file) throws IOException {
        List<String> errores = new ArrayList<>();
        int importados = 0;
        int numero = 0;

        try (var reader = new BufferedReader(
                new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String linea;
            while ((linea = reader.readLine()) != null) {
                numero++;
                if (numero == 1 || linea.isBlank()) continue;   // cabecera
                String[] c = linea.split(",", -1);
                if (c.length < 6) {
                    errores.add("Linea " + numero + ": se esperaban 6 columnas y llegaron " + c.length);
                    continue;
                }
                String documento = c[0].trim();
                if (documento.isEmpty() || c[1].isBlank() || c[3].isBlank()) {
                    errores.add("Linea " + numero + ": documento, primer nombre y primer apellido son obligatorios");
                    continue;
                }
                students.upsert(documento, c[1].trim(), vacioANull(c[2]), c[3].trim(),
                        vacioANull(c[4]), c[5].trim());
                importados++;
            }
        }
        return new ImportResult(importados, errores);
    }

    private static String vacioANull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
```

- [ ] **Step 5: Ejecutar los tests**

Run: `cd backend && ./mvnw test -Dtest=ImportTest`
Expected: PASS los tres.

- [ ] **Step 6: Exportar los datos reales desde el Excel actual**

En `Toma de asistencia.xlsx`, hoja `Listado_Estudiantes`: **Guardar como > CSV UTF-8**. Verificar que las tildes y la letra ene sobrevivan — el archivo original ya tiene corrupcion de codificacion visible (`CASTA?EDA`). Corregirlo **antes** de importar: despues cuesta mucho mas.

```bash
curl -X POST http://localhost:8080/api/admin/import/students \
  -H "Authorization: Bearer $TOKEN_ADMIN" \
  -F "file=@Listado_Estudiantes.csv"
```

La carga de `Horario` y `Contactos_Padres` es tarea de seguimiento, no de esta. Ver "Fuera de alcance".

- [ ] **Step 7: Escribir el `Dockerfile` (build en tres etapas)**

El frontend compilado se sirve como recurso estatico del propio Spring Boot: un contenedor, un dominio, cero CORS en produccion.

```dockerfile
FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-21 AS backend
WORKDIR /app
COPY backend/pom.xml ./
RUN mvn -B dependency:go-offline
COPY backend/src ./src
COPY --from=frontend /app/dist ./src/main/resources/static
RUN mvn -B clean package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=backend /app/target/asistencia-0.1.0.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
```

- [ ] **Step 8: Anadir el fallback de rutas de la SPA**

Con el frontend servido por Spring, recargar `/asistencia` daria 404 porque no es un endpoint. Crear `backend/src/main/java/co/edu/ggm/asistencia/config/SpaConfig.java`:

```java
package co.edu.ggm.asistencia.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class SpaConfig implements WebMvcConfigurer {
    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        // Cualquier ruta de un solo segmento sin punto (es decir, no un fichero) va al index de la SPA.
        registry.addViewController("/{path:[^\.]*}").setViewName("forward:/index.html");
    }
}
```

- [ ] **Step 9: Escribir el workflow de CI**

```yaml
name: ci
on: [push, pull_request]
jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { java-version: '21', distribution: 'temurin', cache: 'maven' }
      - run: cd backend && ./mvnw -B verify
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm', cache-dependency-path: frontend/package-lock.json }
      - run: cd frontend && npm ci && npm test && npm run build
```

Testcontainers funciona en GitHub Actions sin configuracion extra: el runner ya trae Docker.

- [ ] **Step 10: Desplegar**

Con ~0,5 GB/ano (calculo del encabezado), dos opciones razonables:
1. **Fly.io o Railway** + Postgres gestionado. Despliegue directo del `Dockerfile` y HTTPS incluido — obligatorio: sin HTTPS no hay camara ni instalacion de PWA.
2. **VPS de 10 USD** (Hetzner CX22, DigitalOcean) con `docker compose` y Caddy de proxy TLS. Mas barato y con mas control, pero los backups y las actualizaciones quedan a cargo del colegio.

Variables de entorno obligatorias en produccion: `DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` (32+ bytes aleatorios, **nunca** el valor por defecto del `application.yml`), `MAIL_HOST`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`, `MAIL_COORDINACION`.

Backup: `pg_dump` diario a almacenamiento externo. Un dump comprimido de este volumen son unos pocos MB; no hay excusa para no tenerlo.

- [ ] **Step 11: Verificacion final de extremo a extremo**

Run: `cd backend && ./mvnw verify` y `cd frontend && npm test && npm run build`
Expected: PASS todo. Despues, en el celular y contra el despliegue real:
1. Instalar la PWA desde el navegador.
2. Poner el telefono en **modo avion**, abrir la app, tomar la asistencia de un curso completo.
3. Quitar el modo avion y confirmar que los registros llegan a la BD, sin duplicados.
4. Descargar el informe en Excel desde la cuenta de coordinacion.

- [ ] **Step 12: Commit**

```bash
git add backend frontend Dockerfile .github
git commit -m "feat: importacion CSV de estudiantes, imagen Docker y CI"
```

---

## Fuera de alcance (planes de seguimiento)

Esto **no** esta en este plan y necesita su propio plan cuando toque. Se listan para que nadie los improvise a mitad de camino:

1. **Administracion de usuarios y horarios por interfaz.** Hoy los docentes, los cursos, el horario y los acudientes entran por SQL o por migracion. La pantalla de administracion es un subsistema completo (altas, bajas, reseteo de contrasenas, carga del horario) y merece su plan. Mientras tanto, un `INSERT` documentado alcanza para arrancar.
2. **Dias institucionales en vez de dias de la semana.** Miguel Bacca pidio expresamente no manejar lunes-viernes sino dias institucionales (A/B, semana 1/2) y separar los laboratorios. Esto cambia `schedule_blocks.weekday` por un calendario academico con sus propias tablas. Es un rediseno del modelo de horario, no un ajuste — y por eso este plan usa `weekday` mas selector de fecha, que ya cubre el 90 % del caso real sin bloquear la primera version.
3. **Foto del estudiante en la ficha.** Requiere almacenamiento de objetos y una politica de datos de menores. `students` ya tiene `eps`, `address` y `phone` para la ficha basica que pidio Laura.
4. **Notificacion de llegada tarde.** El `kind` `LLEGADA_TARDE` ya existe en el CHECK de la tabla, pero no se encola: exige definir con el colegio a partir de que hora se considera tardanza reportable. Es una decision de la institucion, no tecnica.
5. **Sincronizacion delta.** Hoy `bootstrap` baja el paquete completo (unos 15 KB gzip). Con `?since=` seria menor, pero optimizar 15 KB antes de medir es exactamente el tipo de trabajo que no hay que hacer.
6. **Notificaciones push.** El correo cubre el requisito. Web Push exige VAPID, permisos y un service worker que reciba en segundo plano — mucho aparato para un aviso que puede esperar quince minutos.

## Riesgos conocidos

| Riesgo | Impacto | Mitigacion en este plan |
|---|---|---|
| Los codigos de los carnets no coinciden con los documentos del listado | El escaneo no reconoce a nadie | Step 11 de la Task 10 lo verifica **contra carnets reales** antes de depender de ello |
| Los docentes usan telefonos viejos sin `BarcodeDetector` | El escaner no arranca | Respaldo con `@zxing/browser` cargado bajo demanda (Task 10) |
| El colegio no tiene HTTPS | Ni camara ni PWA instalable | Requisito explicito del despliegue (Task 14, Step 10) |
| Datos con codificacion corrupta en el Excel de origen | Nombres ilegibles y busquedas fallidas | Se corrige antes de importar (Task 14, Step 6) |
| El docente desinstala la app con registros sin sincronizar | Perdida de asistencia | El contador de pendientes es visible en todas las pantallas; capacitar en no desinstalar con pendientes |

## Self-review

Cobertura del material de origen:

- `README` "Migracion de base de datos" -> Tasks 1-2 (PostgreSQL + Flyway).
- `README` "Validacion de registros duplicados" -> Task 2 (`attendance_unique_slot`) + Task 5 (upsert). El bug queda cerrado en la BD, no en la interfaz.
- `README` "Tablas codigos" -> Tasks 2 y 10 (`document_id` del carnet, no generado). Las fotos quedan fuera de alcance, punto 3.
- `README` "Notificacion evasion" y "Notificacion falta" -> Task 12. La llegada tarde queda fuera de alcance, punto 4.
- `README` "Detalles estudiantes" -> columnas `eps`, `address`, `phone` en la Task 2; la ficha ampliada queda fuera de alcance.
- `README` "Pantalla de confirmacion/historial" -> Task 11 (`/api/reports/pending-today` y el aviso en `Home`).
- `README` "Pantalla consulta" -> Task 11 (`Consultas.tsx` + Excel).
- `Pruebas.docx` Francisco: sin internet -> Fase 3; nombres en el registro -> Task 4; evasion -> estado `E` en todo el flujo.
- `Pruebas.docx` Miguel: horario por profesor -> Task 4; fechas especificas -> selector de fecha, Task 8. Dias institucionales, fuera de alcance punto 2.
- `Pruebas.docx` Laura: informacion personal -> columnas de la Task 2; comentarios -> campo `comment` en Tasks 5 y 8; dia para tomar asistencia -> Task 8; reemplazos -> regla 4 de la Task 5.
- Documento de contexto: PWA -> Task 9; QR del carnet -> Task 10; alertas a padres -> Tasks 12-13; multiusuario -> Task 3.

Consistencia de nombres verificada de punta a punta: `document_id`/`documentId`, `schedule_block_id`/`scheduleBlockId`, `class_date`/`classDate`, `recorded_at`/`recordedAt`, `attendance_unique_slot`, `entry_unique_day`, `notification_unique`. Los estados son siempre `P`/`T`/`F`/`E` en SQL, Java y TypeScript.

Fallos corregidos durante la autorevision, anotados para que no se reintroduzcan:

- El upsert de asistencia usaba un unico `ON CONFLICT ON CONSTRAINT attendance_unique_slot` y podia chocar tambien contra la clave primaria: sustituido por `UPDATE` seguido de `INSERT ... ON CONFLICT DO NOTHING` (Task 5, Steps 4-5).
- `entry_log` usa `DO NOTHING` y no `DO UPDATE`: la hora de ingreso que importa es la **primera** del dia.
- Las notificaciones de inasistencia se agrupan por estudiante y dia, no por bloque, para no mandarle seis correos al mismo padre por una sola ausencia.
