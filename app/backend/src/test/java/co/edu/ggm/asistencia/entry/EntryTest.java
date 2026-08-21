package co.edu.ggm.asistencia.entry;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.shared.service.JwtService;
import co.edu.ggm.asistencia.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class EntryTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;

    private String token() {
        var u = users.findByEmailAndActiveTrue("coord@ggm.edu.co").orElseThrow();
        return "Bearer " + jwt.issueAccess(u.getId(), "COORDINADOR");
    }

    private String lote(String uuid, String documento) {
        return """
               {"entries":[{"id":"%s","documentId":"%s","scannedAt":"2026-05-04T11:05:00Z"}]}
               """.formatted(uuid, documento);
    }

    @Test
    void un_escaneo_valido_registra_el_ingreso_y_devuelve_el_nombre() throws Exception {
        String uuid = "66666666-6666-4666-8666-666666666666";
        mvc.perform(post("/api/entry/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON).content(lote(uuid, "1010101012")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(1))
           .andExpect(jsonPath("$.names." + uuid).value("DANIEL ALEJANDRO BARRIOS PARATES"));
    }

    @Test
    void escanear_dos_veces_al_mismo_estudiante_el_mismo_dia_no_duplica() throws Exception {
        String cuerpo = lote("77777777-7777-4777-8777-777777777777", "1010101011");
        mvc.perform(post("/api/entry/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo)).andExpect(status().isOk());
        mvc.perform(post("/api/entry/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo)).andExpect(status().isOk());
        Integer total = jdbc.queryForObject(
                "SELECT count(*) FROM entry_log WHERE entry_date = DATE '2026-05-04'", Integer.class);
        assertThat(total).isEqualTo(1);
    }

    @Test
    void un_carnet_desconocido_se_rechaza_con_motivo() throws Exception {
        mvc.perform(post("/api/entry/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(lote("88888888-8888-4888-8888-888888888888", "0000000000")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(0))
           .andExpect(jsonPath("$.rejected[0].reason").value("Carnet no registrado"));
    }
}
