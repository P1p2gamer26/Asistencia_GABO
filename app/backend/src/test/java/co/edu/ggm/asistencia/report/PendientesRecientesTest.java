package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Las listas que el docente no alcanzo a tomar en dias lectivos pasados: lo unico
 * accionable que le queda cuando hoy no hay clase.
 *
 * Semana propia (2026-04-20 al 2026-04-27, curso 995), lectiva de lunes a viernes sin
 * festivos ni vacaciones de por medio, y "hoy" fijo a proposito: nada aqui consulta el
 * reloj del servidor, igual que en MiDiaTest.
 */
@AutoConfigureMockMvc
class PendientesRecientesTest extends AbstractIntegrationTest {

    // dias=5 antes de "hoy" (2026-04-28, martes lectivo):
    // 04-27(lun), 04-24(vie), 04-23(jue), 04-22(mie), 04-21(mar).
    // Con 5 no entra el lunes anterior (04-20), asi que solo hay un lunes en la
    // ventana y el bloque semanal no aparece duplicado.
    private static final String QS = "?hoy=" + "2026-04-28" + "&dias=5";
    private static final String LUNES_PREVIO = "2026-04-27";
    private static final String MARTES_PREVIO = "2026-04-21";

    private Long docenteId;
    private Long bloqueLunesId;

    @BeforeEach
    void datos() {
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES ('pendrec@pendrectest.co', 'x', 'Docente Pendientes Recientes', 'DOCENTE', TRUE)
                ON CONFLICT (email) DO NOTHING
                """);
        docenteId = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = 'pendrec@pendrectest.co'", Long.class);

        jdbcBase.update("""
                INSERT INTO students (document_id, first_name, last_name, grade, active)
                VALUES ('9950000001','UNO','PENDREC','995',TRUE),
                       ('9950000002','DOS','PENDREC','995',TRUE)
                ON CONFLICT (document_id) DO NOTHING
                """);

        jdbcBase.update(
                "INSERT INTO subjects (name) VALUES ('MateriaPendRec') ON CONFLICT (name) DO NOTHING");

        // Bloque del lunes (weekday=1): sin tomar en ninguno de los tests salvo que se
        // marque explicitamente.
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id, room)
                VALUES ('995', 1, 8, '15:00', '15:50',
                        (SELECT id FROM subjects WHERE name = 'MateriaPendRec'), ?, 'Aula PR')
                ON CONFLICT (grade, weekday, block_no) DO UPDATE
                  SET teacher_id = EXCLUDED.teacher_id
                """, docenteId);
        bloqueLunesId = jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade = '995' AND weekday = 1 AND block_no = 8",
                Long.class);
        jdbcBase.update("DELETE FROM attendance WHERE schedule_block_id = ?", bloqueLunesId);
    }

    @Autowired MockMvc mvc;

    private String tokenDocente() {
        return tokenDe("pendrec@pendrectest.co", "DOCENTE");
    }

    @Test
    void un_bloque_pasado_sin_tomar_aparece_como_pendiente() throws Exception {
        mvc.perform(get("/api/reports/pending-recent" + QS)
                .header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.grade=='995')].fecha").value(LUNES_PREVIO))
           .andExpect(jsonPath("$[?(@.grade=='995')].room").value("Aula PR"))
           .andExpect(jsonPath("$[?(@.grade=='995')].subject").value("MateriaPendRec"));
    }

    @Test
    void un_bloque_ya_tomado_por_completo_no_aparece() throws Exception {
        for (String doc : new String[] {"9950000001", "9950000002"}) {
            jdbcBase.update("""
                    INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                            status, recorded_by, recorded_at)
                    VALUES (gen_random_uuid(), (SELECT id FROM students WHERE document_id = ?),
                            ?, ?, 'P', ?, now())
                    ON CONFLICT ON CONSTRAINT attendance_unique_slot DO NOTHING
                    """, doc, bloqueLunesId, LocalDate.parse(LUNES_PREVIO), docenteId);
        }
        mvc.perform(get("/api/reports/pending-recent" + QS)
                .header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.grade=='995')]").isEmpty());
    }

    @Test
    void un_curso_sin_estudiantes_activos_no_es_una_lista_pendiente() throws Exception {
        // Bloque del martes previo, curso propio sin ningun estudiante activo: nadie
        // puede tomar esa lista, asi que no debe figurar como pendiente.
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id, room)
                VALUES ('995vacio', 2, 8, '15:00', '15:50',
                        (SELECT id FROM subjects WHERE name = 'MateriaPendRec'), ?, 'Aula PR')
                ON CONFLICT (grade, weekday, block_no) DO UPDATE
                  SET teacher_id = EXCLUDED.teacher_id
                """, docenteId);

        mvc.perform(get("/api/reports/pending-recent" + QS)
                .header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.grade=='995vacio')]").isEmpty());
    }

    @Test
    void ordena_del_mas_reciente_al_mas_antiguo() throws Exception {
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id, room)
                VALUES ('995', 2, 8, '15:00', '15:50',
                        (SELECT id FROM subjects WHERE name = 'MateriaPendRec'), ?, 'Aula PR')
                ON CONFLICT (grade, weekday, block_no) DO UPDATE
                  SET teacher_id = EXCLUDED.teacher_id
                """, docenteId);

        mvc.perform(get("/api/reports/pending-recent" + QS)
                .header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].fecha").value(LUNES_PREVIO))
           .andExpect(jsonPath("$[1].fecha").value(MARTES_PREVIO));
    }
}
