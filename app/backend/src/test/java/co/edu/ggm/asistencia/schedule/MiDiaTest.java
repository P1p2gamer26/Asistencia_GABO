package co.edu.ggm.asistencia.schedule;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;

import static org.hamcrest.Matchers.greaterThan;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Usa su propio docente, materia y curso (601z, distinto del 601 real que usa
 * BootstrapTest) para no chocar con la semilla ni con otras clases de test.
 */
@AutoConfigureMockMvc
class MiDiaTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    /** Un lunes lectivo. La fecha va fija a proposito: nada aqui consulta el reloj. */
    private static final String LUNES = "2026-08-03";

    private Long docenteId;
    private Long bloqueId;

    private String tokenDeDocenteConHorario(String fecha, String grade, String subject,
                                            String room) {
        return tokenDeDocenteConHorario(fecha, grade, subject, room, "midia@midiatest.co");
    }

    private String tokenDeDocenteConHorario(String fecha, String grade, String subject,
                                            String room, String email) {
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES (?, 'x', 'Pepita Midia', 'DOCENTE', TRUE)
                ON CONFLICT (email) DO NOTHING
                """, email);
        docenteId = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, email);

        jdbcBase.update(
                "INSERT INTO subjects (name) VALUES (?) ON CONFLICT (name) DO NOTHING", subject);

        int weekday = diaCiclo(fecha);
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id, room)
                VALUES (?, ?, 1, '07:00', '07:50',
                        (SELECT id FROM subjects WHERE name = ?), ?, ?)
                ON CONFLICT (grade, weekday, block_no) DO UPDATE
                  SET teacher_id = EXCLUDED.teacher_id, room = EXCLUDED.room,
                      subject_id = EXCLUDED.subject_id
                """, grade, weekday, subject, docenteId, room);
        bloqueId = jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade = ? AND weekday = ? AND block_no = 1",
                Long.class, grade, weekday);
        // Cada test parte limpio: sin esto, la marca de un test anterior se cuela en otro.
        jdbcBase.update("DELETE FROM attendance WHERE schedule_block_id = ?", bloqueId);

        // Cinco estudiantes activos: suficientes para probar "marcados < estudiantes".
        for (int i = 1; i <= 5; i++) {
            jdbcBase.update("""
                    INSERT INTO students (document_id, first_name, last_name, grade, active)
                    VALUES (?, 'ESTUDIANTE', 'MIDIA', ?, TRUE)
                    ON CONFLICT (document_id) DO NOTHING
                    """, grade + "0000" + i, grade);
        }

        return "Bearer " + jwt.issueAccess(docenteId, "DOCENTE");
    }

    private int diaCiclo(String fecha) {
        jdbcBase.update("""
                INSERT INTO school_calendar (calendar_date, day_type) VALUES (?, 'LECTIVO')
                ON CONFLICT (calendar_date) DO UPDATE SET day_type = 'LECTIVO'
                """, LocalDate.parse(fecha));
        return jdbcBase.queryForObject("SELECT dia_ciclo(?::date)", Integer.class, fecha);
    }

    private void marcarPrimeros(String fecha, String grade, int n) {
        var ids = jdbcBase.queryForList(
                "SELECT id FROM students WHERE grade = ? ORDER BY document_id LIMIT ?",
                Long.class, grade, n);
        for (Long estudianteId : ids) {
            jdbcBase.update("""
                    INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                            status, recorded_by, recorded_at)
                    VALUES (gen_random_uuid(), ?, ?, ?, 'P', ?, now())
                    ON CONFLICT DO NOTHING
                    """, estudianteId, bloqueId, LocalDate.parse(fecha), docenteId);
        }
    }

    private void marcarFestivo(String fecha, String motivo) {
        jdbcBase.update("""
                INSERT INTO school_calendar (calendar_date, day_type, description)
                VALUES (?, 'FESTIVO', ?)
                ON CONFLICT (calendar_date) DO UPDATE
                  SET day_type = EXCLUDED.day_type, description = EXCLUDED.description
                """, LocalDate.parse(fecha), motivo);
    }

    @Test
    void devuelve_los_bloques_del_dia_con_el_aula() throws Exception {
        String docente = tokenDeDocenteConHorario(LUNES, "601z", "Ciencias", "Laboratorio 1");
        mvc.perform(get("/api/schedule/my-day?fecha=" + LUNES).header("Authorization", docente))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.lectivo").value(true))
           .andExpect(jsonPath("$.bloques[0].grade").value("601z"))
           .andExpect(jsonPath("$.bloques[0].room").value("Laboratorio 1"))
           .andExpect(jsonPath("$.bloques[0].subject").value("Ciencias"));
    }

    @Test
    void dice_cuantos_lleva_marcados_de_cuantos_estudiantes() throws Exception {
        String docente = tokenDeDocenteConHorario(LUNES, "601z", "Ciencias", "Laboratorio 1");
        marcarPrimeros(LUNES, "601z", 3);
        mvc.perform(get("/api/schedule/my-day?fecha=" + LUNES).header("Authorization", docente))
           .andExpect(jsonPath("$.bloques[0].marcados").value(3))
           .andExpect(jsonPath("$.bloques[0].estudiantes", greaterThan(3)));
    }

    @Test
    void un_bloque_sin_marcar_dice_cero_y_no_se_omite() throws Exception {
        // Omitirlo esconderia justo el bloque que falta por hacer.
        String docente = tokenDeDocenteConHorario(LUNES, "601z", "Ciencias", "Laboratorio 1");
        mvc.perform(get("/api/schedule/my-day?fecha=" + LUNES).header("Authorization", docente))
           .andExpect(jsonPath("$.bloques.length()").value(1))
           .andExpect(jsonPath("$.bloques[0].marcados").value(0));
    }

    @Test
    void en_dia_no_lectivo_lo_dice_y_no_devuelve_bloques() throws Exception {
        String docente = tokenDeDocenteConHorario(LUNES, "601z", "Ciencias", "Laboratorio 1");
        marcarFestivo("2026-08-07", "Batalla de Boyaca");
        mvc.perform(get("/api/schedule/my-day?fecha=2026-08-07").header("Authorization", docente))
           .andExpect(jsonPath("$.lectivo").value(false))
           .andExpect(jsonPath("$.motivo").value("Batalla de Boyaca"))
           .andExpect(jsonPath("$.bloques.length()").value(0));
    }

    @Test
    void sin_token_responde_401() throws Exception {
        mvc.perform(get("/api/schedule/my-day?fecha=" + LUNES))
           .andExpect(status().isUnauthorized());
    }

    @Test
    void un_estudiante_retirado_no_infla_los_marcados() throws Exception {
        // Curso y docente propios (601y / retiro@midiatest.co): con el mismo docente de
        // los demas tests, sus bloques se acumulan en el mismo dia de la semana y
        // rompen la cuenta de "un solo bloque" de otro test.
        String docente = tokenDeDocenteConHorario(LUNES, "601y", "Ciencias", "Laboratorio 1",
                "retiro@midiatest.co");
        marcarPrimeros(LUNES, "601y", 5); // los 5 estudiantes del curso quedan marcados
        // Uno de ellos se retira DESPUES de que se le tomo lista ese dia: su asistencia
        // pasada se conserva, pero ya no cuenta ni en el numerador ni en el denominador.
        jdbcBase.update("UPDATE students SET active = FALSE WHERE document_id = '601y00001'");

        mvc.perform(get("/api/schedule/my-day?fecha=" + LUNES).header("Authorization", docente))
           .andExpect(jsonPath("$.bloques[0].estudiantes").value(4))
           // Sin el arreglo, marcados cuenta las 5 filas de attendance (incluida la del
           // retirado) y da 5 de 4: mas marcados que estudiantes, el caso que rompe la
           // confianza en la pantalla.
           .andExpect(jsonPath("$.bloques[0].marcados").value(4));
    }
}
