package co.edu.ggm.asistencia.student;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.service.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class GuardianTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;

    private Long acudienteId;
    private Long otroAcudienteId;

    @BeforeEach
    void datos() {
        jdbc.update("DELETE FROM guardianships");
        jdbc.update("""
            INSERT INTO users (email, password_hash, full_name, role)
            VALUES ('papa@correo.com', 'x', 'Papa de Juan', 'ACUDIENTE')
            ON CONFLICT (email) DO NOTHING
            """);
        acudienteId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = 'papa@correo.com'", Long.class);
        jdbc.update("""
            INSERT INTO guardianships (student_id, guardian_id, relationship)
            VALUES ((SELECT id FROM students WHERE document_id = '1010101011'), ?, 'Padre')
            """, acudienteId);

        // Un segundo acudiente con OTRO hijo: sin dos, "solo ve a los suyos" no se
        // puede distinguir de "ve a todos", que en la semilla son casi lo mismo.
        jdbc.update("""
            INSERT INTO users (email, password_hash, full_name, role)
            VALUES ('mama@correo.com', 'x', 'Mama de Linda', 'ACUDIENTE')
            ON CONFLICT (email) DO NOTHING
            """);
        otroAcudienteId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = 'mama@correo.com'", Long.class);
        jdbc.update("""
            INSERT INTO guardianships (student_id, guardian_id, relationship)
            VALUES ((SELECT id FROM students WHERE document_id = '1010101010'), ?, 'Madre')
            """, otroAcudienteId);
    }

    @Test
    void el_acudiente_ve_solo_a_su_hijo() throws Exception {
        mvc.perform(get("/api/guardian/children")
                        .header("Authorization", "Bearer " + jwt.issueAccess(acudienteId, "ACUDIENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.length()").value(1))
           .andExpect(jsonPath("$[0].fullName").value("JUAN DIEGO AVILA VERGARA"));
    }

    @Test
    void un_docente_no_puede_usar_el_portal_de_acudientes() throws Exception {
        mvc.perform(get("/api/guardian/children")
                        .header("Authorization", "Bearer " + jwt.issueAccess(1L, "DOCENTE")))
           .andExpect(status().isForbidden());
    }

    // ---- aislamiento entre acudientes ----
    // Son datos de menores: la garantia va escrita en un test, no en la memoria de
    // nadie. Si alguien anade en el futuro un parametro studentId al portal, el
    // segundo test se cae.

    @Test
    void un_acudiente_no_ve_al_hijo_de_otro() throws Exception {
        mvc.perform(get("/api/guardian/children")
                        .header("Authorization", "Bearer " + jwt.issueAccess(acudienteId, "ACUDIENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.length()").value(1))
           .andExpect(jsonPath("$[0].fullName").value("JUAN DIEGO AVILA VERGARA"));

        mvc.perform(get("/api/guardian/children")
                        .header("Authorization", "Bearer " + jwt.issueAccess(otroAcudienteId, "ACUDIENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.length()").value(1))
           .andExpect(jsonPath("$[0].fullName").value("LINDA ISABELLA AREVALO FIGUEROA"));
    }

    @Test
    void pasar_studentId_por_parametro_no_cambia_nada() throws Exception {
        Long hijoDelOtro = jdbc.queryForObject(
                "SELECT id FROM students WHERE document_id = '1010101010'", Long.class);
        String token = "Bearer " + jwt.issueAccess(acudienteId, "ACUDIENTE");

        String conParametro = mvc.perform(get("/api/guardian/children")
                        .param("studentId", String.valueOf(hijoDelOtro)).header("Authorization", token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String sinParametro = mvc.perform(get("/api/guardian/children").header("Authorization", token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        org.assertj.core.api.Assertions.assertThat(conParametro).isEqualTo(sinParametro);
        org.assertj.core.api.Assertions.assertThat(conParametro)
                .doesNotContain("LINDA").doesNotContain("\"studentId\":" + hijoDelOtro);
    }
}
