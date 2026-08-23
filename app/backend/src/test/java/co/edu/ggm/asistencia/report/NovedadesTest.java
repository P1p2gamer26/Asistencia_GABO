package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.service.NovedadesService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Se prueba el servicio con fechas explicitas, no el endpoint con "hoy": un test que
 * dependa del dia se salta datos segun cuando se corra (ver HoyTest, misma razon).
 */
@AutoConfigureMockMvc
class NovedadesTest extends AbstractIntegrationTest {

    private static final LocalDate LUNES = LocalDate.parse("2026-03-09");

    @Autowired MockMvc mvc;
    @Autowired NovedadesService novedades;

    private Long bloqueId;
    private Long docenteId;

    @BeforeEach
    void datos() {
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES ('nov@novtest.co', 'x', 'Docente Nov', 'DOCENTE', TRUE)
                ON CONFLICT (email) DO NOTHING
                """);
        docenteId = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = 'nov@novtest.co'", Long.class);
        jdbcBase.update(
                "INSERT INTO subjects (name) VALUES ('MateriaNov') ON CONFLICT (name) DO NOTHING");
        jdbcBase.update("""
                INSERT INTO students (document_id, first_name, last_name, grade, active)
                VALUES ('9990000001','UNO','NOV','999',TRUE), ('9990000002','DOS','NOV','999',TRUE)
                ON CONFLICT (document_id) DO NOTHING
                """);
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id)
                VALUES ('999', 1, 6, '12:00', '12:50',
                        (SELECT id FROM subjects WHERE name='MateriaNov'), ?)
                ON CONFLICT (grade, weekday, block_no) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
                """, docenteId);
        bloqueId = jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade='999' AND block_no=6", Long.class);
        jdbcBase.update("DELETE FROM attendance WHERE schedule_block_id = ?", bloqueId);
    }

    private void marcar(String documento, String estado, String comentario) {
        jdbcBase.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                        status, comment, recorded_by, recorded_at)
                VALUES (gen_random_uuid(), (SELECT id FROM students WHERE document_id = ?),
                        ?, ?, ?, ?, ?, now())
                ON CONFLICT ON CONSTRAINT attendance_unique_slot
                  DO UPDATE SET status = EXCLUDED.status, comment = EXCLUDED.comment
                """, documento, bloqueId, LUNES, estado, comentario, docenteId);
    }

    @Test
    void separa_evasiones_de_ausencias_y_trae_el_curso() {
        marcar("9990000001", "E", "se salio del salon");
        marcar("9990000002", "F", null);

        var r = novedades.build(LUNES.minusDays(1), LUNES, 10);

        assertThat(r.evasiones()).hasSize(1);
        assertThat(r.evasiones().get(0).fullName()).contains("UNO NOV");
        assertThat(r.evasiones().get(0).grade()).isEqualTo("999");
        assertThat(r.evasiones().get(0).comment()).isEqualTo("se salio del salon");

        assertThat(r.ausencias()).hasSize(1);
        assertThat(r.ausencias().get(0).fullName()).contains("DOS NOV");
        assertThat(r.ausencias().get(0).grade()).isEqualTo("999");
    }

    @Test
    void sin_novedades_en_el_periodo_lo_dice_sin_fingir_que_nadie_tomo_asistencia() {
        // Se marco asistencia (hay registros) pero nadie evadio ni falto: el
        // cuadro debe decir "no hay evasiones/ausencias", no quedarse mudo.
        marcar("9990000001", "P", null);
        marcar("9990000002", "T", null);

        var r = novedades.build(LUNES.minusDays(1), LUNES, 10);

        assertThat(r.evasiones()).isEmpty();
        assertThat(r.ausencias()).isEmpty();
        assertThat(r.sinRegistros()).isFalse();
    }

    @Test
    void si_nadie_tomo_asistencia_en_el_periodo_lo_distingue_de_cero_novedades() {
        // Ningun marcar(): el periodo no tiene ni un solo registro de asistencia.
        // Reportar "0 evasiones, 0 ausencias" aqui seria decirle al rector que
        // el dia salio limpio cuando en realidad nadie paso lista.
        var r = novedades.build(LUNES.minusDays(1), LUNES, 10);

        assertThat(r.evasiones()).isEmpty();
        assertThat(r.ausencias()).isEmpty();
        assertThat(r.sinRegistros()).isTrue();
    }

    @Test
    void respeta_el_limite() {
        marcar("9990000001", "E", "uno");
        marcar("9990000002", "E", "dos");
        var r = novedades.build(LUNES.minusDays(1), LUNES, 1);
        assertThat(r.evasiones()).hasSize(1);
    }

    @Test
    void un_docente_no_puede_ver_las_novedades_del_colegio() throws Exception {
        mvc.perform(get("/api/reports/novedades")
                        .header("Authorization", "Bearer " + jwt.issueAccess(docenteId, "DOCENTE")))
           .andExpect(status().isForbidden());
    }

    @Test
    void coordinacion_si_puede_y_el_contrato_trae_curso_y_evasiones() throws Exception {
        mvc.perform(get("/api/reports/novedades").param("dias", "365").param("limite", "10")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.evasiones").exists())
           .andExpect(jsonPath("$.ausencias").exists())
           .andExpect(jsonPath("$.sinRegistros").exists());
    }
}
