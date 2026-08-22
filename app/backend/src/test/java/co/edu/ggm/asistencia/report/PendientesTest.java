package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.repository.ReportRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Comprueba que un bloque al que le faltan estudiantes sigue contando como pendiente.
 *
 * Se prueba el repositorio con una fecha explicita, no el endpoint, a proposito: el
 * endpoint usa "hoy", asi que un test que dependa de el se salta los fines de semana
 * y deja el arreglo sin verificar justo cuando nadie mira. Una primera version usaba
 * assumeTrue y efectivamente no llego a ejecutarse nunca en sabado.
 *
 * Usa su propio curso (grado 999) para no mutar la semilla: el contexto de Spring se
 * comparte entre clases y tocar los datos comunes rompe a las demas segun el orden.
 */
class PendientesTest extends AbstractIntegrationTest {

    /** Lunes lectivo fijo: la fecha no cambia con el dia en que se ejecute el test. */
    private static final LocalDate LUNES = LocalDate.parse("2026-03-02");
    private static final int LUNES_ISO = 1;

    @Autowired ReportRepository repo;

    private Long docenteId;
    private Long bloqueId;

    @BeforeEach
    void datos() {
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES ('pendientes@pendientestest.co', 'x', 'Docente Pendientes', 'DOCENTE', TRUE)
                ON CONFLICT (email) DO NOTHING
                """);
        docenteId = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = 'pendientes@pendientestest.co'", Long.class);

        jdbcBase.update("""
                INSERT INTO students (document_id, first_name, last_name, grade, active)
                VALUES ('9990000001','UNO','PENDIENTE','999',TRUE),
                       ('9990000002','DOS','PENDIENTE','999',TRUE),
                       ('9990000003','TRES','PENDIENTE','999',TRUE)
                ON CONFLICT (document_id) DO NOTHING
                """);

        jdbcBase.update(
                "INSERT INTO subjects (name) VALUES ('MateriaPendiente') ON CONFLICT (name) DO NOTHING");

        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id)
                VALUES ('999', ?, 7, '15:00', '15:50',
                        (SELECT id FROM subjects WHERE name = 'MateriaPendiente'), ?)
                ON CONFLICT (grade, weekday, block_no) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
                """, LUNES_ISO, docenteId);
        bloqueId = jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade = '999' AND block_no = 7", Long.class);

        jdbcBase.update("DELETE FROM attendance WHERE schedule_block_id = ?", bloqueId);
    }

    private void registrar(String documento) {
        jdbcBase.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                        status, recorded_by, recorded_at)
                VALUES (gen_random_uuid(), (SELECT id FROM students WHERE document_id = ?),
                        ?, ?, 'P', ?, now())
                ON CONFLICT ON CONSTRAINT attendance_unique_slot DO NOTHING
                """, documento, bloqueId, LUNES, docenteId);
    }

    private boolean apareceComoPendiente() {
        List<ReportRepository.PendingBlock> pendientes =
                repo.pendingToday(docenteId, LUNES_ISO, LUNES);
        return pendientes.stream().anyMatch(p -> "999".equals(p.getGrade()));
    }

    @Test
    void un_bloque_sin_ningun_registro_esta_pendiente() {
        assertThat(apareceComoPendiente()).isTrue();
    }

    @Test
    void un_bloque_con_solo_algunos_registros_SIGUE_pendiente() {
        registrar("9990000001");
        // Este era el defecto: un unico registro bastaba para darlo por completo y
        // nadie avisaba de que faltaban los otros dos.
        assertThat(apareceComoPendiente()).isTrue();
    }

    @Test
    void con_dos_de_tres_registrados_todavia_esta_pendiente() {
        registrar("9990000001");
        registrar("9990000002");
        assertThat(apareceComoPendiente()).isTrue();
    }

    @Test
    void con_todos_los_estudiantes_registrados_ya_no_aparece() {
        registrar("9990000001");
        registrar("9990000002");
        registrar("9990000003");
        assertThat(apareceComoPendiente()).isFalse();
    }

    @Test
    void un_estudiante_inactivo_no_cuenta_para_dar_el_bloque_por_completo() {
        jdbcBase.update("UPDATE students SET active = FALSE WHERE document_id = '9990000003'");
        registrar("9990000001");
        registrar("9990000002");
        try {
            // Con el tercero retirado del curso, dos registros ya cubren a los activos.
            assertThat(apareceComoPendiente()).isFalse();
        } finally {
            jdbcBase.update("UPDATE students SET active = TRUE WHERE document_id = '9990000003'");
        }
    }
}
