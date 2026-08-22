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
    private Long hijoId;

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
        hijoId = jdbc.queryForObject(
                "SELECT id FROM students WHERE document_id = '1010101011'", Long.class);
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

    @Test
    void informa_de_cuantos_dias_lectivos_tiene_el_periodo() throws Exception {
        mvc.perform(get("/api/guardian/children")
                        .param("from", "2026-03-02").param("to", "2026-03-06")
                        .header("Authorization", "Bearer " + jwt.issueAccess(acudienteId, "ACUDIENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].schoolDays").value(5));
    }

    @Test
    void sin_ningun_registro_lo_dice_en_vez_de_fingir_que_todo_fue_bien() throws Exception {
        jdbc.update("DELETE FROM attendance WHERE student_id = ?", hijoId);
        mvc.perform(get("/api/guardian/children")
                        .param("from", "2026-03-02").param("to", "2026-03-06")
                        .header("Authorization", "Bearer " + jwt.issueAccess(acudienteId, "ACUDIENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].schoolDays").value(5))
           // Cero dias con registro: la pantalla NO puede decir "todo bien".
           .andExpect(jsonPath("$[0].recordedDays").value(0));
    }

    @Test
    void cuenta_los_dias_en_que_si_hay_registro() throws Exception {
        jdbc.update("DELETE FROM attendance WHERE student_id = ?", hijoId);
        registrarAsistencia("2026-03-02", "P");
        registrarAsistencia("2026-03-03", "F");
        mvc.perform(get("/api/guardian/children")
                        .param("from", "2026-03-02").param("to", "2026-03-06")
                        .header("Authorization", "Bearer " + jwt.issueAccess(acudienteId, "ACUDIENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].recordedDays").value(2));
    }

    @Test
    void sin_fechas_usa_los_ultimos_sesenta_dias() throws Exception {
        mvc.perform(get("/api/guardian/children")
                        .header("Authorization", "Bearer " + jwt.issueAccess(acudienteId, "ACUDIENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].schoolDays").isNumber());
    }

    private void registrarAsistencia(String fecha, String estado) {
        jdbc.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                        status, recorded_by, recorded_at)
                VALUES (gen_random_uuid(), ?, (SELECT id FROM schedule_blocks LIMIT 1),
                        ?::date, ?, (SELECT id FROM users WHERE email = 'fpalacios@ggm.edu.co'), now())
                ON CONFLICT ON CONSTRAINT attendance_unique_slot DO UPDATE SET status = EXCLUDED.status
                """, hijoId, fecha, estado);
    }
}
