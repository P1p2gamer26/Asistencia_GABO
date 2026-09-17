package co.edu.ggm.asistencia.calendar;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.service.CalendarService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class AnclaDiaCicloTest extends AbstractIntegrationTest {

    @Autowired JdbcTemplate jdbc;
    @Autowired CalendarService calendar;

    // Ano 2028 aislado: cinco lectivos seguidos, sin anclas, dias 1..5.
    static final LocalDate D1 = LocalDate.of(2028, 1, 3);

    @BeforeEach
    void lectivos() {
        jdbc.update("DELETE FROM school_calendar WHERE EXTRACT(YEAR FROM calendar_date) = 2028");
        for (int i = 0; i < 5; i++) {
            jdbc.update("INSERT INTO school_calendar (calendar_date, day_type) VALUES (?, 'LECTIVO')",
                    D1.plusDays(i));
        }
    }

    int ciclo(int offset) {
        return calendar.cycleDay(D1.plusDays(offset));
    }

    @Test
    void en_cascada_los_siguientes_cuentan_desde_el_ancla() {
        calendar.fijarDiaCiclo(D1.plusDays(1), 3, true, null);
        assertThat(ciclo(0)).isEqualTo(1);
        assertThat(ciclo(1)).isEqualTo(3);
        assertThat(ciclo(2)).isEqualTo(4);
        assertThat(ciclo(4)).isEqualTo(1);
    }

    @Test
    void solo_este_dia_deja_los_demas_como_estaban() {
        calendar.fijarDiaCiclo(D1.plusDays(1), 5, false, null);
        assertThat(ciclo(1)).isEqualTo(5);
        assertThat(ciclo(2)).isEqualTo(3);
        assertThat(ciclo(4)).isEqualTo(5);
    }

    @Test
    void quitar_el_ancla_vuelve_al_conteo_automatico() {
        calendar.fijarDiaCiclo(D1.plusDays(1), 3, true, null);
        calendar.fijarDiaCiclo(D1.plusDays(1), null, true, null);
        assertThat(ciclo(1)).isEqualTo(2);
        assertThat(ciclo(4)).isEqualTo(5);
    }
}
