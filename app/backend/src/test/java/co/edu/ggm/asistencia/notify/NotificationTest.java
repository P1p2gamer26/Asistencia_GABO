package co.edu.ggm.asistencia.notify;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.notify.service.NotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationTest extends AbstractIntegrationTest {

    @Autowired NotificationService service;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void limpiar() {
        jdbc.update("DELETE FROM notifications");
        jdbc.update("DELETE FROM attendance");
        jdbc.update("DELETE FROM guardianships");
    }

    private void asistencia(String documento, String estado) {
        jdbc.update("""
            INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status, recorded_by, recorded_at)
            VALUES (gen_random_uuid(),
                    (SELECT id FROM students WHERE document_id = ?),
                    (SELECT id FROM schedule_blocks LIMIT 1),
                    DATE '2026-07-13', ?,
                    (SELECT id FROM users WHERE email = 'fpalacios@ggm.edu.co'), now())
            """, documento, estado);
    }

    private void acudiente(String documento, String correo) {
        jdbc.update("""
            INSERT INTO users (email, password_hash, full_name, role) VALUES (?, 'x', 'Acudiente', 'ACUDIENTE')
            ON CONFLICT (email) DO NOTHING
            """, correo);
        jdbc.update("""
            INSERT INTO guardianships (student_id, guardian_id, relationship)
            VALUES ((SELECT id FROM students WHERE document_id = ?),
                    (SELECT id FROM users WHERE email = ?), 'Madre')
            """, documento, correo);
    }

    @Test
    void una_evasion_encola_un_aviso_a_coordinacion() {
        asistencia("1010101010", "E");
        assertThat(service.enqueuePending()).isEqualTo(1);
        String destino = jdbc.queryForObject(
                "SELECT recipient FROM notifications WHERE kind = 'EVASION'", String.class);
        assertThat(destino).isEqualTo("coord@ggm.edu.co");
    }

    @Test
    void una_falta_encola_un_aviso_al_acudiente() {
        acudiente("1010101011", "mama@correo.com");
        asistencia("1010101011", "F");
        service.enqueuePending();
        String destino = jdbc.queryForObject(
                "SELECT recipient FROM notifications WHERE kind = 'AUSENCIA_DIA'", String.class);
        assertThat(destino).isEqualTo("mama@correo.com");
    }

    @Test
    void encolar_dos_veces_no_genera_avisos_repetidos() {
        acudiente("1010101011", "mama@correo.com");
        asistencia("1010101011", "F");
        service.enqueuePending();
        service.enqueuePending();
        Integer total = jdbc.queryForObject("SELECT count(*) FROM notifications", Integer.class);
        assertThat(total).isEqualTo(1);
    }

    @Test
    void una_falta_sin_acudiente_registrado_no_encola_nada_y_no_revienta() {
        asistencia("1010101010", "F");
        service.enqueuePending();
        Integer total = jdbc.queryForObject(
                "SELECT count(*) FROM notifications WHERE kind = 'AUSENCIA_DIA'", Integer.class);
        assertThat(total).isZero();
    }

    @Test
    void no_existen_faltas_en_dias_no_lectivos_que_puedan_generar_avisos() {
        Integer sospechosas = jdbc.queryForObject("""
                SELECT count(*) FROM attendance a
                LEFT JOIN school_calendar c ON c.calendar_date = a.class_date
                WHERE c.day_type IS DISTINCT FROM 'LECTIVO'
                """, Integer.class);
        assertThat(sospechosas).isZero();
    }
}
