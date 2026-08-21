package co.edu.ggm.asistencia.student;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.shared.service.JwtService;
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
}
