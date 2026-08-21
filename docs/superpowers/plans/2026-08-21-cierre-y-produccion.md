# Cierre y Produccion — Plan de Implementacion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar las brechas que quedaron tras integrar los tres tracks, dejando el sistema empaquetado, desplegable y cargable con los datos reales del colegio.

**Architecture:** Se corrigen primero dos incoherencias detectadas en la verificacion, luego se empaqueta todo en una sola imagen Docker donde Spring Boot sirve el frontend compilado como recurso estatico (un contenedor, un dominio, cero CORS en produccion), y por ultimo se amplia la importacion CSV a horario y acudientes para poder cargar los 1200 estudiantes reales.

**Tech Stack:** Java 21, Spring Boot 3.4, PostgreSQL 16, Flyway, Maven, React 18, Vite, Docker, GitHub Actions.

**Spec:** `docs/INFORME-FINAL.md` seccion 6, y `docs/superpowers/plans/2026-08-20-sistema-asistencia-paralelo.md` (Task Z1 y seccion "Fuera de alcance").

## Global Constraints

- **El proyecto vive en `app/`**: `app/backend`, `app/frontend`, `app/contracts`.
- **Java 21**, Spring Boot **3.4.x**, Maven. Nada de Gradle.
- **PostgreSQL 16**. No hay Docker en la maquina de desarrollo: los tests usan el Postgres local.
  Backend: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test`
- **Rango de versiones Flyway reservado para este plan: `V30`-`V39`.**
- **Estructura MVC** descrita en `app/README.md`: MVC clasico por capas: `controller/`, `service/`, `repository/`, `model/`, `config/`, cada una con todas sus clases.
- **Nunca `hibernate.jdbc.time_zone`.** Se quito porque desplazaba los `LocalTime` cinco horas. Hay un test de regresion que falla si vuelve.
- **Estados** `P`, `T`, `F`, `E`. **Orden de apilado y colores fijos:** `P #0ca30c`, `T #fab219`, `F #d03b3b`, `E #ec835a`. Validado; no reordenar.
- **Sin librerias de graficas ni de componentes.** Paquete inicial por debajo de 200 KB gzip.
- **Idioma:** identificadores en ingles, texto visible en espanol. Sin tildes ni letra ene en nombres de ficheros, tablas, columnas ni campos JSON.
- **El remoto `origin` es `P1p2gamer26/Asistencia_GABO` (privado).** `upstream` es el repo ajeno del que se clono y **tiene el push deshabilitado**: nunca se le empuja nada.
- **Commits:** Conventional Commits en espanol, uno por tarea como minimo, terminando con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

```
app/backend/src/main/java/co/edu/ggm/asistencia/
├── config/SpaConfig.java              (nuevo) rutas de la SPA
├── admin/
│   ├── controller/ImportController.java      (modificar) + horario y acudientes
│   └── service/ImportService.java            (nuevo) parseo y carga, sacado del controlador
app/frontend/src/
├── pages/Home.tsx                            (modificar) enlace de Consultas
└── components/charts/geometria.ts            (modificar) dominio con un solo punto
Dockerfile                                    (nuevo) build de tres etapas
.github/workflows/ci.yml                      (nuevo) integracion continua
```

---

## Fase 1 — Incoherencias detectadas en la verificacion

### Task 1: El grafico de tendencia con un solo dia

**Files:**
- Modify: `app/frontend/src/components/charts/geometria.ts`
- Test: `app/frontend/src/components/charts/charts.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `dominioY(serie)` devuelve `{min, max}` con `min < max` **siempre**, incluso con un solo punto o con todos los valores iguales.

Con un unico dia registrado, `dominioY` devuelve `min === max`, y el grafico pinta las dos etiquetas del eje con el mismo numero ("50.0%" arriba y "50.0%" abajo) y el punto pegado al borde inferior. Se ve como un error de la aplicacion aunque el dato sea correcto. Se arregla ensanchando el dominio cuando no hay rango.

- [ ] **Step 1: Escribir el test que falla**

Anadir a `charts.test.ts`, y anadir `dominioY` al import existente de `./geometria`:

```ts
  it('con un solo dia el dominio no queda plano', () => {
    const d = dominioY([{ attendanceRate: 50 }]);
    expect(d.max).toBeGreaterThan(d.min);
    expect(d.min).toBeLessThanOrEqual(50);
    expect(d.max).toBeGreaterThanOrEqual(50);
  });

  it('con todos los valores iguales tampoco queda plano', () => {
    const d = dominioY([{ attendanceRate: 92 }, { attendanceRate: 92 }]);
    expect(d.max).toBeGreaterThan(d.min);
  });

  it('nunca se sale de 0 a 100', () => {
    expect(dominioY([{ attendanceRate: 100 }]).max).toBeLessThanOrEqual(100);
    expect(dominioY([{ attendanceRate: 0 }]).min).toBeGreaterThanOrEqual(0);
  });

  it('con rango real lo respeta tal cual', () => {
    const d = dominioY([{ attendanceRate: 88 }, { attendanceRate: 96 }]);
    expect(d.min).toBe(88);
    expect(d.max).toBe(96);
  });

  it('una serie vacia sigue devolviendo 0 a 100', () => {
    expect(dominioY([])).toEqual({ min: 0, max: 100 });
  });
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd app/frontend && npm test`
Expected: FAIL en "con un solo dia el dominio no queda plano" — `max` es igual a `min`.

- [ ] **Step 3: Corregir `dominioY`**

Sustituir la funcion completa en `geometria.ts`:

```ts
/**
 * Dominio vertical del grafico de tendencia. Si todos los valores son iguales
 * (un solo dia registrado, o una semana perfecta), se ensancha cinco puntos a cada
 * lado: sin eso las dos etiquetas del eje muestran el mismo numero y el punto queda
 * pegado al borde, que parece un fallo aunque el dato sea correcto.
 * El resultado nunca se sale de 0 a 100 porque es un porcentaje.
 */
export const dominioY = (serie: { attendanceRate: number }[]) => {
  const valores = serie.map((d) => d.attendanceRate);
  if (valores.length === 0) return { min: 0, max: 100 };

  const min = Math.min(...valores);
  const max = Math.max(...valores);
  if (max > min) return { min, max };

  return { min: Math.max(0, min - 5), max: Math.min(100, max + 5) };
};
```

- [ ] **Step 4: Ejecutar los tests**

Run: `cd app/frontend && npm test`
Expected: PASS todos.

- [ ] **Step 5: Commit**

```bash
git add app/frontend/src/components/charts
git commit -m "fix: el grafico de tendencia quedaba plano con un solo dia registrado

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: El docente no ve el enlace a Consultas

**Files:**
- Modify: `app/frontend/src/pages/Home.tsx:34`

**Interfaces:**
- Consumes: `getSession()` de `app/frontend/src/api/client.ts`.
- Produces: nada nuevo.

`App.tsx:39` permite la ruta `/consultas` a `DOCENTE`, `COORDINADOR` y `ADMIN`, pero `Home.tsx:34` esconde el enlace justo a los docentes con `session.role !== 'DOCENTE'`. El resultado es una pantalla accesible por URL pero sin forma de llegar a ella, y el docente es precisamente quien mas la necesita: es la que le deja consultar su propio curso. Manda `App.tsx`, que es donde estan declarados los permisos.

- [ ] **Step 1: Corregir el enlace**

Sustituir la linea 34 de `Home.tsx`:

```tsx
        {session.role !== 'DOCENTE' && <Link className="boton" to="/consultas">Consultas</Link>}
```

por:

```tsx
        <Link className="boton" to="/consultas">Consultas</Link>
        {(session.role === 'COORDINADOR' || session.role === 'ADMIN') && (
          <Link className="boton" to="/dashboard">Tablero</Link>
        )}
```

El tablero si es solo de coordinacion y rectoria, igual que en `App.tsx:41`, y hasta ahora no tenia enlace en ninguna parte: se llegaba solo escribiendo la URL.

- [ ] **Step 2: Comprobar que compila**

Run: `cd app/frontend && npm run build`
Expected: build correcto.

- [ ] **Step 3: Comprobar a mano los dos roles**

Run: `cd app/frontend && npm run dev` con el backend levantado.
1. Entrar como `fpalacios@ggm.edu.co` / `cambiar123`: debe verse "Consultas" y **no** "Tablero".
2. Entrar como `coord@ggm.edu.co` / `cambiar123`: deben verse los dos.

- [ ] **Step 4: Commit**

```bash
git add app/frontend/src/pages/Home.tsx
git commit -m "fix: el docente no tenia enlace a Consultas y nadie lo tenia al Tablero

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Fase 2 — Empaquetado y despliegue

### Task 3: Rutas de la SPA servidas por Spring Boot

**Files:**
- Create: `app/backend/src/main/java/co/edu/ggm/asistencia/config/SpaConfig.java`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/config/SpaRoutingTest.java`

**Interfaces:**
- Consumes: `AbstractIntegrationTest` de `co.edu.ggm.asistencia`.
- Produces: cualquier ruta de un solo segmento sin punto que no empiece por `/api` reenvia a `/index.html`.

En produccion el frontend compilado se sirve desde el propio Spring Boot. Sin esto, recargar la pagina en `/asistencia` da 404, porque no es un endpoint sino una ruta de React Router. Es el fallo clasico al desplegar una SPA y solo aparece al recargar, nunca navegando.

- [ ] **Step 1: Escribir el test que falla**

```java
package co.edu.ggm.asistencia.config;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class SpaRoutingTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void una_ruta_de_la_spa_reenvia_al_index() throws Exception {
        mvc.perform(get("/asistencia")).andExpect(forwardedUrl("/index.html"));
    }

    @Test
    void otra_ruta_de_la_spa_tambien() throws Exception {
        mvc.perform(get("/dashboard")).andExpect(forwardedUrl("/index.html"));
    }

    @Test
    void las_rutas_de_api_no_se_reenvian() throws Exception {
        // Sin token debe seguir dando 401, no el index de la SPA.
        mvc.perform(get("/api/schedule/mine")).andExpect(status().isUnauthorized());
    }

    @Test
    void los_ficheros_con_extension_no_se_reenvian() throws Exception {
        // Un .js inexistente debe dar 404, no devolver el index disfrazado de script.
        mvc.perform(get("/assets/no-existe.js")).andExpect(status().isNotFound());
    }
}
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test -Dtest=SpaRoutingTest`
Expected: FAIL en los dos primeros — no hay reenvio, la respuesta es 404.

- [ ] **Step 3: Escribir `SpaConfig`**

```java
package co.edu.ggm.asistencia.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Reenvia las rutas de React Router al index de la SPA.
 * El patron excluye lo que lleva punto (ficheros como .js o .png, que deben dar
 * 404 de verdad si no existen) y no toca /api, que resuelve antes por especifico.
 */
@Configuration
public class SpaConfig implements WebMvcConfigurer {

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/{ruta:[^\.]*}").setViewName("forward:/index.html");
    }
}
```

- [ ] **Step 4: Ejecutar los tests**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test -Dtest=SpaRoutingTest`
Expected: PASS los cuatro.

- [ ] **Step 5: Ejecutar la suite completa**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test`
Expected: PASS los 45 (los 41 de antes mas estos cuatro).

- [ ] **Step 6: Commit**

```bash
git add app/backend
git commit -m "feat: Spring Boot sirve las rutas de la SPA sin dar 404 al recargar

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Imagen Docker e integracion continua

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `app/backend` y `app/frontend` tal como quedaron.
- Produces: una imagen que arranca con `java -jar app.jar` y sirve API y frontend en el puerto 8080.

Un solo contenedor con el frontend compilado dentro del jar: un despliegue, un dominio y cero CORS en produccion. La configuracion de CORS del backend solo hace falta en desarrollo, cuando Vite corre aparte en el 5173.

- [ ] **Step 1: Escribir el `.dockerignore`**

Sin esto el contexto de build arrastra `node_modules` y `target`, y la construccion se vuelve lentisima.

```
**/node_modules
**/target
**/dist
.git
.worktrees
legacy
docs
*.log
```

- [ ] **Step 2: Escribir el `Dockerfile`**

```dockerfile
# 1. Frontend: se compila aparte y su salida entra al jar como recurso estatico
FROM node:22-alpine AS frontend
WORKDIR /app
COPY app/frontend/package*.json ./
RUN npm ci
COPY app/frontend/ ./
RUN npm run build

# 2. Backend: las dependencias se resuelven antes de copiar el codigo, para
#    aprovechar la cache de capas cuando solo cambia el codigo
FROM maven:3.9-eclipse-temurin-21 AS backend
WORKDIR /app
COPY app/backend/pom.xml ./
RUN mvn -B dependency:go-offline
COPY app/backend/src ./src
COPY --from=frontend /app/dist ./src/main/resources/static
RUN mvn -B clean package -DskipTests

# 3. Imagen final: solo el jre y el jar
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=backend /app/target/asistencia-0.1.0.jar app.jar
EXPOSE 8080
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"
ENTRYPOINT ["java", "-jar", "app.jar"]
```

Los tests se saltan **dentro de la imagen** a proposito: necesitan PostgreSQL, y quien los ejecuta es la integracion continua, que si lo tiene. Una imagen que no se puede construir sin base de datos no se puede construir en ningun sitio.

- [ ] **Step 3: Escribir el workflow de CI**

```yaml
name: ci
on: [push, pull_request]

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: asistencia_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { java-version: '21', distribution: 'temurin', cache: 'maven' }
      - name: Tests del backend
        working-directory: app/backend
        env:
          TEST_DB_URL: jdbc:postgresql://localhost:5432/asistencia_test
          TEST_DB_USER: postgres
          TEST_DB_PASSWORD: postgres
        run: mvn -B verify

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: app/frontend/package-lock.json
      - working-directory: app/frontend
        run: npm ci && npm test && npm run build

  imagen:
    runs-on: ubuntu-latest
    needs: [backend, frontend]
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t asistencia-ggm:sha-${{ github.sha }} .
```

- [ ] **Step 4: Comprobar que el workflow es YAML valido**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('YAML OK')"`
Expected: `YAML OK`.

- [ ] **Step 5: Construir la imagen**

Con Docker disponible: `docker build -t asistencia-ggm .`

**Si no hay Docker en la maquina** (es el caso hoy), no se puede verificar en local.
Anotarlo en `docs/ESTADO.md` y dejar que lo construya el job `imagen` de la CI en el
primer push. **No dar el Dockerfile por bueno hasta que uno de los dos lo construya**:
un Dockerfile sin construir es una hipotesis, no un entregable.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore .github
git commit -m "feat: imagen Docker de tres etapas e integracion continua

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Fase 3 — Carga de los datos reales del colegio

### Task 5: Importar horario y acudientes por CSV

**Files:**
- Create: `app/backend/src/main/java/co/edu/ggm/asistencia/service/ImportService.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/controller/ImportController.java`
- Create: `app/backend/src/main/resources/db/migration/V30__indices_importacion.sql`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/admin/ImportHorarioTest.java`

**Interfaces:**
- Consumes: tablas `students`, `users`, `subjects`, `schedule_blocks`, `guardianships`.
- Produces:
  - `POST /api/admin/import/schedule` (ADMIN), CSV `grade,weekday,block_no,start_time,end_time,subject,teacher_email` -> `{"imported":int,"errors":[String]}`
  - `POST /api/admin/import/guardians` (ADMIN), CSV `document_id,guardian_name,guardian_email,relationship` -> `{"imported":int,"errors":[String]}`

Hoy solo se importan estudiantes; el horario y los acudientes hay que meterlos por SQL. Y **sin horario no hay nada que marcar**: la pantalla de asistencia sale vacia. Estos dos importadores son lo que vuelve el sistema usable con datos reales.

Ambos crean lo que falte: si la materia no existe la crea, si el docente no existe lo crea con rol `DOCENTE` y contrasena temporal, si el acudiente no existe lo crea con rol `ACUDIENTE`. Un importador que exige que todo preexista obliga a cargar cuatro ficheros en el orden correcto, y ahi es donde el colegio se rinde.

- [ ] **Step 1: Escribir la migracion `V30__indices_importacion.sql`**

```sql
-- Consulta inversa (los hijos de un acudiente): hoy hace recorrido completo de tabla.
CREATE INDEX IF NOT EXISTS idx_guardianships_guardian ON guardianships (guardian_id);

-- El importador de horario busca docentes por correo en cada linea del CSV.
CREATE INDEX IF NOT EXISTS idx_users_email_activo ON users (email) WHERE active;
```

- [ ] **Step 2: Anadir un helper de token a `AbstractIntegrationTest`**

Cada test repite el mismo bloque para fabricarse un token. Se centraliza:

```java
    @org.springframework.beans.factory.annotation.Autowired
    protected co.edu.ggm.asistencia.service.JwtService jwt;

    @org.springframework.beans.factory.annotation.Autowired
    protected org.springframework.jdbc.core.JdbcTemplate jdbcBase;

    /** Token de acceso para el usuario con ese correo, con el rol indicado. */
    protected String tokenDe(String email, String rol) {
        Long id = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, email);
        return "Bearer " + jwt.issueAccess(id, rol);
    }
```

`JwtService` vive en `co.edu.ggm.asistencia.service`.

- [ ] **Step 3: Escribir el test que falla**

```java
package co.edu.ggm.asistencia.admin;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class ImportHorarioTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private String admin() { return tokenDe("admin@ggm.edu.co", "ADMIN"); }

    private MockMultipartFile csv(String contenido) {
        return new MockMultipartFile("file", "datos.csv", "text/csv",
                contenido.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void importa_horario_creando_materia_y_docente_que_no_existian() throws Exception {
        String contenido = """
                grade,weekday,block_no,start_time,end_time,subject,teacher_email
                701,2,3,08:00,08:50,Biologia,nuevo.docente@ggm.edu.co
                """;
        mvc.perform(multipart("/api/admin/import/schedule").file(csv(contenido))
                        .header("Authorization", admin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.imported").value(1))
           .andExpect(jsonPath("$.errors.length()").value(0));

        assertThat(jdbcBase.queryForObject(
                "SELECT count(*) FROM subjects WHERE name = 'Biologia'", Integer.class)).isEqualTo(1);
        assertThat(jdbcBase.queryForObject(
                "SELECT role FROM users WHERE email = 'nuevo.docente@ggm.edu.co'",
                String.class)).isEqualTo("DOCENTE");
        assertThat(jdbcBase.queryForObject(
                "SELECT start_time::text FROM schedule_blocks WHERE grade='701' AND block_no=3",
                String.class)).isEqualTo("08:00:00");
    }

    @Test
    void reimportar_el_mismo_horario_actualiza_y_no_duplica() throws Exception {
        String contenido = """
                grade,weekday,block_no,start_time,end_time,subject,teacher_email
                702,1,1,06:30,07:20,Fisica,fpalacios@ggm.edu.co
                """;
        mvc.perform(multipart("/api/admin/import/schedule").file(csv(contenido))
                .header("Authorization", admin())).andExpect(status().isOk());
        mvc.perform(multipart("/api/admin/import/schedule").file(csv(contenido))
                .header("Authorization", admin())).andExpect(status().isOk());

        assertThat(jdbcBase.queryForObject(
                "SELECT count(*) FROM schedule_blocks WHERE grade='702'", Integer.class)).isEqualTo(1);
    }

    @Test
    void una_linea_de_horario_mal_formada_se_reporta_sin_abortar_el_resto() throws Exception {
        String contenido = """
                grade,weekday,block_no,start_time,end_time,subject,teacher_email
                703,1,1,06:30,07:20,Quimica,fpalacios@ggm.edu.co
                703,9,1,06:30,07:20,Quimica,fpalacios@ggm.edu.co
                """;
        mvc.perform(multipart("/api/admin/import/schedule").file(csv(contenido))
                        .header("Authorization", admin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.imported").value(1))
           .andExpect(jsonPath("$.errors.length()").value(1));
    }

    @Test
    void importa_acudientes_y_los_vincula_con_su_hijo() throws Exception {
        String contenido = """
                document_id,guardian_name,guardian_email,relationship
                1010101010,Maria Figueroa,maria.figueroa@correo.com,Madre
                """;
        mvc.perform(multipart("/api/admin/import/guardians").file(csv(contenido))
                        .header("Authorization", admin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.imported").value(1));

        assertThat(jdbcBase.queryForObject("""
                SELECT count(*) FROM guardianships g
                JOIN users u ON u.id = g.guardian_id
                JOIN students s ON s.id = g.student_id
                WHERE u.email='maria.figueroa@correo.com' AND s.document_id='1010101010'
                """, Integer.class)).isEqualTo(1);
    }

    @Test
    void un_acudiente_de_un_estudiante_inexistente_se_reporta() throws Exception {
        String contenido = """
                document_id,guardian_name,guardian_email,relationship
                0000000000,Nadie,nadie@correo.com,Padre
                """;
        mvc.perform(multipart("/api/admin/import/guardians").file(csv(contenido))
                        .header("Authorization", admin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.imported").value(0))
           .andExpect(jsonPath("$.errors.length()").value(1));
    }
}
```

- [ ] **Step 4: Ejecutar y ver que falla**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test -Dtest=ImportHorarioTest`
Expected: FAIL con 404 en `/api/admin/import/schedule`.

- [ ] **Step 5: Escribir `ImportService`**

Toda la logica de parseo sale del controlador. El controlador se queda con recibir el fichero y devolver el resultado, que es lo que le toca en MVC.

```java
package co.edu.ggm.asistencia.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BiConsumer;

@Service
public class ImportService {

    public record Resultado(int imported, List<String> errors) {}

    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;

    public ImportService(JdbcTemplate jdbc, PasswordEncoder encoder) {
        this.jdbc = jdbc; this.encoder = encoder;
    }

    /**
     * Recorre el CSV aplicando `accion` a cada linea. Cada linea va en su propia
     * transaccion: una fila mala no puede tumbar las 1200 buenas.
     */
    private Resultado recorrer(java.io.InputStream entrada, int columnas,
                               BiConsumer<String[], Integer> accion) throws IOException {
        List<String> errores = new ArrayList<>();
        int importados = 0, numero = 0;

        try (var reader = new BufferedReader(new InputStreamReader(entrada, StandardCharsets.UTF_8))) {
            String linea;
            while ((linea = reader.readLine()) != null) {
                numero++;
                if (numero == 1 || linea.isBlank()) continue;    // cabecera
                String[] c = linea.split(",", -1);
                if (c.length < columnas) {
                    errores.add("Linea " + numero + ": se esperaban " + columnas
                            + " columnas y llegaron " + c.length);
                    continue;
                }
                try {
                    accion.accept(c, numero);
                    importados++;
                } catch (RuntimeException e) {
                    errores.add("Linea " + numero + ": " + e.getMessage());
                }
            }
        }
        return new Resultado(importados, errores);
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public Resultado importarHorario(java.io.InputStream entrada) throws IOException {
        return recorrer(entrada, 7, (c, n) -> {
            String grade = c[0].trim();
            short weekday = Short.parseShort(c[1].trim());
            if (weekday < 1 || weekday > 5) {
                throw new IllegalArgumentException("weekday debe estar entre 1 y 5, llego " + weekday);
            }
            short blockNo = Short.parseShort(c[2].trim());
            LocalTime inicio = LocalTime.parse(c[3].trim());
            LocalTime fin = LocalTime.parse(c[4].trim());
            if (!fin.isAfter(inicio)) {
                throw new IllegalArgumentException("end_time debe ser posterior a start_time");
            }
            Long materiaId = idDeMateria(c[5].trim());
            Long docenteId = idDeDocente(c[6].trim().toLowerCase());

            jdbc.update("""
                    INSERT INTO schedule_blocks
                      (grade, weekday, block_no, start_time, end_time, subject_id, teacher_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (grade, weekday, block_no) DO UPDATE
                      SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
                          subject_id = EXCLUDED.subject_id, teacher_id = EXCLUDED.teacher_id
                    """, grade, weekday, blockNo, inicio, fin, materiaId, docenteId);
        });
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public Resultado importarAcudientes(java.io.InputStream entrada) throws IOException {
        return recorrer(entrada, 4, (c, n) -> {
            String documento = c[0].trim();
            Long estudianteId = jdbc.query(
                    "SELECT id FROM students WHERE document_id = ? AND active", 
                    rs -> rs.next() ? rs.getLong(1) : null, documento);
            if (estudianteId == null) {
                throw new IllegalArgumentException("No existe el estudiante " + documento);
            }
            Long acudienteId = idDeAcudiente(c[2].trim().toLowerCase(), c[1].trim());
            jdbc.update("""
                    INSERT INTO guardianships (student_id, guardian_id, relationship)
                    VALUES (?, ?, ?)
                    ON CONFLICT (student_id, guardian_id) DO UPDATE
                      SET relationship = EXCLUDED.relationship
                    """, estudianteId, acudienteId, c[3].trim());
        });
    }

    private Long idDeMateria(String nombre) {
        jdbc.update("INSERT INTO subjects (name) VALUES (?) ON CONFLICT (name) DO NOTHING", nombre);
        return jdbc.queryForObject("SELECT id FROM subjects WHERE name = ?", Long.class, nombre);
    }

    private Long idDeDocente(String correo) {
        return idDeUsuario(correo, correo.split("@")[0], "DOCENTE");
    }

    private Long idDeAcudiente(String correo, String nombre) {
        return idDeUsuario(correo, nombre, "ACUDIENTE");
    }

    /**
     * Crea el usuario si no existe, con contrasena temporal. No la sobreescribe si ya
     * existe: reimportar el horario no puede echar de la aplicacion a un docente que
     * ya cambio su contrasena.
     */
    private Long idDeUsuario(String correo, String nombre, String rol) {
        jdbc.update("""
                INSERT INTO users (email, password_hash, full_name, role)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (email) DO NOTHING
                """, correo, encoder.encode("cambiar123"), nombre, rol);
        return jdbc.queryForObject("SELECT id FROM users WHERE email = ?", Long.class, correo);
    }
}
```

- [ ] **Step 6: Anadir los dos endpoints a `ImportController`**

```java
    @PostMapping("/schedule")
    public ImportService.Resultado schedule(@RequestParam("file") MultipartFile file)
            throws IOException {
        return importService.importarHorario(file.getInputStream());
    }

    @PostMapping("/guardians")
    public ImportService.Resultado guardians(@RequestParam("file") MultipartFile file)
            throws IOException {
        return importService.importarAcudientes(file.getInputStream());
    }
```

Anadir `ImportService importService` al constructor. La clase ya tiene `@PreAuthorize("hasRole('ADMIN')")`, asi que los dos endpoints quedan restringidos automaticamente.

- [ ] **Step 7: Ejecutar los tests**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test`
Expected: PASS todo.

- [ ] **Step 8: Documentar los tres CSV en `app/README.md`**

Anadir una seccion "Carga de datos" con las cabeceras exactas de los tres ficheros y el orden de carga: **estudiantes primero, horario despues, acudientes al final** (los otros dos dependen de que el estudiante exista).

```bash
TOKEN=... # de POST /api/auth/login con admin@ggm.edu.co
curl -X POST http://localhost:8080/api/admin/import/students  -H "Authorization: Bearer $TOKEN" -F "file=@estudiantes.csv"
curl -X POST http://localhost:8080/api/admin/import/schedule  -H "Authorization: Bearer $TOKEN" -F "file=@horario.csv"
curl -X POST http://localhost:8080/api/admin/import/guardians -H "Authorization: Bearer $TOKEN" -F "file=@acudientes.csv"
```

- [ ] **Step 9: Commit**

```bash
git add app/backend app/README.md
git commit -m "feat: importacion de horario y acudientes por CSV

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Fase 4 — Verificacion de las notificaciones

### Task 6: Comprobar que los correos salen de verdad

**Files:**
- Modify: `app/backend/src/main/resources/application.yml`
- Create: `docs/VERIFICACION-CORREO.md`

**Interfaces:**
- Consumes: `NotificationService.enqueuePending()` y `dispatchPending()` del Track C.
- Produces: constancia escrita de que el envio funciona contra un servidor SMTP real.

Los tests de notificaciones solo ejercitan el **encolado**: comprueban que se crea la fila correcta y que no se duplica. El **envio** nunca se ha ejecutado. Una cola que encola perfectamente y no envia nada se ve idéntica a una que funciona, hasta el dia en que un padre pregunta por que nunca le avisaron.

- [ ] **Step 1: Levantar un servidor SMTP de mentira**

```bash
docker run --rm -p 1025:1025 -p 8025:8025 mailhog/mailhog
```

Sin Docker, la alternativa es Python, que ya esta instalado:

```bash
python -m smtpd -n -c DebuggingServer localhost:1025
```

Ese modulo imprime por consola cada correo recibido. Basta para comprobar que salen; en Python 3.12+ fue retirado, en cuyo caso usar `aiosmtpd`:
`pip install aiosmtpd && python -m aiosmtpd -n -l localhost:1025`

- [ ] **Step 2: Arrancar el backend apuntando al SMTP falso**

```bash
cd app/backend
DB_URL=jdbc:postgresql://localhost:5432/asistencia DB_USER=postgres DB_PASSWORD=postgres \
MAIL_HOST=localhost MAIL_PORT=1025 NOTIFY_ENABLED=true \
MAIL_FROM=asistencia@ggm.edu.co MAIL_COORDINACION=coord@ggm.edu.co \
mvn -B spring-boot:run
```

- [ ] **Step 3: Provocar una evasion y una inasistencia**

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"fpalacios@ggm.edu.co","password":"cambiar123"}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')

curl -X POST http://localhost:8080/api/attendance/sync \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"records":[
        {"id":"e1111111-1111-4111-8111-111111111111","studentId":1,"scheduleBlockId":1,
         "classDate":"2026-08-20","status":"E","recordedAt":"2026-08-20T12:00:00Z"},
        {"id":"e2222222-2222-4222-8222-222222222222","studentId":2,"scheduleBlockId":1,
         "classDate":"2026-08-20","status":"F","recordedAt":"2026-08-20T12:00:00Z"}]}'
```

El estudiante 2 necesita un acudiente registrado para que se encole el aviso de
inasistencia; si no lo tiene, cargarlo antes con el importador de la Task 5.

- [ ] **Step 4: Esperar al planificador y comprobar la cola**

El `NotificationJob` corre con `@Scheduled(cron = "0 */15 * * * *")`, asi que dispara
al minuto 0, 15, 30 o 45. Mientras tanto, comprobar que la cola se lleno:

```bash
psql -U postgres -d asistencia -c \
  "SELECT kind, recipient, sent_at, error FROM notifications ORDER BY id"
```

Expected: dos filas, una `EVASION` a `coord@ggm.edu.co` y una `AUSENCIA_DIA` al correo
del acudiente. Tras el disparo del job, ambas con `sent_at` no nulo y `error` nulo.

- [ ] **Step 5: Comprobar que los correos llegaron**

Con MailHog: abrir `http://localhost:8025` y verificar asunto y cuerpo en espanol.
Con el servidor de Python: los correos aparecen impresos en su consola.

**Si `sent_at` sigue nulo y `error` tiene texto**, el problema es la configuracion SMTP,
no la cola: leer el mensaje de `error`, que se guarda justamente para esto.

- [ ] **Step 6: Escribir `docs/VERIFICACION-CORREO.md`**

Un documento corto con: fecha de la prueba, comando exacto usado, captura o copia del
correo recibido, y las variables de entorno que hay que configurar en produccion
(`MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_TLS`, `MAIL_FROM`,
`MAIL_COORDINACION`). Sin esto, quien despliegue no sabra que el sistema manda correos.

- [ ] **Step 7: Commit**

```bash
git add docs/VERIFICACION-CORREO.md app/backend/src/main/resources/application.yml
git commit -m "test: verificacion del envio real de notificaciones por SMTP

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Fuera de alcance (necesitan su propio plan o una persona)

Esto **no** esta en este plan. Se listan para que nadie los improvise.

### Requieren su propio plan

1. **Pantalla de administracion.** Altas y bajas de usuarios, reseteo de contrasenas,
   edicion del horario y del calendario desde la interfaz. Hoy todo eso se hace con los
   importadores CSV y la API del calendario, que alcanza para arrancar, pero el colegio
   no puede depender de `curl` para siempre. Es un subsistema completo: merece su plan.
2. **Dias institucionales A/B.** Miguel Bacca pidio no manejar lunes a viernes sino dias
   institucionales, y separar los laboratorios. `school_calendar` deja el hueco natural
   (bastaria una columna `institutional_day`), pero cambiar `schedule_blocks.weekday`
   por un ciclo A/B es rediseno del modelo de horario.
3. **Calendario de 2027 en adelante.** `V2` siembra 2026. Con la pantalla del punto 1
   seria una carga de datos y no una migracion.
4. **Notificacion de llegada tarde.** El tipo `LLEGADA_TARDE` ya existe en la
   restriccion de la tabla pero no se encola: falta que el colegio defina desde que hora
   una tardanza se reporta. Es decision de la institucion, no tecnica.
5. **Foto del estudiante en la ficha.** Necesita almacenamiento de objetos y una
   politica de datos de menores.

### Requieren una persona, hardware o acceso que no tenemos

6. **Escanear un carnet real.** Hay que comprobar que el codigo impreso coincide con
   `students.document_id`. Si no coincide, el problema son los datos, no el codigo, y
   es mejor descubrirlo con un carnet en la mano que el primer dia de clases.
7. **Instalar la PWA en un telefono de verdad.** Requiere HTTPS: `getUserMedia` y la
   instalacion no funcionan sobre HTTP salvo en `localhost`.
8. **Los datos reales del colegio.** 1200 estudiantes, el horario completo y los
   contactos de los acudientes. El fichero `legacy/Toma de asistencia.xlsx` tiene
   corrupcion de codificacion visible (`CASTA?EDA`): hay que corregirla **antes** de
   importar, porque despues cuesta mucho mas.
9. **Confirmar el calendario con la rectoria.** Los festivos nacionales son correctos;
   los recesos sembrados son los tipicos del calendario A y el colegio puede tener los
   suyos.
10. **Decidir donde se despliega** y con que dominio, para poder emitir el certificado.

## Self-review

**Cobertura.** Cada brecha listada en `docs/INFORME-FINAL.md` seccion 6 tiene tarea o
esta explicitamente fuera de alcance con su motivo: Fase Z -> Tasks 3 y 4; datos reales
-> Task 5 (herramienta) y punto 8 (los datos); pantalla de administracion -> punto 1;
grafico plano -> Task 1; enlace de Consultas -> Task 2; notificaciones sin verificar ->
Task 6; pruebas con hardware -> puntos 6 y 7.

**Sin marcadores de posicion.** Ninguna tarea dice "por definir" ni "anadir manejo de
errores": cada paso trae el codigo o el comando exacto.

**Consistencia de nombres.** `ImportService.Resultado(imported, errors)` es el mismo
record que devuelven los dos endpoints nuevos y coincide en forma con el
`ImportResult(imported, errors)` que ya devuelve la importacion de estudiantes, de modo
que el frontend puede tratar los tres igual. `tokenDe(String, String)` se declara en la
Task 5 Step 2 y se usa en el Step 3. Las columnas de los CSV del Step 8 son las mismas
que parsea `ImportService`.

**Un riesgo que conviene decir en voz alta.** La Task 4 deja el `Dockerfile` sin
construir si no hay Docker en la maquina. Esta marcado como tal en su Step 5, pero
conviene no olvidarlo: hasta que la CI lo construya, ese fichero es una hipotesis
razonable, no un entregable verificado.
