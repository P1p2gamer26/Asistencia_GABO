package co.edu.ggm.asistencia.entry;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class EntrySyncTest extends AbstractIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @AfterEach
    void limpiarDatosDelTest() {
        jdbc.update("""
                DELETE FROM entry_log
                WHERE id IN ('17171717-1717-4171-8171-171717171717',
                             '18181818-1818-4181-8181-181818181818')
                """);
    }

    @Test
    void elemento_incompleto_se_rechaza_sin_tumbar_el_lote() throws Exception {
        mvc.perform(post("/api/entry/sync").header("Authorization", tokenDe("fpalacios@ggm.edu.co", "DOCENTE"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"entries\":[{\"id\":null,\"documentId\":\"1010101010\",\"scannedAt\":\"2026-04-06T11:30:00Z\"}]}"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(0))
           .andExpect(jsonPath("$.rejected[0].reason").value("Registro incompleto"));
    }

    @Test
    void se_conserva_el_ingreso_mas_antiguo_del_dia() throws Exception {
        String token = tokenDe("fpalacios@ggm.edu.co", "DOCENTE");
        mvc.perform(post("/api/entry/sync").header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"entries\":[{\"id\":\"17171717-1717-4171-8171-171717171717\",\"documentId\":\"1010101010\",\"scannedAt\":\"2026-04-06T12:00:00Z\"}]}"))
           .andExpect(status().isOk());
        mvc.perform(post("/api/entry/sync").header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"entries\":[{\"id\":\"18181818-1818-4181-8181-181818181818\",\"documentId\":\"1010101010\",\"scannedAt\":\"2026-04-06T11:00:00Z\"}]}"))
           .andExpect(status().isOk());
        Instant scannedAt = jdbc.queryForObject("""
                SELECT scanned_at FROM entry_log
                WHERE student_id = (SELECT id FROM students WHERE document_id = '1010101010')
                  AND entry_date = DATE '2026-04-06'
                """, Instant.class);
        assertThat(scannedAt).isEqualTo(Instant.parse("2026-04-06T11:00:00Z"));
    }
}
