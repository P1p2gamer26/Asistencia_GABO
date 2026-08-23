package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.service.TodayService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Se prueba el servicio con una fecha explicita, no el endpoint con "hoy": un test que
 * dependa del dia se salta los fines de semana y deja el arreglo sin verificar, que es
 * exactamente lo que ya paso una vez con los bloques pendientes.
 */
@AutoConfigureMockMvc
class HoyTest extends AbstractIntegrationTest {

    private static final LocalDate LUNES = LocalDate.parse("2026-03-09");

    @Autowired MockMvc mvc;
    @Autowired TodayService hoy;

    private Long bloqueId;
    private Long docenteId;

    @BeforeEach
    void datos() {
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES ('hoy@hoytest.co', 'x', 'Docente Hoy', 'DOCENTE', TRUE)
                ON CONFLICT (email) DO NOTHING
                """);
        docenteId = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = 'hoy@hoytest.co'", Long.class);
        jdbcBase.update(
                "INSERT INTO subjects (name) VALUES ('MateriaHoy') ON CONFLICT (name) DO NOTHING");
        jdbcBase.update("""
                INSERT INTO students (document_id, first_name, last_name, grade, active)
                VALUES ('7770000001','UNO','HOY','777',TRUE), ('7770000002','DOS','HOY','777',TRUE)
                ON CONFLICT (document_id) DO NOTHING
                """);
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id)
                VALUES ('777', 1, 6, '12:00', '12:50',
                        (SELECT id FROM subjects WHERE name='MateriaHoy'), ?)
                ON CONFLICT (grade, weekday, block_no) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
                """, docenteId);
        bloqueId = jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade='777' AND block_no=6", Long.class);
        jdbcBase.update("DELETE FROM attendance WHERE schedule_block_id = ?", bloqueId);
    }

    private void marcar(String documento, String estado) {
        jdbcBase.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                        status, recorded_by, recorded_at)
                VALUES (gen_random_uuid(), (SELECT id FROM students WHERE document_id = ?),
                        ?, ?, ?, ?, now())
                ON CONFLICT ON CONSTRAINT attendance_unique_slot DO UPDATE SET status = EXCLUDED.status
                """, documento, bloqueId, LUNES, estado, docenteId);
    }

    @Test
    void un_dia_lectivo_sin_nada_marcado_lo_dice() {
        var r = hoy.resumen(LUNES);
        assertThat(r.lectivo()).isTrue();
        assertThat(r.bloquesEsperados()).isGreaterThan(0);
        assertThat(r.presentes() + r.tarde() + r.ausentes() + r.evasiones()).isZero();
    }

    @Test
    void cuenta_los_estados_de_hoy() {
        marcar("7770000001", "P");
        marcar("7770000002", "F");
        var r = hoy.resumen(LUNES);
        assertThat(r.presentes()).isEqualTo(1);
        assertThat(r.ausentes()).isEqualTo(1);
    }

    @Test
    void cuenta_cuantos_bloques_han_reportado() {
        marcar("7770000001", "P");
        marcar("7770000002", "P");
        // El bloque de 777 esta completo; los demas del lunes siguen sin marcar.
        assertThat(hoy.resumen(LUNES).bloquesMarcados()).isGreaterThanOrEqualTo(1);
        assertThat(hoy.resumen(LUNES).bloquesMarcados())
                .isLessThanOrEqualTo(hoy.resumen(LUNES).bloquesEsperados());
    }

    @Test
    void un_dia_no_lectivo_no_espera_ningun_bloque() {
        // 2026-03-08 es domingo
        var r = hoy.resumen(LocalDate.parse("2026-03-08"));
        assertThat(r.lectivo()).isFalse();
        assertThat(r.bloquesEsperados()).isZero();
    }

    @Test
    void un_docente_no_puede_ver_el_resumen_del_colegio() throws Exception {
        mvc.perform(get("/api/reports/today")
                        .header("Authorization", "Bearer " + jwt.issueAccess(docenteId, "DOCENTE")))
           .andExpect(status().isForbidden());
    }

    @Test
    void coordinacion_si_puede() throws Exception {
        mvc.perform(get("/api/reports/today")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR")))
           .andExpect(status().isOk());
    }
}
