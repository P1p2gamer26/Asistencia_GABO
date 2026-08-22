# Endurecimiento — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los cuatro defectos que encontró la auditoría del código, empezando por el más grave: hoy **ningún usuario puede cambiar su propia contraseña**.

**Architecture:** Se añade un endpoint de cambio de contraseña con una marca `must_change_password` que la aplicación obliga a resolver antes de dejar trabajar; se limita el ritmo de intentos de login con un contador en memoria (sin dependencias nuevas); se acota el tamaño del lote de sincronización; y se envuelve la interfaz en un límite de error para que un fallo de renderizado no deje la pantalla en blanco.

**Tech Stack:** Java 21, Spring Boot 3.4, PostgreSQL 16, Flyway, React 18, TypeScript, Vitest.

**Spec:** Auditoría del 22 de agosto de 2026, registrada en la sección 6.f de `docs/INFORME-FINAL.md`.

## Por qué estas cuatro y no otras

La auditoría midió el código antes de proponer nada. **La estructura está sana**: 2.199 líneas de Java, la clase más grande tiene 199, no hay `findAll()` trayendo tablas enteras a memoria, todos los controladores validan su entrada y hay 8 índices en la base. **No hay nada que reestructurar ni que reescribir.** Lo que sí hay son cuatro agujeros concretos:

1. **Nadie puede cambiar su contraseña.** Los 1.200 acudientes y los docentes quedan permanentemente en `cambiar123`, y el "restablecer" del administrador la deja en ese mismo valor conocido. La guía de despliegue dice "cambie las contraseñas antes que nada" y **no hay forma de hacerlo**. Es el defecto más serio del sistema.
2. **El login no limita intentos.** Con una contraseña por defecto conocida y pública en el repositorio, probar correos institucionales es trivial.
3. **El lote de sincronización no tiene tope.** Un cliente con el almacén local corrupto podría enviar cien mil registros, y cada uno abre su propia transacción.
4. **La interfaz no tiene límite de error.** Cualquier fallo de renderizado deja la pantalla en blanco. A un docente en mitad de clase le desaparece la aplicación; los datos están a salvo en el almacén local, pero él no lo sabe.

## Global Constraints

- **El proyecto vive en `app/`**: `app/backend`, `app/frontend`, `app/contracts`.
- **MVC clásico por capas** (`app/README.md`): el sufijo de la clase decide su paquete.
- **PostgreSQL 16 local.** Backend: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test`
- **Rango de versiones Flyway reservado: `V40`-`V49`.**
- **Ningún test puede mutar los datos de la semilla.** El contexto de Spring se comparte entre clases; la CI corre con `-Dsurefire.runOrder=random` para atrapar dependencias de orden.
- **Sin dependencias nuevas.** El limitador de intentos se hace con lo que ya hay; añadir una librería para contar hasta cinco no se justifica.
- **`tools/humo.sh` debe seguir pasando** contra la aplicación corriendo. Si un cambio rompe un invariante, es el cambio el que está mal.
- **Idioma:** identificadores en inglés, texto visible en español. Sin tildes ni letra eñe en nombres de ficheros, tablas, columnas ni campos JSON.
- **Commits:** Conventional Commits en español, terminando con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

```
app/backend/src/main/
├── resources/db/migration/V40__cambio_de_clave.sql   (nuevo)
├── java/co/edu/ggm/asistencia/
│   ├── model/User.java                    (modificar) mustChangePassword
│   ├── controller/AuthController.java     (modificar) cambio de clave + respuesta
│   ├── service/AuthService.java           (modificar) cambio de clave
│   ├── service/LoginAttemptService.java   (nuevo)    limitador de intentos
│   └── service/AdminUserService.java      (modificar) marcar al crear y restablecer
app/frontend/src/
├── components/LimiteDeError.tsx           (nuevo)
├── pages/CambiarClave.tsx                 (nuevo)
├── App.tsx                                (modificar) ruta y guardia
├── main.tsx                               (modificar) envolver en el limite
└── api/contract.ts                        (modificar) mustChangePassword
```

---

## Task 1: Cambio de contraseña propio y obligatorio en el primer acceso

**Files:**
- Create: `app/backend/src/main/resources/db/migration/V40__cambio_de_clave.sql`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/model/User.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/service/AdminUserService.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/controller/AuthController.java`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/user/CambioClaveTest.java`

**Interfaces:**
- Consumes: `UserRepository`, `PasswordEncoder`, `JwtService.currentUserId()`.
- Produces:
  - `POST /api/auth/change-password` (cualquier usuario autenticado), body `{"currentPassword":String,"newPassword":String}` -> `204` sin cuerpo. `401` si la actual no coincide, `400` si la nueva no cumple el mínimo.
  - La respuesta de `/api/auth/login` y `/api/auth/refresh` incluye ahora `"mustChangePassword": boolean`.

**Mínimo de la contraseña nueva: 8 caracteres, y distinta de la actual.** Nada de exigir mayúsculas y símbolos: en un colegio con acceso limitado a tecnología, esas reglas producen contraseñas apuntadas en un papel pegado al monitor. Ocho caracteres y que no sea la temporal es la línea correcta aquí.

- [ ] **Step 1: Escribir la migración `V40__cambio_de_clave.sql`**

```sql
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- Todos los usuarios existentes tienen la contrasena temporal conocida, que esta
-- ademas escrita en el repositorio. Se les obliga a cambiarla en el proximo acceso.
UPDATE users SET must_change_password = TRUE;

COMMENT ON COLUMN users.must_change_password IS
  'TRUE cuando la contrasena es la temporal: la aplicacion obliga a cambiarla antes de dejar trabajar.';
```

- [ ] **Step 2: Escribir el test (falla)**

```java
package co.edu.ggm.asistencia.user;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Estos tests crean su propio usuario (dominio @clavetest.co) y NO tocan la semilla:
 * cambiarle la contrasena a un usuario semilla rompe a las demas clases de test.
 */
@AutoConfigureMockMvc
class CambioClaveTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private static final String CORREO = "prueba@clavetest.co";

    private String crearYEntrar() throws Exception {
        mvc.perform(post("/api/admin/users").header("Authorization", tokenDe("admin@ggm.edu.co", "ADMIN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","fullName":"Persona De Prueba","role":"DOCENTE"}
                        """.formatted(CORREO)))
           .andExpect(status().isOk());
        return login(CORREO, "cambiar123");
    }

    private String login(String correo, String clave) throws Exception {
        String cuerpo = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"%s"}
                                """.formatted(correo, clave)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + cuerpo.replaceAll(".*\\"token\\":\\"([^\\"]+)\\".*", "$1");
    }

    private String cambio(String actual, String nueva) {
        return """
               {"currentPassword":"%s","newPassword":"%s"}
               """.formatted(actual, nueva);
    }

    @Test
    void un_usuario_nuevo_llega_obligado_a_cambiar_la_clave() throws Exception {
        crearYEntrar();
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"cambiar123"}
                                """.formatted(CORREO)))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.mustChangePassword").value(true));
    }

    @Test
    void cambiar_la_clave_funciona_y_quita_la_obligacion() throws Exception {
        String token = crearYEntrar();

        mvc.perform(post("/api/auth/change-password").header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cambio("cambiar123", "unaClaveNueva")))
           .andExpect(status().isNoContent());

        // La vieja ya no sirve
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"cambiar123"}
                                """.formatted(CORREO)))
           .andExpect(status().isUnauthorized());

        // La nueva si, y ya no obliga a cambiarla
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"unaClaveNueva"}
                                """.formatted(CORREO)))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.mustChangePassword").value(false));
    }

    @Test
    void no_se_puede_cambiar_sin_saber_la_actual() throws Exception {
        String token = crearYEntrar();
        mvc.perform(post("/api/auth/change-password").header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cambio("noEsLaActual", "unaClaveNueva")))
           .andExpect(status().isUnauthorized());
    }

    @Test
    void la_clave_nueva_debe_tener_al_menos_ocho_caracteres() throws Exception {
        String token = crearYEntrar();
        mvc.perform(post("/api/auth/change-password").header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cambio("cambiar123", "corta")))
           .andExpect(status().isBadRequest());
    }

    @Test
    void la_clave_nueva_no_puede_ser_igual_a_la_actual() throws Exception {
        String token = crearYEntrar();
        mvc.perform(post("/api/auth/change-password").header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cambio("cambiar123", "cambiar123")))
           .andExpect(status().isBadRequest());
    }

    @Test
    void sin_token_no_se_puede_cambiar_la_clave_de_nadie() throws Exception {
        mvc.perform(post("/api/auth/change-password").contentType(MediaType.APPLICATION_JSON)
                        .content(cambio("cambiar123", "unaClaveNueva")))
           .andExpect(status().isUnauthorized());
    }

    @Test
    void restablecer_desde_administracion_vuelve_a_obligar_el_cambio() throws Exception {
        String token = crearYEntrar();
        mvc.perform(post("/api/auth/change-password").header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(cambio("cambiar123", "unaClaveNueva"))).andExpect(status().isNoContent());

        Long id = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, CORREO);
        mvc.perform(post("/api/admin/users/" + id + "/reset-password")
                .header("Authorization", tokenDe("admin@ggm.edu.co", "ADMIN")))
           .andExpect(status().isOk());

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"cambiar123"}
                                """.formatted(CORREO)))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.mustChangePassword").value(true));
    }
}
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test -Dtest=CambioClaveTest`
Expected: FAIL — no existe `mustChangePassword` en la respuesta ni el endpoint `/api/auth/change-password`.

- [ ] **Step 4: Añadir el campo a `User`**

```java
    @Column(name = "must_change_password")
    private boolean mustChangePassword;
```

- [ ] **Step 5: Marcar la obligación al crear y al restablecer**

En `AdminUserService.create`, tras `u.setActive(true);`:

```java
        u.setMustChangePassword(true);
```

En `AdminUserService.resetPassword`, tras `u.setPasswordHash(encoder.encode(TEMPORAL));`:

```java
        u.setMustChangePassword(true);
```

- [ ] **Step 6: Añadir el cambio de contraseña a `AuthController`**

Añadir el record, el endpoint y el campo en `Session`:

```java
    public record Session(String token, String refreshToken, String role, String fullName,
                          Long userId, boolean mustChangePassword) {}

    public record ChangePasswordRequest(@NotBlank String currentPassword,
                                        @NotBlank String newPassword) {}

    @PostMapping("/change-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@Valid @RequestBody ChangePasswordRequest req) {
        User user = users.findById(JwtService.currentUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));

        if (!encoder.matches(req.currentPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "La contrasena actual no coincide");
        }
        if (req.newPassword().length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La contrasena nueva debe tener al menos 8 caracteres");
        }
        if (encoder.matches(req.newPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La contrasena nueva debe ser distinta de la actual");
        }

        user.setPasswordHash(encoder.encode(req.newPassword()));
        user.setMustChangePassword(false);
        users.save(user);
    }
```

Y en `sessionFor`, añadir el campo:

```java
    private Session sessionFor(User user) {
        String role = user.getRole().name();
        return new Session(jwt.issueAccess(user.getId(), role), jwt.issueRefresh(user.getId(), role),
                role, user.getFullName(), user.getId(), user.isMustChangePassword());
    }
```

Añadir los imports `org.springframework.web.bind.annotation.ResponseStatus` y `co.edu.ggm.asistencia.model.User` si faltan. `AuthController` necesita `UserRepository` y `PasswordEncoder` en el constructor; si ya los tiene, no duplicarlos.

`/api/auth/**` es público en `SecurityConfig`, así que `change-password` no exigiría token. Se resuelve porque el método llama a `JwtService.currentUserId()`, que lanza si no hay autenticación — y el test `sin_token_no_se_puede_cambiar_la_clave_de_nadie` lo comprueba. **Si ese test devuelve 500 en vez de 401**, hay que sacar la ruta del `permitAll` cambiándolo por `/api/auth/login`, `/api/auth/refresh` explícitos.

- [ ] **Step 7: Ejecutar los tests**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test`
Expected: PASS todo. Los tests que ya existían y comprueban el cuerpo del login siguen pasando porque solo se añadió un campo.

- [ ] **Step 8: Commit**

```bash
git add app/backend
git commit -m "feat: cambio de contrasena propio, obligatorio mientras sea la temporal

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Limitar los intentos de acceso

**Files:**
- Create: `app/backend/src/main/java/co/edu/ggm/asistencia/service/LoginAttemptService.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/controller/AuthController.java`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/user/IntentosLoginTest.java`

**Interfaces:**
- Consumes: nada externo.
- Produces: `LoginAttemptService.check(email)` lanza `429` si el correo está bloqueado; `fail(email)` cuenta un fallo; `success(email)` limpia el contador.

Cinco fallos bloquean ese correo quince minutos. Se cuenta **por correo y no por IP**: el colegio sale a internet por una sola conexión, así que bloquear por IP dejaría fuera a todo el mundo en cuanto un docente se equivocara cinco veces.

Sin dependencias: un `ConcurrentHashMap` con la hora del último fallo. Traer una librería de control de ritmo para contar hasta cinco sería más código de configuración que de lógica.

- [ ] **Step 1: Escribir el test (falla)**

```java
package co.edu.ggm.asistencia.user;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class IntentosLoginTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private void intento(String correo, String clave, int esperado) throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"%s"}
                                """.formatted(correo, clave)))
           .andExpect(status().is(esperado));
    }

    @Test
    void tras_cinco_fallos_el_correo_queda_bloqueado() throws Exception {
        String correo = "objetivo@intentostest.co";
        mvc.perform(post("/api/admin/users").header("Authorization", tokenDe("admin@ggm.edu.co", "ADMIN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","fullName":"Objetivo","role":"DOCENTE"}
                        """.formatted(correo))).andExpect(status().isOk());

        for (int i = 0; i < 5; i++) intento(correo, "incorrecta", 401);

        // El sexto ya no es 401 sino 429, y ni siquiera con la clave correcta entra.
        intento(correo, "incorrecta", 429);
        intento(correo, "cambiar123", 429);
    }

    @Test
    void un_acceso_correcto_limpia_el_contador() throws Exception {
        String correo = "limpia@intentostest.co";
        mvc.perform(post("/api/admin/users").header("Authorization", tokenDe("admin@ggm.edu.co", "ADMIN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","fullName":"Limpia","role":"DOCENTE"}
                        """.formatted(correo))).andExpect(status().isOk());

        for (int i = 0; i < 4; i++) intento(correo, "incorrecta", 401);
        intento(correo, "cambiar123", 200);
        // Tras entrar bien, vuelve a tener los cinco intentos completos.
        for (int i = 0; i < 5; i++) intento(correo, "incorrecta", 401);
    }

    @Test
    void bloquear_un_correo_no_bloquea_a_los_demas() throws Exception {
        String correo = "aislado@intentostest.co";
        for (int i = 0; i < 6; i++) intento(correo, "incorrecta", i < 5 ? 401 : 429);
        // Un docente distinto sigue pudiendo entrar: el bloqueo es por correo, no global.
        intento("fpalacios@ggm.edu.co", "cambiar123", 200);
    }
}
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test -Dtest=IntentosLoginTest`
Expected: FAIL — el sexto intento devuelve 401, no 429.

- [ ] **Step 3: Escribir `LoginAttemptService`**

```java
package co.edu.ggm.asistencia.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limita los intentos de acceso fallidos por correo.
 *
 * Se cuenta por correo y no por direccion IP a proposito: el colegio sale a internet
 * por una sola conexion, asi que bloquear por IP dejaria fuera a todo el mundo en
 * cuanto un docente se equivocara cinco veces.
 *
 * ponytail: contador en memoria. Si algun dia hay varias instancias del backend, cada
 * una contara por su cuenta y el limite efectivo se multiplica: entonces habria que
 * moverlo a la base o a una cache compartida.
 */
@Service
public class LoginAttemptService {

    private static final int MAXIMO = 5;
    private static final Duration BLOQUEO = Duration.ofMinutes(15);

    private record Intentos(int fallos, Instant ultimo) {}

    private final ConcurrentHashMap<String, Intentos> porCorreo = new ConcurrentHashMap<>();

    /** Lanza 429 si el correo esta bloqueado. Se llama ANTES de comprobar la clave. */
    public void check(String email) {
        Intentos i = porCorreo.get(clave(email));
        if (i == null || i.fallos() < MAXIMO) return;

        if (Duration.between(i.ultimo(), Instant.now()).compareTo(BLOQUEO) < 0) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Demasiados intentos fallidos. Intente de nuevo en unos minutos.");
        }
        porCorreo.remove(clave(email));   // ya paso el bloqueo
    }

    public void fail(String email) {
        porCorreo.merge(clave(email), new Intentos(1, Instant.now()),
                (viejo, nuevo) -> new Intentos(viejo.fallos() + 1, nuevo.ultimo()));
    }

    public void success(String email) {
        porCorreo.remove(clave(email));
    }

    private static String clave(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }
}
```

- [ ] **Step 4: Usarlo en `AuthController.login`**

Sustituir el cuerpo de `login` por:

```java
    @PostMapping("/login")
    public Session login(@Valid @RequestBody LoginRequest req) {
        String correo = req.email().trim().toLowerCase();
        intentos.check(correo);

        var user = users.findByEmailAndActiveTrue(correo)
                .filter(u -> encoder.matches(req.password(), u.getPasswordHash()));

        if (user.isEmpty()) {
            intentos.fail(correo);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credenciales invalidas");
        }
        intentos.success(correo);
        return sessionFor(user.get());
    }
```

Añadir `LoginAttemptService intentos` al constructor.

- [ ] **Step 5: Ejecutar los tests**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test`
Expected: PASS todo. **Si `AuthTest.login_con_password_incorrecta_devuelve_401` empieza a fallar con 429**, es porque el contador sobrevive entre clases de test: añadir a `IntentosLoginTest` un `@AfterEach` que llame a `intentos.success(...)` de los correos que uso, o inyectar el servicio y limpiarlo.

- [ ] **Step 6: Commit**

```bash
git add app/backend
git commit -m "feat: limitar los intentos de acceso fallidos por correo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Acotar el tamaño del lote de sincronización

**Files:**
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/controller/AttendanceController.java`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/attendance/SyncTest.java`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `POST /api/attendance/sync` responde `400` si el lote trae más de 500 registros.

Un curso son 40 estudiantes; una jornada completa de un docente, unos 240 registros. **500 deja holgura de sobra** para un docente que estuvo una semana sin señal, y ataja el caso de un almacén local corrupto que intente enviar cien mil, donde cada registro abre su propia transacción.

- [ ] **Step 1: Añadir el test a `SyncTest`**

```java
    @Test
    void un_lote_desmesurado_se_rechaza_en_vez_de_intentar_procesarlo() throws Exception {
        StringBuilder registros = new StringBuilder();
        for (int i = 0; i < 501; i++) {
            if (i > 0) registros.append(',');
            registros.append("""
                {"id":"%s","studentId":1,"scheduleBlockId":1,"classDate":"2026-04-06",
                 "status":"P","recordedAt":"2026-04-06T11:30:00Z"}
                """.formatted(new java.util.UUID(0L, i).toString()));
        }
        mvc.perform(post("/api/attendance/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\\"records\\":[" + registros + "]}"))
           .andExpect(status().isBadRequest());
    }

    @Test
    void un_lote_grande_pero_razonable_se_acepta() throws Exception {
        StringBuilder registros = new StringBuilder();
        for (int i = 0; i < 40; i++) {
            if (i > 0) registros.append(',');
            registros.append("""
                {"id":"%s","studentId":1,"scheduleBlockId":1,"classDate":"2026-04-09",
                 "status":"P","recordedAt":"2026-04-09T11:30:00Z"}
                """.formatted(new java.util.UUID(7L, i).toString()));
        }
        mvc.perform(post("/api/attendance/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\\"records\\":[" + registros + "]}"))
           .andExpect(status().isOk());
    }
```

El segundo test comprueba que el límite no estorba al uso normal. Un límite que rompe el caso real es peor que no tenerlo.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test -Dtest=SyncTest`
Expected: FAIL en el primero — el lote de 501 se procesa y devuelve 200.

- [ ] **Step 3: Poner el límite**

En `AttendanceController`, cambiar el record de la petición:

```java
    /**
     * 500 registros: un curso son 40 estudiantes y una jornada completa unos 240.
     * Deja holgura para un docente que estuvo una semana sin senal, y ataja el caso
     * de un almacen local corrupto, donde cada registro abre su propia transaccion.
     */
    public record SyncRequest(@NotEmpty @Size(max = 500) List<RecordDto> records) {}
```

Añadir el import `jakarta.validation.constraints.Size`.

- [ ] **Step 4: Ejecutar los tests**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test`
Expected: PASS todo.

- [ ] **Step 5: Commit**

```bash
git add app/backend
git commit -m "fix: el lote de sincronizacion no tenia tope de tamano

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Límite de error y pantalla de cambio de contraseña en la interfaz

**Files:**
- Create: `app/frontend/src/components/LimiteDeError.tsx`
- Create: `app/frontend/src/pages/CambiarClave.tsx`
- Modify: `app/frontend/src/main.tsx`
- Modify: `app/frontend/src/App.tsx`
- Modify: `app/frontend/src/api/contract.ts`
- Test: `app/frontend/src/components/LimiteDeError.test.tsx`
- Test: `app/frontend/src/pages/CambiarClave.test.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/change-password` (Task 1), `Session.mustChangePassword`.
- Produces: ruta `/cambiar-clave` y un límite de error que envuelve toda la aplicación.

Hoy cualquier fallo de renderizado deja la pantalla en blanco. A un docente en mitad de clase le desaparece la aplicación sin explicación; **sus datos siguen a salvo en el almacén local, pero él no lo sabe** y va a asumir que perdió la asistencia de la mañana. Decírselo es la mitad del arreglo.

- [ ] **Step 1: Añadir el campo al contrato**

En `app/frontend/src/api/contract.ts`, dentro de `Session`:

```ts
  mustChangePassword: boolean;
```

- [ ] **Step 2: Escribir el test del límite de error**

```tsx
import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import LimiteDeError from './LimiteDeError';

function Explota(): JSX.Element {
  throw new Error('fallo de renderizado');
}

describe('LimiteDeError', () => {
  // React escribe el error en consola aunque lo capturemos; se silencia para que la
  // salida de los tests no parezca rota.
  let spy: ReturnType<typeof vi.spyOn>;
  beforeAll(() => { spy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterAll(() => { spy.mockRestore(); });

  it('deja pasar a los hijos cuando no hay error', () => {
    render(<LimiteDeError><p>contenido normal</p></LimiteDeError>);
    expect(screen.getByText('contenido normal')).toBeInTheDocument();
  });

  it('ante un fallo muestra un mensaje en vez de dejar la pantalla en blanco', () => {
    render(<LimiteDeError><Explota /></LimiteDeError>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('le dice al docente que su asistencia no se perdio', () => {
    render(<LimiteDeError><Explota /></LimiteDeError>);
    // Es lo que mas necesita saber en ese momento.
    expect(screen.getByRole('alert')).toHaveTextContent(/no se perdio|guardada/i);
  });

  it('ofrece recargar', () => {
    render(<LimiteDeError><Explota /></LimiteDeError>);
    expect(screen.getByRole('button', { name: /recargar/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Escribir `LimiteDeError.tsx`**

Tiene que ser un componente de clase: React solo permite capturar errores de renderizado con `componentDidCatch`, no hay equivalente con hooks.

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { fallo: boolean };

/**
 * Captura los errores de renderizado para que un fallo no deje la pantalla en blanco.
 * Tiene que ser un componente de clase: no hay equivalente con hooks.
 */
export default class LimiteDeError extends Component<Props, State> {
  state: State = { fallo: false };

  static getDerivedStateFromError(): State {
    return { fallo: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Fallo de renderizado:', error, info.componentStack);
  }

  render() {
    if (!this.state.fallo) return this.props.children;

    return (
      <main className="card">
        <h1>Algo fallo en la aplicacion</h1>
        <p role="alert">
          <strong>La asistencia que ya marco no se perdio</strong>: esta guardada en el
          telefono y se enviara sola cuando vuelva a abrir la aplicacion.
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Recargar la aplicacion
        </button>
      </main>
    );
  }
}
```

- [ ] **Step 4: Envolver la aplicación en `main.tsx`**

Rodear `<App />` con `<LimiteDeError>`, **por dentro** de `<BrowserRouter>` para que el botón de recargar funcione con la ruta actual:

```tsx
    <BrowserRouter>
      <LimiteDeError>
        <App />
      </LimiteDeError>
    </BrowserRouter>
```

- [ ] **Step 5: Escribir el test de la pantalla de cambio**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CambiarClave from './CambiarClave';

describe('CambiarClave', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'DOCENTE',
      fullName: 'Francisco Palacios', userId: 3, mustChangePassword: true,
    }));
  });

  it('avisa si las dos claves nuevas no coinciden, sin llamar al servidor', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    render(<CambiarClave />);

    await userEvent.type(screen.getByLabelText(/actual/i), 'cambiar123');
    await userEvent.type(screen.getByLabelText(/^nueva/i), 'unaClaveNueva');
    await userEvent.type(screen.getByLabelText(/repetir/i), 'otraDistinta');
    await userEvent.click(screen.getByRole('button', { name: /cambiar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no coinciden/i);
    expect(f).not.toHaveBeenCalled();
  });

  it('avisa si la nueva es demasiado corta, sin llamar al servidor', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    render(<CambiarClave />);

    await userEvent.type(screen.getByLabelText(/actual/i), 'cambiar123');
    await userEvent.type(screen.getByLabelText(/^nueva/i), 'corta');
    await userEvent.type(screen.getByLabelText(/repetir/i), 'corta');
    await userEvent.click(screen.getByRole('button', { name: /cambiar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/8 caracteres/i);
    expect(f).not.toHaveBeenCalled();
  });

  it('con datos correctos manda el cambio al servidor', async () => {
    const f = vi.fn(async () => new Response('', { status: 204 }));
    vi.stubGlobal('fetch', f);
    render(<CambiarClave />);

    await userEvent.type(screen.getByLabelText(/actual/i), 'cambiar123');
    await userEvent.type(screen.getByLabelText(/^nueva/i), 'unaClaveNueva');
    await userEvent.type(screen.getByLabelText(/repetir/i), 'unaClaveNueva');
    await userEvent.click(screen.getByRole('button', { name: /cambiar/i }));

    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(String(f.mock.calls[0][0])).toContain('/api/auth/change-password');
  });

  it('si el servidor dice que la actual no coincide, lo muestra', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    render(<CambiarClave />);

    await userEvent.type(screen.getByLabelText(/actual/i), 'equivocada');
    await userEvent.type(screen.getByLabelText(/^nueva/i), 'unaClaveNueva');
    await userEvent.type(screen.getByLabelText(/repetir/i), 'unaClaveNueva');
    await userEvent.click(screen.getByRole('button', { name: /cambiar/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/actual/i));
  });
});
```

- [ ] **Step 6: Escribir `CambiarClave.tsx`**

```tsx
import { useState } from 'react';
import { api, getSession, clearSession } from '../api/client';

export default function CambiarClave() {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Se comprueba antes de llamar: sin conexion, el aviso llega igual y al instante.
    if (nueva !== repetir) { setError('Las dos contrasenas nuevas no coinciden.'); return; }
    if (nueva.length < 8) { setError('La contrasena nueva debe tener al menos 8 caracteres.'); return; }
    if (nueva === actual) { setError('La contrasena nueva debe ser distinta de la actual.'); return; }

    setEnviando(true);
    try {
      await api.post('/api/auth/change-password',
        { currentPassword: actual, newPassword: nueva });
      setListo(true);
    } catch {
      setError('No se pudo cambiar. Revise que la contrasena actual sea correcta.');
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <main className="card">
        <h1>Contrasena cambiada</h1>
        <p>Vuelva a entrar con su contrasena nueva.</p>
        <button type="button" onClick={() => { clearSession(); location.href = '/login'; }}>
          Entrar de nuevo
        </button>
      </main>
    );
  }

  return (
    <main className="card">
      <h1>Cambie su contrasena</h1>
      <p className="meta">
        {getSession()?.mustChangePassword
          ? 'Su contrasena es la temporal que le asignaron. Cambiela para continuar.'
          : 'Escriba su contrasena actual y la nueva.'}
      </p>
      <form className="login" onSubmit={enviar}>
        <label htmlFor="actual">Contrasena actual</label>
        <input id="actual" type="password" autoComplete="current-password" required
               value={actual} onChange={(e) => setActual(e.target.value)} />
        <label htmlFor="nueva">Nueva contrasena</label>
        <input id="nueva" type="password" autoComplete="new-password" required
               value={nueva} onChange={(e) => setNueva(e.target.value)} />
        <label htmlFor="repetir">Repetir la nueva</label>
        <input id="repetir" type="password" autoComplete="new-password" required
               value={repetir} onChange={(e) => setRepetir(e.target.value)} />
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Cambiando...' : 'Cambiar contrasena'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: Enrutar y obligar el cambio en `App.tsx`**

Importar `CambiarClave` y añadir la ruta:

```tsx
      <Route path="/cambiar-clave" element={<Protegida><CambiarClave /></Protegida>} />
```

Y en `Protegida`, desviar a quien tenga la contraseña temporal:

```tsx
function Protegida({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  // Con la contrasena temporal no se puede hacer nada mas que cambiarla.
  if (session.mustChangePassword && location.pathname !== '/cambiar-clave') {
    return <Navigate to="/cambiar-clave" replace />;
  }
  return <>{children}</>;
}
```

Hacer lo mismo en `SoloRoles` y en `Inicio`, que también leen la sesión. **Ojo con el bucle**: la ruta `/cambiar-clave` usa `Protegida`, así que la comprobación de la ruta actual es lo que impide que se redirija a sí misma infinitamente. El test de humo lo detectaría como un fallo de carga.

- [ ] **Step 8: Ejecutar los tests del frontend**

Run: `cd app/frontend && npm test && npm run build`
Expected: PASS todo (unos 58 tests) y el paquete por debajo de 200 KB gzip.

- [ ] **Step 9: Comprobar a mano el flujo completo**

Con el backend levantado y `npm run dev`:
1. Entrar como `fpalacios@ggm.edu.co` / `cambiar123` → debe llevar directo a cambiar la contraseña, sin poder ir a otra pantalla.
2. Cambiarla por una de 8 caracteres o más → pide entrar de nuevo.
3. Entrar con la nueva → ahora sí llega al menú.
4. Fallar cinco veces con otro usuario → el sexto intento responde "Demasiados intentos".

- [ ] **Step 10: Ejecutar la prueba de humo**

Run: `bash tools/humo.sh http://localhost:8080`
Expected: todos los invariantes se mantienen. **El script usa `cambiar123` para entrar**, así que si en el paso anterior se cambió la contraseña de `fpalacios`, hay que volver a dejarla como estaba o usar una base limpia. Es un efecto secundario esperado del cambio, no un fallo.

- [ ] **Step 11: Commit**

```bash
git add app/frontend
git commit -m "feat: limite de error y pantalla de cambio de contrasena

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Actualizar la documentación y la prueba de humo

**Files:**
- Modify: `tools/humo.sh`
- Modify: `docs/DESPLIEGUE.md`
- Modify: `app/contracts/api.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: documentación que refleja el sistema real.

- [ ] **Step 1: Añadir los invariantes nuevos a `tools/humo.sh`**

Antes del bloque de resultado:

```bash
# --- Endurecimiento -----------------------------------------------------------
comprobar "sin token no se cambia la clave de nadie" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/change-password" \
     -H 'Content-Type: application/json' \
     -d '{"currentPassword":"x","newPassword":"yyyyyyyy"}')"

LOTE_ENORME=$(python -c "
import json
print(json.dumps({'records': [{'id': f'00000000-0000-4000-8000-{i:012d}', 'studentId': 1,
  'scheduleBlockId': 1, 'classDate': '2026-04-06', 'status': 'P',
  'recordedAt': '2026-04-06T11:30:00Z'} for i in range(501)]}))")
comprobar "un lote desmesurado se rechaza" "400" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/attendance/sync" \
     -H "$AUTH" -H 'Content-Type: application/json' -d "$LOTE_ENORME")"
```

**No añadir aquí la comprobación del bloqueo por intentos**: dejaría el correo de la
semilla bloqueado quince minutos y las comprobaciones siguientes fallarían. Esa regla
ya la cubren los tests de integración, que trabajan sobre usuarios propios.

- [ ] **Step 2: Ejecutar la prueba de humo**

Run: levantar la aplicación y `bash tools/humo.sh http://localhost:8080`
Expected: todos los invariantes se mantienen, ahora 17.

- [ ] **Step 3: Actualizar `docs/DESPLIEGUE.md`**

Sustituir el párrafo de la primera puesta en marcha que habla de cambiar las
contraseñas, por:

```markdown
**Lo primero, antes que nada:** entrar como `admin@ggm.edu.co` con la contraseña
`cambiar123`. La aplicación **obligará a cambiarla** antes de dejar hacer nada más,
igual que a todos los usuarios que se creen después. No hay forma de saltarse ese paso,
que es justo lo que se quiere: la contraseña temporal está escrita en este repositorio.
```

Y añadir a la lista de comprobaciones posteriores:

```markdown
6. Entrar con un usuario recién creado y comprobar que obliga a cambiar la contraseña.
7. Fallar cinco veces el acceso a propósito y comprobar que el sexto intento responde
   "Demasiados intentos". El bloqueo dura quince minutos y es por correo, no por
   conexión: el colegio sale a internet por una sola, y bloquear por dirección dejaría
   fuera a todo el mundo.
```

- [ ] **Step 4: Actualizar `app/contracts/api.md`**

En la sección Auth:

```markdown
POST /auth/login    {email, password} -> {token, refreshToken, role, fullName, userId, mustChangePassword}
                    429 si el correo acumula 5 fallos (bloqueo de 15 minutos)
POST /auth/refresh  {refreshToken}    -> igual que login
POST /auth/change-password  {currentPassword, newPassword} -> 204
                    401 si la actual no coincide; 400 si la nueva tiene menos de 8
                    caracteres o es igual a la actual
```

Y en las reglas transversales:

```markdown
- `POST /attendance/sync` acepta como maximo 500 registros por lote.
```

- [ ] **Step 5: Commit**

```bash
git add tools docs app/contracts
git commit -m "docs: reflejar el endurecimiento en la guia, el contrato y la prueba de humo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Fuera de alcance

Lo que la auditoría **decidió no hacer**, con su motivo. Vale tanto como lo que sí:

1. **Reestructurar el código.** 2.199 líneas de Java, la clase más grande tiene 199, sin métodos gigantes ni duplicación. Mover código sano de sitio es riesgo sin beneficio.
2. **Añadir una librería de control de ritmo** (bucket4j y similares). Contar hasta cinco no justifica una dependencia con su configuración.
3. **Recuperación de contraseña por correo.** Requiere plantillas, tokens de un solo uso y decidir qué pasa cuando el correo no llega. El administrador restableciendo desde su pantalla resuelve el caso real de un colegio de 1.200 estudiantes.
4. **Doble factor.** Desproporcionado para el contexto: docentes con teléfonos modestos y conexión intermitente.
5. **Auditoría de cambios administrativos** (quién desactivó a quién y cuándo). Útil, pero es una tabla y una pantalla nuevas: merece su propio plan.
6. **Caché de consultas del tablero.** El agregado en SQL tarda milisegundos con el volumen real. Optimizar antes de medir es el error clásico.
7. **Paginación en el listado de usuarios.** Con ~1.300 usuarios el listado completo son unos 100 KB. Cuando moleste, se pagina; hoy no molesta.

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El limitador vive en memoria | Con varias instancias, el límite efectivo se multiplica por el número de instancias | Anotado en el código con su camino de salida; hoy hay una sola instancia |
| `tools/humo.sh` entra con `cambiar123` | Si alguien cambia esa contraseña en la instancia de prueba, la prueba de humo falla | Documentado en el Step 10 de la Task 4; la CI parte siempre de una base limpia |
| Obligar el cambio puede dejar un bucle de redirección | La aplicación no cargaría | La comprobación de la ruta actual lo impide, y la prueba de humo lo detectaría |
| La migración marca a **todos** los usuarios existentes | Todos deben cambiar la contraseña en el próximo acceso | Es deliberado: todos tienen hoy la temporal conocida |

## Self-review

**Cobertura.** Los cuatro hallazgos de la auditoría tienen tarea: cambio de contraseña (Task 1), intentos de acceso (Task 2), tamaño del lote (Task 3), límite de error (Task 4). La documentación se pone al día en la Task 5. Lo que no se hace está en "Fuera de alcance" con su motivo.

**Sin marcadores de posición.** Cada paso trae el código o el comando exacto.

**Consistencia.** `Session` gana un campo `mustChangePassword` y se actualiza en los tres sitios que lo tocan: el record del controlador, `sessionFor` y `contract.ts`. `LoginAttemptService.check/fail/success` se declara en la Task 2 Step 3 y se usa en el Step 4. El límite de 500 aparece igual en el test, en la anotación y en el contrato.

**Un punto frágil que conviene vigilar.** La Task 2 introduce estado compartido entre tests: el contador de intentos vive en el contexto de Spring, que se comparte entre clases. Si `AuthTest` empieza a devolver 429 en vez de 401, es por eso, y está anotado en su Step 5. Es exactamente el tipo de dependencia de orden que ya nos mordió una vez.
