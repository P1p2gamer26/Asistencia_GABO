# Pantalla de Administración — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el colegio administre usuarios, calendario y carga de datos desde la aplicación, sin depender de `curl` ni de SQL.

**Architecture:** Se completa la API de administración que hoy solo cubre importación (altas y bajas de usuarios, reseteo de contraseña) y se construye una pantalla `/admin` con tres pestañas —Usuarios, Calendario y Carga de datos— reutilizando los endpoints que ya existen para calendario e importación. Solo rol `ADMIN`, salvo el calendario que también acepta `COORDINADOR`, igual que hoy en la API.

**Tech Stack:** Java 21, Spring Boot 3.4, PostgreSQL 16, Flyway, React 18, TypeScript, Vite.

**Spec:** `docs/INFORME-FINAL.md` sección 7 (primer punto de "requieren su propio plan") y `app/README.md`.

## Global Constraints

- **El proyecto vive en `app/`**: `app/backend`, `app/frontend`, `app/contracts`.
- **MVC clásico por capas**, descrito en `app/README.md`: el sufijo de la clase decide su paquete — `*Controller` a `controller/`, `*Service` y `*Job` a `service/`, `*Repository` a `repository/`, `*Config` y `*Filter` a `config/`, el resto a `model/`. **No crear paquetes por funcionalidad.**
- **PostgreSQL 16 local.** Backend: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test`
- **Rango de versiones Flyway reservado: `V40`-`V49`.**
- **Ningún test puede mutar los datos de la semilla** (`V3__datos_semilla.sql`). El contexto de Spring se comparte entre clases y la base se limpia una sola vez por corrida: un test que le cambia el curso a un estudiante de la semilla o le añade bloques a su docente rompe a otras clases según el orden de ejecución. Cada test usa sus propios documentos y correos. La CI corre con `-Dsurefire.runOrder=random` justamente para atrapar esto.
- **Nunca `hibernate.jdbc.time_zone`**: desplazaba los `LocalTime` cinco horas. Hay test de regresión.
- **Contraseña de los usuarios semilla:** `cambiar123`, hash BCrypt `$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu`. **No usar el hash de ejemplo de la documentación de Spring Security**, que es de `password`.
- **Sin librerías de UI ni de gráficas.** Paquete inicial por debajo de 200 KB gzip.
- **Idioma:** identificadores en inglés, texto visible en español. Sin tildes ni letra eñe en nombres de ficheros, tablas, columnas ni campos JSON.
- **`origin` es `P1p2gamer26/Asistencia_GABO` (privado).** `upstream` es el repo ajeno del que se clonó y tiene el push deshabilitado.
- **Commits:** Conventional Commits en español, terminando con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

```
app/backend/src/main/java/co/edu/ggm/asistencia/
├── controller/AdminUserController.java   (nuevo) altas, bajas, listado, reseteo
├── service/AdminUserService.java         (nuevo) reglas de negocio de usuarios
└── repository/UserRepository.java        (modificar) listado y busqueda
app/frontend/src/
├── pages/Admin.tsx                       (nuevo) contenedor con tres pestanas
├── components/admin/PanelUsuarios.tsx    (nuevo)
├── components/admin/PanelCalendario.tsx  (nuevo)
├── components/admin/PanelCarga.tsx       (nuevo)
└── App.tsx                               (modificar) ruta /admin
```

---

## Task 1: API de administración de usuarios

**Files:**
- Create: `app/backend/src/main/java/co/edu/ggm/asistencia/service/AdminUserService.java`
- Create: `app/backend/src/main/java/co/edu/ggm/asistencia/controller/AdminUserController.java`
- Modify: `app/backend/src/main/java/co/edu/ggm/asistencia/repository/UserRepository.java`
- Test: `app/backend/src/test/java/co/edu/ggm/asistencia/admin/AdminUserTest.java`

**Interfaces:**
- Consumes: tabla `users`, `JwtService` de `co.edu.ggm.asistencia.service`.
- Produces (todos rol `ADMIN`):
  - `GET /api/admin/users?role=&query=` -> `[{"id":Long,"email":String,"fullName":String,"role":String,"active":boolean}]`
  - `POST /api/admin/users` body `{"email","fullName","role"}` -> el usuario creado, con contraseña temporal `cambiar123`.
  - `PUT /api/admin/users/{id}` body `{"fullName","role","active"}` -> el usuario actualizado.
  - `POST /api/admin/users/{id}/reset-password` -> `{"temporaryPassword":"cambiar123"}`.

**Las bajas son lógicas, no borrados.** Poner `active = false` en vez de `DELETE`: un docente tiene asistencias con su `recorded_by`, y borrarlo rompería la trazabilidad de quién marcó qué. Además el colegio se equivoca y necesita poder revertir.

- [ ] **Step 1: Escribir el test que falla**

```java
package co.edu.ggm.asistencia.admin;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Estos tests crean sus propios usuarios (sufijo .admintest) y NO tocan los de la
 * semilla: mutarlos rompe a otras clases segun el orden de ejecucion.
 */
@AutoConfigureMockMvc
class AdminUserTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private String admin() { return tokenDe("admin@ggm.edu.co", "ADMIN"); }

    private String crear(String email, String rol) {
        return """
               {"email":"%s","fullName":"Persona De Prueba","role":"%s"}
               """.formatted(email, rol);
    }

    @Test
    void crea_un_docente_con_contrasena_temporal_y_puede_entrar_con_ella() throws Exception {
        mvc.perform(post("/api/admin/users").header("Authorization", admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(crear("nuevo.docente@admintest.co", "DOCENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.email").value("nuevo.docente@admintest.co"))
           .andExpect(jsonPath("$.role").value("DOCENTE"))
           .andExpect(jsonPath("$.active").value(true));

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nuevo.docente@admintest.co\",\"password\":\"cambiar123\"}"))
           .andExpect(status().isOk());
    }

    @Test
    void no_permite_dos_usuarios_con_el_mismo_correo() throws Exception {
        mvc.perform(post("/api/admin/users").header("Authorization", admin())
                .contentType(MediaType.APPLICATION_JSON)
                .content(crear("repetido@admintest.co", "DOCENTE"))).andExpect(status().isOk());

        mvc.perform(post("/api/admin/users").header("Authorization", admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(crear("repetido@admintest.co", "DOCENTE")))
           .andExpect(status().isConflict());
    }

    @Test
    void desactivar_a_alguien_le_impide_entrar_pero_no_lo_borra() throws Exception {
        String cuerpo = mvc.perform(post("/api/admin/users").header("Authorization", admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(crear("baja@admintest.co", "DOCENTE")))
                .andReturn().getResponse().getContentAsString();
        long id = Long.parseLong(cuerpo.replaceAll(".*\"id\":(\\d+).*", "$1"));

        mvc.perform(put("/api/admin/users/" + id).header("Authorization", admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fullName\":\"Persona De Prueba\",\"role\":\"DOCENTE\",\"active\":false}"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.active").value(false));

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"baja@admintest.co\",\"password\":\"cambiar123\"}"))
           .andExpect(status().isUnauthorized());

        // Sigue existiendo: la baja es logica, para no romper la trazabilidad.
        assertThat(jdbcBase.queryForObject(
                "SELECT count(*) FROM users WHERE email = 'baja@admintest.co'",
                Integer.class)).isEqualTo(1);
    }

    @Test
    void el_listado_filtra_por_rol() throws Exception {
        mvc.perform(post("/api/admin/users").header("Authorization", admin())
                .contentType(MediaType.APPLICATION_JSON)
                .content(crear("coordi@admintest.co", "COORDINADOR"))).andExpect(status().isOk());

        mvc.perform(get("/api/admin/users").param("role", "COORDINADOR")
                        .header("Authorization", admin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.email=='coordi@admintest.co')]").exists())
           .andExpect(jsonPath("$[?(@.role=='DOCENTE')]").doesNotExist());
    }

    @Test
    void reset_de_contrasena_deja_entrar_con_la_temporal() throws Exception {
        String cuerpo = mvc.perform(post("/api/admin/users").header("Authorization", admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(crear("olvidadiza@admintest.co", "DOCENTE")))
                .andReturn().getResponse().getContentAsString();
        long id = Long.parseLong(cuerpo.replaceAll(".*\"id\":(\\d+).*", "$1"));

        mvc.perform(post("/api/admin/users/" + id + "/reset-password")
                        .header("Authorization", admin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.temporaryPassword").value("cambiar123"));

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"olvidadiza@admintest.co\",\"password\":\"cambiar123\"}"))
           .andExpect(status().isOk());
    }

    @Test
    void un_coordinador_no_puede_administrar_usuarios() throws Exception {
        mvc.perform(get("/api/admin/users")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR")))
           .andExpect(status().isForbidden());
    }
}
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test -Dtest=AdminUserTest`
Expected: FAIL con 404 en `/api/admin/users`.

- [ ] **Step 3: Ampliar `UserRepository`**

```java
    java.util.List<User> findByRoleOrderByFullName(Role role);

    java.util.List<User> findAllByOrderByFullName();

    boolean existsByEmail(String email);
```

- [ ] **Step 4: Escribir `AdminUserService`**

```java
package co.edu.ggm.asistencia.service;

import co.edu.ggm.asistencia.model.Role;
import co.edu.ggm.asistencia.model.User;
import co.edu.ggm.asistencia.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class AdminUserService {

    /** Contrasena con la que nace un usuario y a la que vuelve tras un reseteo. */
    public static final String TEMPORAL = "cambiar123";

    private final UserRepository users;
    private final PasswordEncoder encoder;

    public AdminUserService(UserRepository users, PasswordEncoder encoder) {
        this.users = users; this.encoder = encoder;
    }

    public List<User> list(Role role, String query) {
        List<User> base = role == null ? users.findAllByOrderByFullName()
                                       : users.findByRoleOrderByFullName(role);
        if (query == null || query.isBlank()) return base;
        String q = query.trim().toLowerCase();
        return base.stream()
                .filter(u -> u.getFullName().toLowerCase().contains(q)
                          || u.getEmail().toLowerCase().contains(q))
                .toList();
    }

    @Transactional
    public User create(String email, String fullName, Role role) {
        String correo = email.trim().toLowerCase();
        if (users.existsByEmail(correo)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe un usuario con ese correo");
        }
        User u = new User();
        u.setEmail(correo);
        u.setFullName(fullName.trim());
        u.setRole(role);
        u.setActive(true);
        u.setPasswordHash(encoder.encode(TEMPORAL));
        return users.save(u);
    }

    @Transactional
    public User update(Long id, String fullName, Role role, boolean active) {
        User u = users.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No existe ese usuario"));
        u.setFullName(fullName.trim());
        u.setRole(role);
        u.setActive(active);
        return users.save(u);
    }

    @Transactional
    public String resetPassword(Long id) {
        User u = users.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No existe ese usuario"));
        u.setPasswordHash(encoder.encode(TEMPORAL));
        users.save(u);
        return TEMPORAL;
    }
}
```

- [ ] **Step 5: Escribir `AdminUserController`**

```java
package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.model.Role;
import co.edu.ggm.asistencia.model.User;
import co.edu.ggm.asistencia.service.AdminUserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserController {

    private final AdminUserService service;

    public AdminUserController(AdminUserService service) { this.service = service; }

    public record UserDto(Long id, String email, String fullName, String role, boolean active) {
        static UserDto de(User u) {
            return new UserDto(u.getId(), u.getEmail(), u.getFullName(), u.getRole().name(), u.isActive());
        }
    }
    public record CreateRequest(@Email @NotBlank String email, @NotBlank String fullName,
                                @NotNull Role role) {}
    public record UpdateRequest(@NotBlank String fullName, @NotNull Role role, boolean active) {}
    public record ResetResponse(String temporaryPassword) {}

    @GetMapping
    public List<UserDto> list(@RequestParam(required = false) Role role,
                              @RequestParam(required = false) String query) {
        return service.list(role, query).stream().map(UserDto::de).toList();
    }

    @PostMapping
    public UserDto create(@Valid @RequestBody CreateRequest req) {
        return UserDto.de(service.create(req.email(), req.fullName(), req.role()));
    }

    @PutMapping("/{id}")
    public UserDto update(@PathVariable Long id, @Valid @RequestBody UpdateRequest req) {
        return UserDto.de(service.update(id, req.fullName(), req.role(), req.active()));
    }

    @PostMapping("/{id}/reset-password")
    public ResetResponse reset(@PathVariable Long id) {
        return new ResetResponse(service.resetPassword(id));
    }
}
```

- [ ] **Step 6: Ejecutar los tests**

Run: `cd app/backend && TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test -Dtest=AdminUserTest`
Expected: PASS los seis.

- [ ] **Step 7: Ejecutar la suite completa en dos órdenes**

Run:
```
cd app/backend
TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test -Dsurefire.runOrder=alphabetical
TEST_DB_URL=jdbc:postgresql://localhost:5432/asistencia_test TEST_DB_USER=postgres TEST_DB_PASSWORD=postgres mvn -B test -Dsurefire.runOrder=reversealphabetical
```
Expected: PASS en los dos. Si uno falla, algún test nuevo está mutando la semilla.

- [ ] **Step 8: Commit**

```bash
git add app/backend
git commit -m "feat: API de administracion de usuarios con baja logica y reseteo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Pantalla de administración

**Files:**
- Create: `app/frontend/src/pages/Admin.tsx`
- Create: `app/frontend/src/components/admin/PanelUsuarios.tsx`
- Create: `app/frontend/src/components/admin/PanelCalendario.tsx`
- Create: `app/frontend/src/components/admin/PanelCarga.tsx`
- Modify: `app/frontend/src/App.tsx`
- Modify: `app/frontend/src/pages/Home.tsx`
- Modify: `app/frontend/src/api/contract.ts`
- Modify: `app/frontend/src/styles.css`

**Interfaces:**
- Consumes: `GET/POST/PUT /api/admin/users` (Task 1), `GET/PUT /api/calendar/school-days`, `POST /api/admin/import/{students,schedule,guardians}`.
- Produces: ruta `/admin`, solo `ADMIN`.

Tres pestañas y nada más. Es una pantalla que se usa dos veces al año (al matricular y al armar horarios) más los días sueltos que hay que suspender: no merece un panel elaborado, merece ser obvia.

- [ ] **Step 1: Añadir los tipos al contrato**

En `app/frontend/src/api/contract.ts`:

```ts
export type AdminUser = {
  id: number; email: string; fullName: string; role: Role; active: boolean;
};
export type ImportResult = { imported: number; errors: string[] };
```

- [ ] **Step 2: Escribir `PanelUsuarios.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { AdminUser, Role } from '../../api/contract';

const ROLES: Role[] = ['ADMIN', 'COORDINADOR', 'DOCENTE', 'ACUDIENTE'];

export default function PanelUsuarios() {
  const [usuarios, setUsuarios] = useState<AdminUser[]>([]);
  const [filtro, setFiltro] = useState<Role | ''>('');
  const [busqueda, setBusqueda] = useState('');
  const [nuevo, setNuevo] = useState({ email: '', fullName: '', role: 'DOCENTE' as Role });
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  async function cargar() {
    setError('');
    const q = [filtro && `role=${filtro}`, busqueda && `query=${encodeURIComponent(busqueda)}`]
      .filter(Boolean).join('&');
    try {
      setUsuarios(await api.get<AdminUser[]>(`/api/admin/users${q ? `?${q}` : ''}`));
    } catch {
      setError('No se pudo cargar la lista.');
    }
  }

  useEffect(() => { void cargar(); }, [filtro]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setAviso('');
    try {
      const u = await api.post<AdminUser>('/api/admin/users', nuevo);
      setAviso(`Creado ${u.email}. Contrasena temporal: cambiar123`);
      setNuevo({ email: '', fullName: '', role: 'DOCENTE' });
      await cargar();
    } catch {
      setError('No se pudo crear. ¿Ya existe ese correo?');
    }
  }

  async function alternarActivo(u: AdminUser) {
    setError(''); setAviso('');
    try {
      await api.put(`/api/admin/users/${u.id}`,
        { fullName: u.fullName, role: u.role, active: !u.active });
      await cargar();
    } catch {
      setError('No se pudo actualizar.');
    }
  }

  async function resetear(u: AdminUser) {
    setError(''); setAviso('');
    try {
      const r = await api.post<{ temporaryPassword: string }>(
        `/api/admin/users/${u.id}/reset-password`, {});
      setAviso(`Contrasena de ${u.email} restablecida a: ${r.temporaryPassword}`);
    } catch {
      setError('No se pudo restablecer la contrasena.');
    }
  }

  return (
    <section>
      <form className="filtros" onSubmit={crear}>
        <label htmlFor="ne">Correo</label>
        <input id="ne" type="email" required value={nuevo.email}
               onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} />
        <label htmlFor="nn">Nombre</label>
        <input id="nn" required value={nuevo.fullName}
               onChange={(e) => setNuevo({ ...nuevo, fullName: e.target.value })} />
        <label htmlFor="nr">Rol</label>
        <select id="nr" value={nuevo.role}
                onChange={(e) => setNuevo({ ...nuevo, role: e.target.value as Role })}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button type="submit" style={{ gridColumn: '1 / -1' }}>Crear usuario</button>
      </form>

      {aviso && <p className="banner pendiente" role="status">{aviso}</p>}
      {error && <p role="alert" className="error">{error}</p>}

      <div className="leyenda" style={{ marginTop: 16 }}>
        <select aria-label="Filtrar por rol" value={filtro}
                onChange={(e) => setFiltro(e.target.value as Role | '')}>
          <option value="">Todos los roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input aria-label="Buscar" placeholder="Buscar por nombre o correo"
               value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <button type="button" className="secundario" onClick={() => void cargar()}>Buscar</button>
      </div>

      <div className="tabla-scroll">
        <table>
          <thead>
            <tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.fullName}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.active ? 'Activo' : 'Inactivo'}</td>
                <td>
                  <button type="button" className="secundario"
                          style={{ minHeight: 32, padding: '4px 10px', marginRight: 6 }}
                          onClick={() => void alternarActivo(u)}>
                    {u.active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button type="button" className="secundario"
                          style={{ minHeight: 32, padding: '4px 10px' }}
                          onClick={() => void resetear(u)}>
                    Restablecer clave
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Escribir `PanelCalendario.tsx`**

Es el panel que el rector va a usar de verdad: marcar un paro o una jornada pedagógica.

```tsx
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { DayType, SchoolDay } from '../../api/contract';

const TIPOS: DayType[] = ['LECTIVO', 'FESTIVO', 'VACACIONES', 'INSTITUCIONAL', 'SUSPENDIDO'];
const hoyISO = () => new Date().toLocaleDateString('en-CA');

export default function PanelCalendario() {
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [dias, setDias] = useState<SchoolDay[]>([]);
  const [error, setError] = useState('');

  async function cargar() {
    setError('');
    try {
      setDias(await api.get<SchoolDay[]>(`/api/calendar/school-days?from=${desde}&to=${hasta}`));
    } catch {
      setError('No se pudo cargar el calendario.');
    }
  }

  useEffect(() => { void cargar(); }, []);

  async function cambiar(dia: SchoolDay, tipo: DayType, motivo: string) {
    setError('');
    try {
      await api.put(`/api/calendar/school-days/${dia.calendarDate}`,
        { dayType: tipo, description: motivo || null });
      await cargar();
    } catch {
      setError('No se pudo actualizar ese dia.');
    }
  }

  return (
    <section>
      <div className="filtros">
        <label htmlFor="cd">Desde</label>
        <input id="cd" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <label htmlFor="ch">Hasta</label>
        <input id="ch" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </div>
      <button type="button" onClick={() => void cargar()}>Ver rango</button>
      {error && <p role="alert" className="error">{error}</p>}

      <p className="meta">
        Cambiar un dia a algo distinto de LECTIVO impide registrar asistencia ese dia,
        tanto en la aplicacion como en el servidor.
      </p>

      <div className="tabla-scroll">
        <table>
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th></tr></thead>
          <tbody>
            {dias.map((d) => (
              <tr key={d.calendarDate}>
                <td>{new Date(`${d.calendarDate}T00:00`).toLocaleDateString('es-CO',
                      { weekday: 'short', day: '2-digit', month: 'short' })}</td>
                <td>
                  <select aria-label={`Tipo de dia para ${d.calendarDate}`} value={d.dayType}
                          onChange={(e) => void cambiar(d, e.target.value as DayType,
                                                        d.description ?? '')}>
                    {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td>
                  <input aria-label={`Motivo para ${d.calendarDate}`}
                         defaultValue={d.description ?? ''} placeholder="Motivo (opcional)"
                         onBlur={(e) => void cambiar(d, d.dayType, e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Escribir `PanelCarga.tsx`**

```tsx
import { useState } from 'react';
import { getSession } from '../../api/client';
import type { ImportResult } from '../../api/contract';

const CARGAS = [
  { clave: 'students',  titulo: 'Estudiantes',
    cabecera: 'document_id,first_name,middle_name,last_name,second_surname,grade' },
  { clave: 'schedule',  titulo: 'Horario',
    cabecera: 'grade,weekday,block_no,start_time,end_time,subject,teacher_email' },
  { clave: 'guardians', titulo: 'Acudientes',
    cabecera: 'document_id,guardian_name,guardian_email,relationship' },
] as const;

export default function PanelCarga() {
  const [resultado, setResultado] = useState<Record<string, ImportResult | string>>({});
  const [cargando, setCargando] = useState('');

  async function subir(clave: string, archivo: File) {
    setCargando(clave);
    const datos = new FormData();
    datos.append('file', archivo);
    try {
      const res = await fetch(`/api/admin/import/${clave}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getSession()!.token}` },
        body: datos,
      });
      if (!res.ok) throw new Error();
      setResultado((r) => ({ ...r, [clave]: (await res.json()) as ImportResult }));
    } catch {
      setResultado((r) => ({ ...r, [clave]: 'No se pudo cargar el archivo.' }));
    } finally {
      setCargando('');
    }
  }

  return (
    <section>
      <p className="meta">
        Orden de carga: <strong>estudiantes primero</strong>, luego horario, y acudientes
        al final. Los dos ultimos necesitan que el estudiante ya exista.
        Los archivos deben ser CSV codificados en UTF-8.
      </p>

      {CARGAS.map((c) => {
        const r = resultado[c.clave];
        return (
          <div key={c.clave} className="grafica">
            <h3>{c.titulo}</h3>
            <figcaption><code>{c.cabecera}</code></figcaption>
            <input type="file" accept=".csv,text/csv" disabled={cargando === c.clave}
                   aria-label={`Archivo CSV de ${c.titulo}`}
                   onChange={(e) => {
                     const f = e.target.files?.[0];
                     if (f) void subir(c.clave, f);
                   }} />
            {cargando === c.clave && <p className="meta">Cargando...</p>}
            {typeof r === 'string' && <p role="alert" className="error">{r}</p>}
            {r && typeof r !== 'string' && (
              <>
                <p className="meta">{r.imported} fila(s) cargada(s).</p>
                {r.errors.length > 0 && (
                  <ul className="novedades">
                    {r.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                    {r.errors.length > 20 && <li>...y {r.errors.length - 20} mas</li>}
                  </ul>
                )}
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 5: Escribir `Admin.tsx`**

```tsx
import { useState } from 'react';
import PanelUsuarios from '../components/admin/PanelUsuarios';
import PanelCalendario from '../components/admin/PanelCalendario';
import PanelCarga from '../components/admin/PanelCarga';

const PESTANAS = [
  { clave: 'usuarios',   titulo: 'Usuarios' },
  { clave: 'calendario', titulo: 'Calendario' },
  { clave: 'carga',      titulo: 'Carga de datos' },
] as const;

export default function Admin() {
  const [activa, setActiva] = useState<string>('usuarios');

  return (
    <main className="card">
      <h1>Administracion</h1>
      <div className="leyenda" role="tablist" style={{ marginBottom: 16 }}>
        {PESTANAS.map((p) => (
          <button key={p.clave} type="button" role="tab"
                  aria-selected={activa === p.clave}
                  className={activa === p.clave ? undefined : 'secundario'}
                  style={{ minHeight: 36, padding: '6px 12px' }}
                  onClick={() => setActiva(p.clave)}>
            {p.titulo}
          </button>
        ))}
      </div>
      {activa === 'usuarios' && <PanelUsuarios />}
      {activa === 'calendario' && <PanelCalendario />}
      {activa === 'carga' && <PanelCarga />}
    </main>
  );
}
```

- [ ] **Step 6: Añadir la ruta y el enlace**

En `App.tsx`, importar `Admin` y añadir dentro de `<Routes>`:

```tsx
      <Route path="/admin" element={<SoloRoles roles={['ADMIN']}><Admin /></SoloRoles>} />
```

En `Home.tsx`, dentro del `<nav className="acciones">`, después del enlace al Tablero:

```tsx
        {session.role === 'ADMIN' && <Link className="boton" to="/admin">Administracion</Link>}
```

- [ ] **Step 7: Comprobar que compila y los tests siguen verdes**

Run: `cd app/frontend && npm run build && npm test`
Expected: build limpio, 19 tests en verde, paquete inicial por debajo de 200 KB gzip.

- [ ] **Step 8: Comprobar a mano los tres paneles**

Con el backend levantado y `npm run dev`, entrar como `admin@ggm.edu.co` / `cambiar123` y verificar:
1. **Usuarios**: crear un docente, verlo en la lista, desactivarlo, reactivarlo, restablecer su clave.
2. **Calendario**: poner un lunes cualquiera como `SUSPENDIDO` con motivo "Paro"; después, en `/asistencia`, comprobar que ese día ya no deja marcar.
3. **Carga**: subir un CSV de estudiantes con una línea mala y comprobar que reporta la línea concreta sin abortar el resto.

El punto 2 es la prueba que importa: demuestra que el rector puede cerrar un día sin que nadie toque SQL.

- [ ] **Step 9: Commit**

```bash
git add app/frontend
git commit -m "feat: pantalla de administracion con usuarios, calendario y carga de datos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Fuera de alcance

1. **Edición del horario desde la interfaz** (no solo carga por CSV). Una rejilla de horario editable es una pantalla en sí misma; el CSV cubre la carga inicial y las correcciones puntuales se hacen recargando el archivo.
2. **Auditoría de cambios administrativos.** Quién desactivó a quién y cuándo. `school_calendar` ya guarda `updated_by`; `users` no tiene equivalente. Merece una tabla de auditoría propia si el colegio lo pide.
3. **Envío de la contraseña temporal por correo.** Hoy se muestra en pantalla y el administrador la comunica. Mandarla por correo exige plantilla y decidir qué pasa si el correo no llega.
4. **Días institucionales A/B**, pendiente de que el colegio defina el modelo.

## Self-review

**Cobertura.** El punto "pantalla de administración de usuarios, horario y calendario" del informe queda cubierto en usuarios (Task 1 y 2), calendario (Task 2) y carga de datos incluido el horario (Task 2). La edición del horario en rejilla queda explícitamente fuera de alcance con su motivo.

**Sin marcadores de posición.** Cada paso trae el código o el comando exacto.

**Consistencia.** `AdminUser` en `contract.ts` tiene los mismos campos que `UserDto` del controlador (`id`, `email`, `fullName`, `role`, `active`). `ImportResult(imported, errors)` coincide con lo que ya devuelven los tres importadores. `SchoolDay` y `DayType` se reutilizan del contrato existente, no se redefinen. `tokenDe(String, String)` es el helper que ya existe en `AbstractIntegrationTest`.

**Riesgo.** `PanelCalendario` dispara un `PUT` en el `onBlur` del motivo y en el `onChange` del tipo. Si el colegio tiene la costumbre de tabular por la tabla entera, generará peticiones de más. Es aceptable para una pantalla que se usa unas pocas veces al año; si molesta, se agrupa en un botón "Guardar cambios".
