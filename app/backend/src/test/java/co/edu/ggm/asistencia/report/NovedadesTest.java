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
    private Long bloqueId2;
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
        // Segundo bloque del mismo curso el mismo dia de la semana, para poder
        // sembrar una ausencia de "dia completo" (varios bloques, un estudiante).
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id)
                VALUES ('999', 1, 7, '13:00', '13:50',
                        (SELECT id FROM subjects WHERE name='MateriaNov'), ?)
                ON CONFLICT (grade, weekday, block_no) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
                """, docenteId);
        bloqueId2 = jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade='999' AND block_no=7", Long.class);
        jdbcBase.update("DELETE FROM attendance WHERE schedule_block_id IN (?, ?)", bloqueId, bloqueId2);
    }

    private void marcar(String documento, String estado, String comentario) {
        marcarEnBloque(documento, estado, comentario, bloqueId);
    }

    private void marcarEnBloque(String documento, String estado, String comentario, Long bloque) {
        marcarEnBloqueEnFecha(documento, estado, comentario, bloque, LUNES);
    }

    private void marcarEnBloqueEnFecha(String documento, String estado, String comentario,
                                       Long bloque, LocalDate fecha) {
        jdbcBase.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                        status, comment, recorded_by, recorded_at)
                VALUES (gen_random_uuid(), (SELECT id FROM students WHERE document_id = ?),
                        ?, ?, ?, ?, ?, now())
                ON CONFLICT ON CONSTRAINT attendance_unique_slot
                  DO UPDATE SET status = EXCLUDED.status, comment = EXCLUDED.comment
                """, documento, bloque, fecha, estado, comentario, docenteId);
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
    void un_estudiante_ausente_en_todos_los_bloques_del_dia_aparece_una_sola_vez() {
        // El curso 999 tiene 2 bloques el lunes (block_no 6 y 7). Ausente en los
        // dos = ausente el dia completo, no dos filas del cuadro ocupadas por el
        // mismo estudiante desplazando a los demas.
        marcarEnBloque("9990000001", "F", null, bloqueId);
        marcarEnBloque("9990000001", "F", null, bloqueId2);

        var r = novedades.build(LUNES.minusDays(1), LUNES, 10);

        assertThat(r.ausencias()).hasSize(1);
        assertThat(r.ausencias().get(0).comment()).containsIgnoringCase("dia completo");
    }

    @Test
    void un_estudiante_ausente_en_parte_de_los_bloques_dice_cuantos_de_cuantos() {
        marcarEnBloque("9990000001", "F", null, bloqueId);
        marcarEnBloque("9990000001", "P", null, bloqueId2);

        var r = novedades.build(LUNES.minusDays(1), LUNES, 10);

        assertThat(r.ausencias()).hasSize(1);
        assertThat(r.ausencias().get(0).comment()).isEqualTo("1 de 2 clases");
    }

    @Test
    void el_limite_de_ausencias_cuenta_estudiantes_no_filas() {
        // Sin agrupar, un solo estudiante ausente en 2 bloques ocuparia 2 de los
        // 10 cupos del limite; agrupado, ocupa 1, tal como promete el parametro.
        marcarEnBloque("9990000001", "F", null, bloqueId);
        marcarEnBloque("9990000001", "F", null, bloqueId2);
        marcarEnBloque("9990000002", "F", null, bloqueId);

        var r = novedades.build(LUNES.minusDays(1), LUNES, 10);

        assertThat(r.ausencias()).hasSize(2);
    }

    @Test
    void el_que_falto_todo_el_dia_no_lo_tapa_el_que_falto_a_una_sola_clase() {
        // Grado propio ('998') y fecha propia (OTRA_FECHA), no los compartidos
        // '999'/LUNES de los demas tests de esta clase: PendientesTest cuenta
        // estudiantes activos de grado 999 para decidir si un bloque ya quedo
        // completo, y esta suite no limpia la base entre clases de test (ver
        // TestDatabaseConfig) -- sumar un estudiante mas ahi rompe ese conteo
        // en una clase que ni se toca aqui. Una fecha distinta evita ademas que
        // estas 5 filas nuevas se cuelen en el build(LUNES-1, LUNES, ...) que
        // usan los demas tests de este archivo (no hay rollback entre metodos).
        //
        // 5 estudiantes el mismo dia: cuatro faltan a una sola clase (el caso
        // leve, ids mas bajos -- van primero en cualquier orden incidental de la
        // base), y el ultimo en sembrarse (id mas alto) falta a TODO el dia (2 de
        // 2 bloques, el caso grave). Con limite=4 solo caben 4 de los 5; el grave
        // no se puede quedar afuera solo por el orden en que la base devuelva
        // los empates de fecha -- por eso, ademas de estar presente, debe quedar
        // de PRIMERO una vez que se ordene tambien por gravedad.
        jdbcBase.update(
                "INSERT INTO subjects (name) VALUES ('MateriaGravedad') ON CONFLICT (name) DO NOTHING");
        jdbcBase.update("""
                INSERT INTO students (document_id, first_name, last_name, grade, active)
                VALUES ('9980000001','UNO','GRAVEDAD','998',TRUE),
                       ('9980000002','DOS','GRAVEDAD','998',TRUE),
                       ('9980000003','TRES','GRAVEDAD','998',TRUE),
                       ('9980000004','CUATRO','GRAVEDAD','998',TRUE),
                       ('9980000009','GRAVE','GRAVEDAD','998',TRUE)
                ON CONFLICT (document_id) DO NOTHING
                """);
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id)
                VALUES ('998', 1, 1, '06:30', '07:20',
                        (SELECT id FROM subjects WHERE name='MateriaGravedad'), ?),
                       ('998', 1, 2, '07:20', '08:10',
                        (SELECT id FROM subjects WHERE name='MateriaGravedad'), ?)
                ON CONFLICT (grade, weekday, block_no) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
                """, docenteId, docenteId);
        Long bloqueLeve = jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade='998' AND block_no=1", Long.class);
        Long bloqueGrave = jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade='998' AND block_no=2", Long.class);
        jdbcBase.update("DELETE FROM attendance WHERE schedule_block_id IN (?, ?)", bloqueLeve, bloqueGrave);

        LocalDate otraFecha = LUNES.minusWeeks(1);
        marcarEnBloqueEnFecha("9980000001", "F", null, bloqueLeve, otraFecha);
        marcarEnBloqueEnFecha("9980000002", "F", null, bloqueLeve, otraFecha);
        marcarEnBloqueEnFecha("9980000003", "F", null, bloqueLeve, otraFecha);
        marcarEnBloqueEnFecha("9980000004", "F", null, bloqueLeve, otraFecha);
        marcarEnBloqueEnFecha("9980000009", "F", null, bloqueLeve, otraFecha);
        marcarEnBloqueEnFecha("9980000009", "F", null, bloqueGrave, otraFecha);

        var r = novedades.build(otraFecha.minusDays(1), otraFecha, 4);

        assertThat(r.ausencias()).hasSize(4);
        assertThat(r.ausencias()).anyMatch(n -> n.fullName().contains("GRAVE GRAVEDAD")
                && n.comment().equalsIgnoreCase("Falto el dia completo"));
        assertThat(r.ausencias().get(0).fullName()).contains("GRAVE GRAVEDAD");
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
