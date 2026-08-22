package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Usa sus propios estudiantes y su propio bloque (grado 999) para no mutar la semilla.
 */
@AutoConfigureMockMvc
class PendientesTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private Long bloqueId;

    @BeforeEach
    void datos() {
        int diaDeHoy = java.time.LocalDate.now(java.time.ZoneId.of("America/Bogota"))
                .getDayOfWeek().getValue();
        // schedule_blocks.weekday solo admite 1-5 (CHECK), y el endpoint filtra por el dia
        // real de hoy: en fin de semana no hay ningun bloque que pueda coincidir, asi que
        // el aviso no aplica y el test no tiene nada que comprobar.
        Assumptions.assumeTrue(diaDeHoy <= 5, "fin de semana: no hay bloques que dictar hoy");

        jdbcBase.update("""
                INSERT INTO students (document_id, first_name, last_name, grade)
                VALUES ('9990000001','UNO','PENDIENTE','999'),
                       ('9990000002','DOS','PENDIENTE','999'),
                       ('9990000003','TRES','PENDIENTE','999')
                ON CONFLICT (document_id) DO NOTHING
                """);
        jdbcBase.update("INSERT INTO subjects (name) VALUES ('MateriaPendiente') ON CONFLICT DO NOTHING");
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time, subject_id, teacher_id)
                VALUES ('999', ?, 7, '15:00', '15:50',
                        (SELECT id FROM subjects WHERE name='MateriaPendiente'),
                        (SELECT id FROM users WHERE email='fpalacios@ggm.edu.co'))
                ON CONFLICT (grade, weekday, block_no) DO NOTHING
                """, diaDeHoy);
        bloqueId = jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade='999' AND block_no=7", Long.class);
        jdbcBase.update("DELETE FROM attendance WHERE schedule_block_id = ?", bloqueId);
    }

    private void registrar(String documento) {
        jdbcBase.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status, recorded_by, recorded_at)
                VALUES (gen_random_uuid(), (SELECT id FROM students WHERE document_id=?), ?,
                        (SELECT calendar_date FROM school_calendar
                          WHERE day_type='LECTIVO' AND calendar_date <= CURRENT_DATE
                          ORDER BY calendar_date DESC LIMIT 1),
                        'P', (SELECT id FROM users WHERE email='fpalacios@ggm.edu.co'), now())
                ON CONFLICT ON CONSTRAINT attendance_unique_slot DO NOTHING
                """, documento, bloqueId);
    }

    private String token() { return tokenDe("fpalacios@ggm.edu.co", "DOCENTE"); }

    @Test
    void un_bloque_sin_ningun_registro_aparece_como_pendiente() throws Exception {
        mvc.perform(get("/api/reports/pending-today").header("Authorization", token()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.grade=='999')]").exists());
    }

    @Test
    void un_bloque_con_solo_algunos_registros_SIGUE_pendiente() throws Exception {
        registrar("9990000001");
        // Este era el defecto: un unico registro bastaba para darlo por completo,
        // y nadie avisaba de que faltaban los otros dos.
        mvc.perform(get("/api/reports/pending-today").header("Authorization", token()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.grade=='999')]").exists());
    }

    @Test
    void con_todos_los_estudiantes_registrados_ya_no_aparece() throws Exception {
        registrar("9990000001");
        registrar("9990000002");
        registrar("9990000003");
        mvc.perform(get("/api/reports/pending-today").header("Authorization", token()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.grade=='999')]").doesNotExist());
    }
}
