package co.edu.ggm.asistencia.attendance;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Ultimas tomas de lista para el panel lateral de /asistencia. La regla que se
 * protege aqui es de privacidad: un docente ve solo lo suyo, coordinacion ve todo.
 * Usa su propio curso ("RCA") para no chocar con la semilla ni con otras clases.
 */
@AutoConfigureMockMvc
class RecientesTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private static final String GRADE = "RCA";
    private static final String FECHA = "2026-04-27";   // lunes lectivo, libre de otras clases

    private Long bloquePropio;
    private Long bloqueAjeno;
    private Long estudianteId;

    private Long crearDocente(String email, String nombre) {
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES (?, 'x', ?, 'DOCENTE', TRUE)
                ON CONFLICT (email) DO NOTHING
                """, email, nombre);
        return jdbcBase.queryForObject("SELECT id FROM users WHERE email = ?", Long.class, email);
    }

    private Long crearBloque(int blockNo, Long teacherId) {
        jdbcBase.update(
                "INSERT INTO subjects (name) VALUES ('Materia RCA') ON CONFLICT (name) DO NOTHING");
        int weekday = LocalDate.parse(FECHA).getDayOfWeek().getValue();
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id)
                VALUES (?, ?, ?, '07:00', '07:50',
                        (SELECT id FROM subjects WHERE name = 'Materia RCA'), ?)
                ON CONFLICT (grade, weekday, block_no) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
                """, GRADE, weekday, blockNo, teacherId);
        return jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade = ? AND weekday = ? AND block_no = ?",
                Long.class, GRADE, weekday, blockNo);
    }

    private void marcar(Long blockId, Long recordedBy) {
        jdbcBase.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                        status, recorded_by, recorded_at)
                VALUES (?, ?, ?, ?, 'P', ?, now())
                ON CONFLICT ON CONSTRAINT attendance_unique_slot DO NOTHING
                """, UUID.randomUUID(), estudianteId, blockId, LocalDate.parse(FECHA), recordedBy);
    }

    @BeforeEach
    void preparar() {
        Long propio = crearDocente("propio@rca.co", "Docente Propio RCA");
        Long otro = crearDocente("otro@rca.co", "Docente Otro RCA");
        bloquePropio = crearBloque(1, propio);
        bloqueAjeno = crearBloque(2, otro);

        jdbcBase.update("""
                INSERT INTO students (document_id, first_name, last_name, grade, active)
                VALUES ('RCA0001', 'ESTUDIANTE', 'RCA', ?, TRUE)
                ON CONFLICT (document_id) DO NOTHING
                """, GRADE);
        estudianteId = jdbcBase.queryForObject(
                "SELECT id FROM students WHERE document_id = 'RCA0001'", Long.class);

        jdbcBase.update("DELETE FROM attendance WHERE student_id = ?", estudianteId);
        marcar(bloquePropio, propio);
        marcar(bloqueAjeno, otro);
    }

    @Test
    void un_docente_solo_ve_las_tomas_de_los_bloques_que_dicta() throws Exception {
        mvc.perform(get("/api/attendance/recientes").param("limite", "50")
                        .header("Authorization", tokenDe("propio@rca.co", "DOCENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.blockId == " + bloquePropio + ")]").exists())
           .andExpect(jsonPath("$[?(@.blockId == " + bloqueAjeno + ")]").doesNotExist());
    }

    @Test
    void coordinacion_ve_las_tomas_de_todos_los_bloques() throws Exception {
        mvc.perform(get("/api/attendance/recientes").param("limite", "50")
                        .header("Authorization", tokenDe("propio@rca.co", "COORDINADOR")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.blockId == " + bloquePropio + ")]").exists())
           .andExpect(jsonPath("$[?(@.blockId == " + bloqueAjeno + ")]").exists());
    }

    @Test
    void cada_toma_dice_el_curso_el_bloque_y_quien_la_registro() throws Exception {
        mvc.perform(get("/api/attendance/recientes").param("limite", "50")
                        .header("Authorization", tokenDe("propio@rca.co", "DOCENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.blockId == " + bloquePropio + ")].grade").value(GRADE))
           .andExpect(jsonPath("$[?(@.blockId == " + bloquePropio + ")].total").value(1))
           .andExpect(jsonPath("$[?(@.blockId == " + bloquePropio + ")].recordedByName")
                   .value("Docente Propio RCA"));
    }

    @Test
    void el_limite_nunca_pasa_de_cincuenta_aunque_se_pida_mas() throws Exception {
        // Un limite absurdo no debe poder arrastrar la base entera al panel lateral.
        mvc.perform(get("/api/attendance/recientes").param("limite", "100000")
                        .header("Authorization", tokenDe("propio@rca.co", "COORDINADOR")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.length()")
                   .value(org.hamcrest.Matchers.lessThanOrEqualTo(50)));
    }
}
