package co.edu.ggm.asistencia.attendance;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Rol ORIENTADOR y asignaciones de curso. Cursos propios "OR1" y "OR2", documentos "ORI...".
 * Usa un bloque por curso (de un docente con horario) para poder pasar lista.
 */
@AutoConfigureMockMvc
class OrientadorAsignacionesTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private static final String FECHA = "2026-04-22";

    private Long usuario(String email, String rol) {
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES (?, 'x', 'Usuario ORI', ?, TRUE) ON CONFLICT (email) DO NOTHING
                """, email, rol);
        return jdbcBase.queryForObject("SELECT id FROM users WHERE email = ?", Long.class, email);
    }

    private Long bloque(String grade, int blockNo, Long teacherId) {
        jdbcBase.update("INSERT INTO subjects (name) VALUES ('Materia ORI') ON CONFLICT (name) DO NOTHING");
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time, subject_id, teacher_id)
                VALUES (?, 1, ?, '07:00', '07:50', (SELECT id FROM subjects WHERE name = 'Materia ORI'), ?)
                ON CONFLICT (grade, weekday, block_no) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
                """, grade, blockNo, teacherId);
        return jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade = ? AND weekday = 1 AND block_no = ?",
                Long.class, grade, blockNo);
    }

    private Long estudiante(String doc, String grade) {
        jdbcBase.update("""
                INSERT INTO students (document_id, first_name, last_name, grade, active)
                VALUES (?, 'EST', 'ORI', ?, TRUE) ON CONFLICT (document_id) DO NOTHING
                """, doc, grade);
        return jdbcBase.queryForObject("SELECT id FROM students WHERE document_id = ?", Long.class, doc);
    }

    /** Siembra dos cursos con un bloque cada uno (de un titular) y devuelve [bloqueOR1, estOR1, bloqueOR2, estOR2]. */
    private Long[] preparar() {
        Long titular = usuario("titular@ori.co", "DOCENTE");
        jdbcBase.update("""
                INSERT INTO school_calendar (calendar_date, day_type) VALUES (?, 'LECTIVO')
                ON CONFLICT (calendar_date) DO UPDATE SET day_type = 'LECTIVO'
                """, LocalDate.parse(FECHA));
        Long b1 = bloque("OR1", 1, titular), b2 = bloque("OR2", 2, titular);
        Long e1 = estudiante("ORI0001", "OR1"), e2 = estudiante("ORI0002", "OR2");
        jdbcBase.update("DELETE FROM attendance WHERE student_id IN (?, ?)", e1, e2);
        return new Long[]{b1, e1, b2, e2};
    }

    private String lista(Long est, Long bloque) {
        return "{\"records\":[{\"id\":\"" + UUID.randomUUID() + "\",\"studentId\":" + est
                + ",\"scheduleBlockId\":" + bloque + ",\"classDate\":\"" + FECHA
                + "\",\"status\":\"P\",\"recordedAt\":\"2026-04-22T12:00:00Z\"}]}";
    }

    private void tomar(String email, String rol, Long est, Long bloque, int aceptados) throws Exception {
        mvc.perform(post("/api/attendance/sync").header("Authorization", tokenDe(email, rol))
                        .contentType(MediaType.APPLICATION_JSON).content(lista(est, bloque)))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(aceptados));
    }

    @Test
    void el_orientador_toma_lista_de_cualquier_curso() throws Exception {
        Long[] p = preparar();
        usuario("orientador@ori.co", "ORIENTADOR");
        tomar("orientador@ori.co", "ORIENTADOR", p[1], p[0], 1);
        tomar("orientador@ori.co", "ORIENTADOR", p[3], p[2], 1);
    }

    @Test
    void el_docente_sin_horario_ni_asignaciones_toma_lista_de_cualquier_curso() throws Exception {
        Long[] p = preparar();
        usuario("libre@ori.co", "DOCENTE");
        tomar("libre@ori.co", "DOCENTE", p[1], p[0], 1);
    }

    @Test
    void el_docente_con_asignacion_solo_toma_lista_de_su_curso() throws Exception {
        Long[] p = preparar();
        Long id = usuario("asignado@ori.co", "DOCENTE");
        jdbcBase.update("DELETE FROM teacher_course_assignments WHERE user_id = ?", id);
        jdbcBase.update("INSERT INTO teacher_course_assignments (user_id, grade) VALUES (?, 'OR1')", id);
        tomar("asignado@ori.co", "DOCENTE", p[1], p[0], 1);
        tomar("asignado@ori.co", "DOCENTE", p[3], p[2], 0);
    }

    @Test
    void asignaciones_put_y_get_solo_admin_y_solo_docente_u_orientador() throws Exception {
        preparar();
        Long doc = usuario("conasig@ori.co", "DOCENTE");
        Long acu = usuario("acu@ori.co", "ACUDIENTE");
        String admin = tokenDe("admin@ggm.edu.co", "ADMIN");
        String url = "/api/admin/users/" + doc + "/assignments";

        mvc.perform(put(url).header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"grades\":[\"OR2\",\"OR1\"]}"))
           .andExpect(status().isOk()).andExpect(jsonPath("$.grades[0]").value("OR1"))
           .andExpect(jsonPath("$.grades[1]").value("OR2"));
        mvc.perform(get(url).header("Authorization", admin))
           .andExpect(status().isOk()).andExpect(jsonPath("$.grades.length()").value(2));
        mvc.perform(put(url).header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"grades\":[\"NOEXISTE\"]}"))
           .andExpect(status().isBadRequest());
        mvc.perform(put("/api/admin/users/" + acu + "/assignments").header("Authorization", admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"grades\":[\"OR1\"]}"))
           .andExpect(status().isBadRequest());

        for (String[] quien : new String[][]{{"conasig@ori.co", "DOCENTE"}, {"acu@ori.co", "ACUDIENTE"}}) {
            mvc.perform(get(url).header("Authorization", tokenDe(quien[0], quien[1])))
               .andExpect(status().isForbidden());
            mvc.perform(put(url).header("Authorization", tokenDe(quien[0], quien[1]))
                            .contentType(MediaType.APPLICATION_JSON).content("{\"grades\":[]}"))
               .andExpect(status().isForbidden());
        }
        usuario("orient2@ori.co", "ORIENTADOR");
        mvc.perform(get(url).header("Authorization", tokenDe("orient2@ori.co", "ORIENTADOR")))
           .andExpect(status().isForbidden());
    }

    @Test
    void el_acudiente_no_toma_lista() throws Exception {
        Long[] p = preparar();
        usuario("acu2@ori.co", "ACUDIENTE");
        mvc.perform(post("/api/attendance/sync").header("Authorization", tokenDe("acu2@ori.co", "ACUDIENTE"))
                        .contentType(MediaType.APPLICATION_JSON).content(lista(p[1], p[0])))
           .andExpect(status().isForbidden());
    }

    @Test
    void el_bootstrap_incluye_los_cursos_asignados() throws Exception {
        preparar();
        Long id = usuario("boot@ori.co", "DOCENTE");
        jdbcBase.update("DELETE FROM teacher_course_assignments WHERE user_id = ?", id);
        jdbcBase.update("INSERT INTO teacher_course_assignments (user_id, grade) VALUES (?, 'OR2')", id);
        mvc.perform(get("/api/sync/bootstrap").header("Authorization", tokenDe("boot@ori.co", "DOCENTE")))
           .andExpect(status().isOk()).andExpect(jsonPath("$.assignedGrades[0]").value("OR2"))
           .andExpect(jsonPath("$.blocks[0].grade").value("OR2"));
    }
}
