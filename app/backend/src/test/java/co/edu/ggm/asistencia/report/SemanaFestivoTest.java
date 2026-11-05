package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Reproduccion: la semana que contiene un festivo (2026-11-02) responde 500 en /reports/semana. */
@AutoConfigureMockMvc
class SemanaFestivoTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void semana_con_festivo_responde_200() throws Exception {
        mvc.perform(get("/api/reports/semana")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "ADMIN"))
                        .param("grade", "601").param("from", "2026-11-02").param("to", "2026-11-06"))
                .andExpect(status().isOk());
    }
}
