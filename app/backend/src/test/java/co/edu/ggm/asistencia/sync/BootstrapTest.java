package co.edu.ggm.asistencia.sync;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.shared.service.JwtService;
import co.edu.ggm.asistencia.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class BootstrapTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;

    private String tokenDocente() {
        var u = users.findByEmailAndActiveTrue("fpalacios@ggm.edu.co").orElseThrow();
        return "Bearer " + jwt.issueAccess(u.getId(), "DOCENTE");
    }

    @Test
    void el_docente_recibe_solo_sus_bloques_y_los_estudiantes_de_esos_grados() throws Exception {
        mvc.perform(get("/api/sync/bootstrap").header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.blocks.length()").value(1))
           .andExpect(jsonPath("$.blocks[0].grade").value("601"))
           .andExpect(jsonPath("$.blocks[0].subject").value("Matematicas"))
           // el estudiante de 602 NO debe venir: ese docente no dicta ese grado
           .andExpect(jsonPath("$.students.length()").value(2))
           .andExpect(jsonPath("$.students[0].fullName").value("LINDA ISABELLA AREVALO FIGUEROA"));
    }

    @Test
    void la_respuesta_cumple_el_contrato_del_fixture() throws Exception {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        String json = mvc.perform(get("/api/sync/bootstrap").header("Authorization", tokenDocente()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        var real = mapper.readTree(json);
        var fixture = mapper.readTree(new java.io.File("../contracts/fixtures/bootstrap.json"));

        assertThat(campos(real)).containsExactlyInAnyOrderElementsOf(campos(fixture));
        assertThat(campos(real.get("blocks").get(0)))
                .containsExactlyInAnyOrderElementsOf(campos(fixture.get("blocks").get(0)));
        assertThat(campos(real.get("students").get(0)))
                .containsExactlyInAnyOrderElementsOf(campos(fixture.get("students").get(0)));
        assertThat(campos(real.get("schoolDays").get(0))).contains("calendarDate", "dayType");
    }

    private static java.util.List<String> campos(com.fasterxml.jackson.databind.JsonNode nodo) {
        var nombres = new java.util.ArrayList<String>();
        nodo.fieldNames().forEachRemaining(nombres::add);
        return nombres;
    }
}
