package co.edu.ggm.asistencia.guardian;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.util.concurrent.atomic.AtomicLong;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cursos ("610p"/"820p") y fechas (2026-06-0x) propios, distintos de los que usan
 * HoyTest (777, 2026-03-xx), NovedadesTest (997/998, 2026-01-26), PendientesTest (999,
 * 2026-03-02), BootstrapTest (601/602, sin fecha propia pero con conteos exactos de
 * estudiantes reales de 601 sembrados en V3) y MiDiaTest (601z, 2026-08-03/07). En
 * particular NO se usa "601"/"802": el curso real 601 de la semilla tiene exactamente
 * dos estudiantes y BootstrapTest cuenta con ese numero exacto; anadir un tercero ahi
 * rompe ese test sin tocar su codigo.
 */
@AutoConfigureMockMvc
class PortalAcudienteTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private static final AtomicLong SEQ = new AtomicLong(730_000_000L);

    // Cada test crea su propia "Ana Perez": sin limpieza entre tests, buscar por
    // nombre en la base encontraria las de tests anteriores. Este mapa recuerda solo
    // los hijos creados en el test actual (instancia nueva de JUnit por metodo).
    private final java.util.Map<String, Long> hijosDeEsteTest = new java.util.HashMap<>();

    @Test
    void un_acudiente_con_dos_hijos_los_ve_a_los_dos() throws Exception {
        // La tabla `guardianships` siempre lo permitio, pero nunca se habia probado.
        String token = acudienteCon("Ana Perez", "610p", "Luis Perez", "820p");
        mvc.perform(get("/api/guardian/children").header("Authorization", token)
                        .param("from", "2026-06-01").param("to", "2026-06-10"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.length()").value(2))
           .andExpect(jsonPath("$[?(@.fullName=='Ana Perez')].grade").value("610p"))
           .andExpect(jsonPath("$[?(@.fullName=='Luis Perez')].grade").value("820p"));
    }

    @Test
    void cuenta_cuantos_dias_asistio_y_cuantos_falto() throws Exception {
        String token = acudienteCon("Ana Perez", "610p");
        marcar("Ana Perez", "2026-06-01", "P");
        marcar("Ana Perez", "2026-06-02", "F");
        marcar("Ana Perez", "2026-06-03", "T");
        mvc.perform(get("/api/guardian/children").header("Authorization", token)
                        .param("from", "2026-06-01").param("to", "2026-06-10"))
           .andExpect(jsonPath("$[0].asistio").value(1))
           .andExpect(jsonPath("$[0].falto").value(1))
           .andExpect(jsonPath("$[0].tarde").value(1))
           .andExpect(jsonPath("$[0].recordedDays").value(3));
    }

    @Test
    void sin_ningun_registro_los_contadores_van_en_cero_y_recordedDays_tambien() throws Exception {
        // Es el caso que no se puede confundir con "asistio siempre".
        String token = acudienteCon("Ana Perez", "610p");
        mvc.perform(get("/api/guardian/children").header("Authorization", token)
                        .param("from", "2026-06-01").param("to", "2026-06-10"))
           .andExpect(jsonPath("$[0].recordedDays").value(0))
           .andExpect(jsonPath("$[0].asistio").value(0))
           .andExpect(jsonPath("$[0].falto").value(0));
    }

    @Test
    void devuelve_el_horario_del_hijo_con_el_aula() throws Exception {
        String token = acudienteCon("Ana Perez", "610p");
        horarioDe("610p", 1, 1, "Ciencias", "Laboratorio 1", "Pepito Perez");
        mvc.perform(get("/api/guardian/children").header("Authorization", token)
                        .param("from", "2026-06-01").param("to", "2026-06-10"))
           .andExpect(jsonPath("$[0].horario[0].subject").value("Ciencias"))
           .andExpect(jsonPath("$[0].horario[0].room").value("Laboratorio 1"))
           .andExpect(jsonPath("$[0].horario[0].teacherName").value("Pepito Perez"))
           .andExpect(jsonPath("$[0].horario[0].weekday").value(1));
    }

    @Test
    void un_acudiente_no_ve_hijos_ajenos() throws Exception {
        String token = acudienteCon("Ana Perez", "610p");
        estudianteSuelto("Hijo De Otro", "610p");
        mvc.perform(get("/api/guardian/children").header("Authorization", token)
                        .param("from", "2026-06-01").param("to", "2026-06-10"))
           .andExpect(jsonPath("$.length()").value(1))
           .andExpect(jsonPath("$[0].fullName").value("Ana Perez"));
    }

    @Test
    void el_personal_no_entra_por_esta_puerta() throws Exception {
        mvc.perform(get("/api/guardian/children").header("Authorization", tokenDeDocente()))
           .andExpect(status().isForbidden());
    }

    // ---- siembra ----

    private String documentId() {
        return "PORT" + SEQ.incrementAndGet();
    }

    private Long crearEstudiante(String nombreCompleto, String grade) {
        String[] partes = nombreCompleto.split(" ", 2);
        String documentId = documentId();
        jdbcBase.update("""
                INSERT INTO students (document_id, first_name, last_name, grade)
                VALUES (?, ?, ?, ?)
                """, documentId, partes[0], partes[1], grade);
        return jdbcBase.queryForObject(
                "SELECT id FROM students WHERE document_id = ?", Long.class, documentId);
    }

    /** Un acudiente con uno o mas hijos (pares nombre, curso). Devuelve el token Bearer. */
    private String acudienteCon(String... paresNombreGrado) {
        String email = "acudiente" + SEQ.incrementAndGet() + "@correo.com";
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role)
                VALUES (?, 'x', 'Acudiente de prueba', 'ACUDIENTE')
                """, email);
        Long acudienteId = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, email);
        for (int i = 0; i < paresNombreGrado.length; i += 2) {
            Long hijoId = crearEstudiante(paresNombreGrado[i], paresNombreGrado[i + 1]);
            hijosDeEsteTest.put(paresNombreGrado[i], hijoId);
            jdbcBase.update("""
                    INSERT INTO guardianships (student_id, guardian_id, relationship)
                    VALUES (?, ?, 'Padre')
                    """, hijoId, acudienteId);
        }
        return tokenDe(email, "ACUDIENTE");
    }

    /** Marca una asistencia para el hijo con ese nombre completo, en esa fecha. */
    private void marcar(String nombreCompleto, String fecha, String estado) {
        Long hijoId = hijosDeEsteTest.get(nombreCompleto);
        Long docenteId = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = 'fpalacios@ggm.edu.co'", Long.class);
        Long bloqueId = jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE teacher_id = ? LIMIT 1", Long.class, docenteId);
        jdbcBase.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                        status, recorded_by, recorded_at)
                VALUES (gen_random_uuid(), ?, ?, ?::date, ?, ?, now())
                ON CONFLICT ON CONSTRAINT attendance_unique_slot DO UPDATE SET status = EXCLUDED.status
                """, hijoId, bloqueId, fecha, estado, docenteId);
    }

    /** Crea un bloque de horario para ese curso, con docente propio. */
    private void horarioDe(String grade, int weekday, int blockNo, String subject, String room,
                           String teacherName) {
        String email = "docente" + SEQ.incrementAndGet() + "@ggm.edu.co";
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role)
                VALUES (?, 'x', ?, 'DOCENTE')
                """, email, teacherName);
        Long teacherId = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, email);
        jdbcBase.update(
                "INSERT INTO subjects (name) VALUES (?) ON CONFLICT (name) DO NOTHING", subject);
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id, room)
                SELECT ?, ?, ?, '07:00', '07:50', s.id, ?, ?
                FROM subjects s WHERE s.name = ?
                """, grade, weekday, blockNo, teacherId, room, subject);
    }

    /** Un estudiante en ese curso sin acudiente asignado. */
    private void estudianteSuelto(String nombreCompleto, String grade) {
        crearEstudiante(nombreCompleto, grade);
    }

    private String tokenDeDocente() {
        return tokenDe("fpalacios@ggm.edu.co", "DOCENTE");
    }
}
