package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.repository.ReportRepository;
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
    @Autowired ReportRepository reportRepo;

    private Long bloqueId;
    private Long bloqueId2;
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
        // Segundo bloque del mismo curso el mismo dia, para probar que un
        // estudiante ausente en varios bloques cuenta como UN ausente, no uno
        // por bloque (attendance guarda una fila por estudiante+bloque+dia).
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id)
                VALUES ('777', 1, 7, '13:00', '13:50',
                        (SELECT id FROM subjects WHERE name='MateriaHoy'), ?)
                ON CONFLICT (grade, weekday, block_no) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
                """, docenteId);
        bloqueId2 = jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade='777' AND block_no=7", Long.class);
        jdbcBase.update("DELETE FROM attendance WHERE schedule_block_id IN (?, ?)", bloqueId, bloqueId2);

        // Curso huerfano sin estudiantes activos: su bloque no debe contarse ni
        // como esperado ni como pendiente (defecto B). weekday=3 (miercoles) no
        // lo usa ningun otro test de la suite, para no heredar ruido de bloques
        // ajenos al contar "todos los del dia de la semana".
        jdbcBase.update(
                "INSERT INTO subjects (name) VALUES ('MateriaHuerfana') ON CONFLICT (name) DO NOTHING");
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id)
                VALUES ('779', 3, 8, '14:00', '14:50',
                        (SELECT id FROM subjects WHERE name='MateriaHuerfana'), ?)
                ON CONFLICT (grade, weekday, block_no) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
                """, docenteId);
    }

    private void marcar(String documento, String estado) {
        marcarEnBloque(documento, estado, bloqueId);
    }

    private void marcarEnBloque(String documento, String estado, Long bloque) {
        jdbcBase.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                        status, recorded_by, recorded_at)
                VALUES (gen_random_uuid(), (SELECT id FROM students WHERE document_id = ?),
                        ?, ?, ?, ?, now())
                ON CONFLICT ON CONSTRAINT attendance_unique_slot DO UPDATE SET status = EXCLUDED.status
                """, documento, bloque, LUNES, estado, docenteId);
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
    void el_mes_trae_totales_y_desglose_por_curso_incluso_sin_dia_lectivo() {
        marcar("7770000001", "P");
        marcar("7770000002", "F");
        // Domingo posterior a LUNES dentro del mismo mes: no lectivo, pero el
        // resumen del mes no depende de que hoy se pueda tomar asistencia --
        // son datos acumulados de dias anteriores del mes (2026-03-15).
        var r = hoy.resumen(LocalDate.parse("2026-03-15"));
        assertThat(r.mesPresentes() + r.mesTarde() + r.mesAusentes() + r.mesEvasiones())
                .isGreaterThan(0);
        assertThat(r.mesPorCurso()).isNotEmpty();
    }

    @Test
    void un_curso_sin_ningun_registro_en_el_mes_no_aparece_como_100_por_ciento() {
        // El curso 777 recien creado en @BeforeEach no tiene marcas todavia en
        // este test: debe salir marcado sinRegistros, no con 0.0 confundible
        // con "cero ausencias", y nunca al frente de la lista como si fuera
        // el mejor curso del mes.
        var r = hoy.resumen(LUNES);
        var curso777 = r.mesPorCurso().stream()
                .filter(c -> c.grade().equals("777")).findFirst().orElseThrow();
        assertThat(curso777.sinRegistros()).isTrue();
        assertThat(r.mesPorCurso().get(r.mesPorCurso().size() - 1).sinRegistros()).isTrue();
    }

    @Test
    void un_estudiante_ausente_en_varios_bloques_del_dia_cuenta_como_un_solo_ausente() {
        marcarEnBloque("7770000001", "F", bloqueId);
        marcarEnBloque("7770000001", "F", bloqueId2);
        var r = hoy.resumen(LUNES);
        assertThat(r.ausentes()).isEqualTo(1);
    }

    @Test
    void un_curso_sin_estudiantes_activos_no_infla_los_bloques_esperados() {
        // El bloque huerfano de 779 (weekday=3, sin estudiantes activos) no debe
        // contarse como esperado; si se cuenta, "faltan" queda positivo para
        // siempre porque nunca puede aparecer como reportado (countBlocksReported
        // si excluye los cursos vacios, y con el guardia asimetrico esa resta
        // nunca cierra en cero).
        int esperados = reportRepo.countBlocksOfWeekday(3);
        int reportados = reportRepo.countBlocksReported(3, LocalDate.parse("2026-03-11"));
        assertThat(esperados).isZero();
        assertThat(reportados).isEqualTo(esperados);
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
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "ADMIN")))
           .andExpect(status().isOk());
    }

    @Test
    void la_grafica_del_mes_cuenta_las_ausencias_por_estudiante_y_no_por_marca() {
        // El mismo estudiante ausente en sus dos bloques del dia es UNA ausencia en la
        // grafica del inicio, no dos: contando marcas, un dia normal parecia una
        // catastrofe (una falta de dia completo son seis marcas).
        marcarEnBloque("7770000001", "F", bloqueId);
        marcarEnBloque("7770000001", "F", bloqueId2);
        marcarEnBloque("7770000002", "T", bloqueId);

        var dia = hoy.resumen(LUNES).mesPorDia().stream()
                .filter(d -> d.classDate().equals(LUNES))
                .findFirst().orElseThrow();

        assertThat(dia.absent()).isEqualTo(1);
        assertThat(dia.late()).isEqualTo(1);
    }

    @Test
    void la_grafica_del_mes_solo_llega_hasta_el_dia_consultado() {
        marcar("7770000001", "P");
        var serie = hoy.resumen(LUNES).mesPorDia();
        assertThat(serie).isNotEmpty();
        assertThat(serie).allSatisfy(d -> {
            assertThat(d.classDate()).isAfterOrEqualTo(LUNES.withDayOfMonth(1));
            assertThat(d.classDate()).isBeforeOrEqualTo(LUNES);
        });
    }
}
