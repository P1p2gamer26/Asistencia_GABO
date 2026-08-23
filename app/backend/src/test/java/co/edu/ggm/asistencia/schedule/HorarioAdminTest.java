package co.edu.ggm.asistencia.schedule;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * CRUD del horario. Usa su propio curso (grado 889) y sus propios docentes/materia
 * para no mutar la semilla ni chocar con HorarioTest (grado 888).
 */
@AutoConfigureMockMvc
class HorarioAdminTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private Long docenteId;
    private Long otroDocenteId;
    private Long materiaId;

    @BeforeEach
    void datos() {
        String sufijo = UUID.randomUUID().toString().substring(0, 8);
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES ('horarioadmin1-""" + sufijo + """
                @horarioadmintest.co', 'x', 'Docente Uno HorarioAdmin', 'DOCENTE', TRUE)
                """);
        docenteId = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = 'horarioadmin1-" + sufijo + "@horarioadmintest.co'", Long.class);

        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES ('horarioadmin2-""" + sufijo + """
                @horarioadmintest.co', 'x', 'Docente Dos HorarioAdmin', 'DOCENTE', TRUE)
                """);
        otroDocenteId = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = 'horarioadmin2-" + sufijo + "@horarioadmintest.co'", Long.class);

        jdbcBase.update(
                "INSERT INTO subjects (name) VALUES ('MateriaHorarioAdmin') ON CONFLICT (name) DO NOTHING");
        materiaId = jdbcBase.queryForObject(
                "SELECT id FROM subjects WHERE name = 'MateriaHorarioAdmin'", Long.class);
    }

    private String cuerpo(String grade, int weekday, int blockNo, String start, String end,
                          Long teacherId, String room) {
        return """
                {"grade":"%s","weekday":%d,"blockNo":%d,"startTime":"%s","endTime":"%s",
                 "subjectId":%d,"teacherId":%d,"room":%s}
                """.formatted(grade, weekday, blockNo, start, end, materiaId, teacherId,
                room == null ? "null" : "\"" + room + "\"");
    }

    @Test
    void coordinador_crea_un_bloque_y_queda_su_autoria() throws Exception {
        mvc.perform(post("/api/admin/schedule")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("889", 1, 1, "07:00", "07:50", docenteId, "AulaHorarioAdmin1")))
           .andExpect(status().isCreated())
           .andExpect(jsonPath("$.grade").value("889"))
           .andExpect(jsonPath("$.createdBy").exists());
    }

    @Test
    void un_docente_recibe_403_al_crear() throws Exception {
        mvc.perform(post("/api/admin/schedule")
                        .header("Authorization", "Bearer " + jwt.issueAccess(docenteId, "DOCENTE"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("889", 1, 2, "07:00", "07:50", docenteId, "AulaHorarioAdmin2")))
           .andExpect(status().isForbidden());
    }

    @Test
    void un_docente_recibe_403_al_editar_y_borrar() throws Exception {
        Long id = crearBloque("889", 1, 3, "07:00", "07:50", docenteId, "AulaHorarioAdmin3");
        mvc.perform(put("/api/admin/schedule/" + id)
                        .header("Authorization", "Bearer " + jwt.issueAccess(docenteId, "DOCENTE"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("889", 1, 3, "07:00", "07:50", docenteId, "AulaHorarioAdmin3")))
           .andExpect(status().isForbidden());
        mvc.perform(delete("/api/admin/schedule/" + id)
                        .header("Authorization", "Bearer " + jwt.issueAccess(docenteId, "DOCENTE")))
           .andExpect(status().isForbidden());
    }

    @Test
    void editar_actualiza_quien_modifico_sin_perder_quien_creo() throws Exception {
        Long id = crearBloque("889", 1, 4, "07:00", "07:50", docenteId, "AulaHorarioAdmin4");
        mvc.perform(put("/api/admin/schedule/" + id)
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("889", 1, 4, "07:00", "07:55", docenteId, "AulaHorarioAdmin4")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.createdBy").exists())
           .andExpect(jsonPath("$.updatedBy").exists())
           .andExpect(jsonPath("$.endTime").value("07:55"));
    }

    @Test
    void borrar_un_bloque_con_asistencia_no_destruye_nada() throws Exception {
        // Grado propio (889Z, no 889): un estudiante activo aqui no debe alterar
        // los conteos de "bloques esperados" de otros tests que asumen 889 sin
        // estudiantes activos en ciertos dias de la semana (ver HoyTest).
        Long id = crearBloque("889Z", 1, 5, "07:00", "07:50", docenteId, "AulaHorarioAdmin5");
        jdbcBase.update("""
                INSERT INTO students (document_id, first_name, last_name, grade, active)
                VALUES ('HORADM-1', 'Estudiante', 'HorarioAdmin', '889Z', TRUE)
                ON CONFLICT (document_id) DO NOTHING
                """);
        Long studentId = jdbcBase.queryForObject(
                "SELECT id FROM students WHERE document_id = 'HORADM-1'", Long.class);
        jdbcBase.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status,
                                        recorded_by, recorded_at, synced_at)
                VALUES (gen_random_uuid(), ?, ?, CURRENT_DATE, 'P', ?, now(), now())
                """, studentId, id, docenteId);

        mvc.perform(delete("/api/admin/schedule/" + id)
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR")))
           .andExpect(status().isConflict())
           .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("1")));

        mvc.perform(get("/api/admin/schedule").param("grade", "889Z")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.id==" + id + ")]").exists());
    }

    @Test
    void crear_un_bloque_que_choca_con_el_mismo_docente_se_rechaza_y_dice_con_cual() throws Exception {
        crearBloque("889", 2, 1, "07:00", "07:50", docenteId, "AulaHorarioAdmin6");
        mvc.perform(post("/api/admin/schedule")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("889B", 2, 1, "07:00", "07:50", docenteId, "AulaHorarioAdmin7")))
           .andExpect(status().isConflict())
           .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("889")));
    }

    @Test
    void crear_un_bloque_que_choca_de_aula_se_rechaza_y_dice_con_cual() throws Exception {
        crearBloque("889", 3, 1, "07:00", "07:50", docenteId, "AulaHorarioAdmin8");
        mvc.perform(post("/api/admin/schedule")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("889B", 3, 1, "07:00", "07:50", otroDocenteId, "AulaHorarioAdmin8")))
           .andExpect(status().isConflict())
           .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("AulaHorarioAdmin8")));
    }

    @Test
    void un_bloque_preexistente_sin_autor_se_muestra_como_sin_registro() throws Exception {
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id, room)
                VALUES ('889', 4, 1, '07:00', '07:50', ?, ?, 'AulaHorarioAdmin9')
                """, materiaId, docenteId);

        mvc.perform(get("/api/admin/schedule").param("grade", "889")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.weekday==4 && @.createdBy)]").doesNotExist());
    }

    private Long crearBloque(String grade, int weekday, int blockNo, String start, String end,
                             Long teacherId, String room) throws Exception {
        String respuesta = mvc.perform(post("/api/admin/schedule")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(grade, weekday, blockNo, start, end, teacherId, room)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) new com.fasterxml.jackson.databind.ObjectMapper()
                .readValue(respuesta, java.util.Map.class).get("id")).longValue();
    }
}
