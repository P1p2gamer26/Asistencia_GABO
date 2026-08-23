package co.edu.ggm.asistencia.schedule;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Usa su propio curso (grado 888) y su propio docente para no mutar la semilla.
 */
@AutoConfigureMockMvc
class HorarioTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private Long docenteId;

    @BeforeEach
    void datos() {
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES ('horario@horariotest.co', 'x', 'Pepito Perez', 'DOCENTE', TRUE)
                ON CONFLICT (email) DO NOTHING
                """);
        docenteId = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = 'horario@horariotest.co'", Long.class);

        jdbcBase.update(
                "INSERT INTO subjects (name) VALUES ('CienciasHorario') ON CONFLICT (name) DO NOTHING");
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id, room)
                VALUES ('888', 2, 3, '08:15', '09:05',
                        (SELECT id FROM subjects WHERE name = 'CienciasHorario'), ?, 'AulaHorarioTest')
                ON CONFLICT (grade, weekday, block_no) DO UPDATE
                  SET teacher_id = EXCLUDED.teacher_id, room = EXCLUDED.room
                """, docenteId);
        // Un bloque propio sin aula asignada: la lista de salones no debe inventarle
        // un salon llamado "" ni contarlo como si tuviera uno.
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id, room)
                VALUES ('888', 3, 3, '08:15', '09:05',
                        (SELECT id FROM subjects WHERE name = 'CienciasHorario'), ?, NULL)
                ON CONFLICT (grade, weekday, block_no) DO UPDATE
                  SET teacher_id = EXCLUDED.teacher_id, room = EXCLUDED.room
                """, docenteId);
    }

    @Test
    void el_docente_ve_su_semana_con_curso_materia_y_aula() throws Exception {
        mvc.perform(get("/api/schedule/week")
                        .header("Authorization", "Bearer " + jwt.issueAccess(docenteId, "DOCENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.grade=='888' && @.weekday==2)].subject").value("CienciasHorario"))
           .andExpect(jsonPath("$[?(@.grade=='888' && @.weekday==2)].room").value("AulaHorarioTest"))
           .andExpect(jsonPath("$[?(@.grade=='888' && @.weekday==2)].startTime").value("08:15"))
           .andExpect(jsonPath("$[?(@.grade=='888' && @.weekday==2)].endTime").value("09:05"));
    }

    @Test
    void el_docente_solo_ve_sus_bloques() throws Exception {
        // El bloque de la semilla es de otro docente y no debe aparecer.
        mvc.perform(get("/api/schedule/week")
                        .header("Authorization", "Bearer " + jwt.issueAccess(docenteId, "DOCENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.grade=='601')]").doesNotExist());
    }

    @Test
    void coordinacion_puede_pedir_el_horario_de_un_curso_con_el_nombre_del_docente()
            throws Exception {
        mvc.perform(get("/api/schedule/week").param("grade", "888")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].teacherName").value("Pepito Perez"))
           .andExpect(jsonPath("$[0].room").value("AulaHorarioTest"));
    }

    @Test
    void un_docente_no_puede_pedir_el_horario_de_un_curso() throws Exception {
        mvc.perform(get("/api/schedule/week").param("grade", "888")
                        .header("Authorization", "Bearer " + jwt.issueAccess(docenteId, "DOCENTE")))
           .andExpect(status().isForbidden());
    }

    @Test
    void sin_token_no_se_ve_ningun_horario() throws Exception {
        mvc.perform(get("/api/schedule/week")).andExpect(status().isUnauthorized());
    }

    @Test
    void coordinacion_ve_el_salon_de_prueba_y_cuenta_los_bloques_sin_aula() throws Exception {
        mvc.perform(get("/api/schedule/rooms")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.rooms").value(org.hamcrest.Matchers.hasItem("AulaHorarioTest")))
           .andExpect(jsonPath("$.withoutRoom").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)));
    }

    @Test
    void un_docente_no_puede_pedir_la_lista_de_salones() throws Exception {
        mvc.perform(get("/api/schedule/rooms")
                        .header("Authorization", "Bearer " + jwt.issueAccess(docenteId, "DOCENTE")))
           .andExpect(status().isForbidden());
    }

    @Test
    void coordinacion_puede_ver_el_detalle_de_un_salon() throws Exception {
        mvc.perform(get("/api/schedule/week").param("room", "AulaHorarioTest")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].grade").value("888"))
           .andExpect(jsonPath("$[0].subject").value("CienciasHorario"))
           .andExpect(jsonPath("$[0].teacherName").value("Pepito Perez"))
           .andExpect(jsonPath("$[0].room").value("AulaHorarioTest"));
    }

    @Test
    void un_docente_no_puede_pedir_el_horario_de_un_salon() throws Exception {
        mvc.perform(get("/api/schedule/week").param("room", "AulaHorarioTest")
                        .header("Authorization", "Bearer " + jwt.issueAccess(docenteId, "DOCENTE")))
           .andExpect(status().isForbidden());
    }
}
