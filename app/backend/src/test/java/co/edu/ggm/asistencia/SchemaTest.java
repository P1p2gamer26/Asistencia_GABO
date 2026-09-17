package co.edu.ggm.asistencia;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SchemaTest extends AbstractIntegrationTest {

    @Autowired JdbcTemplate jdbc;

    private static final String INSERT_ASISTENCIA = """
            INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status, recorded_by, recorded_at)
            VALUES (gen_random_uuid(),
                    (SELECT id FROM students WHERE document_id = '1010101010'),
                    (SELECT id FROM schedule_blocks LIMIT 1),
                    DATE '2026-03-02', 'P',
                    (SELECT id FROM users WHERE email = 'fpalacios@ggm.edu.co'), now())
            """;

    @Test
    void la_semilla_carga_los_estudiantes() {
        // Se comprueba que la semilla esta, no cuantos estudiantes hay en total:
        // otras clases de test importan estudiantes legitimamente y un conteo global
        // convertiria esta prueba en dependiente del orden de ejecucion.
        Integer semilla = jdbc.queryForObject("""
                SELECT count(*) FROM students
                WHERE document_id IN ('1010101010', '1010101011', '1010101012')
                """, Integer.class);
        assertThat(semilla).isEqualTo(3);
    }

    @Test
    void no_se_puede_registrar_dos_veces_el_mismo_estudiante_en_el_mismo_bloque_y_dia() {
        jdbc.update(INSERT_ASISTENCIA);
        assertThatThrownBy(() -> jdbc.update(INSERT_ASISTENCIA))
                .hasMessageContaining("attendance_unique_slot");
    }

    @Test
    void el_estado_de_asistencia_solo_admite_P_T_F_E() {
        assertThatThrownBy(() -> jdbc.update(INSERT_ASISTENCIA.replace("'P',", "'X',")))
                .hasMessageContaining("status");
    }

    @Test
    void el_calendario_marca_los_festivos_como_no_lectivos() {
        String tipo = jdbc.queryForObject(
                "SELECT day_type FROM school_calendar WHERE calendar_date = DATE '2026-07-20'",
                String.class);
        assertThat(tipo).isEqualTo("FESTIVO");
    }

    @Test
    void semana_santa_quedo_como_vacaciones_y_no_como_lectivo() {
        Integer lectivos = jdbc.queryForObject("""
                SELECT count(*) FROM school_calendar
                WHERE calendar_date BETWEEN DATE '2026-03-30' AND DATE '2026-04-03'
                  AND day_type = 'LECTIVO'
                """, Integer.class);
        assertThat(lectivos).isZero();
    }

    @Test
    void el_ano_escolar_tiene_un_numero_de_dias_lectivos_razonable() {
        Integer lectivos = jdbc.queryForObject(
                "SELECT count(*) FROM school_calendar WHERE day_type = 'LECTIVO'", Integer.class);
        // El minimo legal en Colombia son 40 semanas; el tope sano es 200 dias.
        assertThat(lectivos).isBetween(170, 200);
    }

    @Test
    void los_sabados_y_domingos_no_existen_en_el_calendario() {
        Integer finesDeSemana = jdbc.queryForObject("""
                SELECT count(*) FROM school_calendar
                WHERE EXTRACT(ISODOW FROM calendar_date) > 5 AND day_type = 'LECTIVO'
                """, Integer.class);
        assertThat(finesDeSemana).isZero();
    }

    @Test
    void el_dia_de_ciclo_omite_un_lunes_festivo_y_reinicia_cada_ano() {
        jdbc.update("""
                INSERT INTO school_calendar (calendar_date, day_type) VALUES
                    (DATE '2027-01-04', 'FESTIVO'),
                    (DATE '2027-01-05', 'LECTIVO'), (DATE '2027-01-06', 'LECTIVO'),
                    (DATE '2027-01-07', 'LECTIVO'), (DATE '2027-01-08', 'LECTIVO'),
                    (DATE '2027-01-11', 'LECTIVO')
                ON CONFLICT (calendar_date) DO UPDATE SET day_type = EXCLUDED.day_type
                """);

        assertThat(jdbc.queryForObject("SELECT dia_ciclo(DATE '2027-01-04')", Integer.class)).isNull();
        assertThat(jdbc.queryForObject("SELECT dia_ciclo(DATE '2027-01-05')", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT dia_ciclo(DATE '2027-01-08')", Integer.class)).isEqualTo(4);
        assertThat(jdbc.queryForObject("SELECT dia_ciclo(DATE '2027-01-11')", Integer.class)).isEqualTo(5);
    }
}
