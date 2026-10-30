package co.edu.ggm.asistencia.admin;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Listados de personas: primer apellido, segundo apellido, nombres. Curso "OAP". */
@AutoConfigureMockMvc
class OrdenApellidoTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;


    private Long acudienteId;

    private void estudiante(String doc, String nombre, String ap1, String ap2) {
        jdbcBase.update("""
                INSERT INTO students (document_id, first_name, last_name, second_surname, grade, active)
                VALUES (?, ?, ?, ?, 'OAP', TRUE)
                """, doc, nombre, ap1, ap2);
    }

    @BeforeEach
    void preparar() {
        jdbcBase.update("DELETE FROM guardianships WHERE student_id IN (SELECT id FROM students WHERE document_id LIKE 'OAP%')");
        jdbcBase.update("DELETE FROM students WHERE document_id LIKE 'OAP%'");
        // Insertados en orden que NO es el alfabetico, y ANA antes que ZOE por nombre.
        estudiante("OAP1", "ANA", "PEREZ", "ZAPATA");
        estudiante("OAP2", "ZOE", "PEREZ", "ACOSTA");
        estudiante("OAP3", "BETO", "RUIZ", "ACOSTA");
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role)
                VALUES ('padre@oap.co', 'x', 'Padre OAP', 'ACUDIENTE') ON CONFLICT (email) DO NOTHING
                """);
        acudienteId = jdbcBase.queryForObject("SELECT id FROM users WHERE email = 'padre@oap.co'", Long.class);
        jdbcBase.update("""
                INSERT INTO guardianships (student_id, guardian_id, relationship)
                SELECT id, ?, 'Padre' FROM students WHERE document_id LIKE 'OAP%'
                """, acudienteId);
    }

    @Test
    void los_hijos_del_acudiente_salen_por_apellidos() throws Exception {
        mvc.perform(get("/api/guardian/children")
                        .header("Authorization", tokenDe("padre@oap.co", "ACUDIENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].fullName").value("ZOE PEREZ ACOSTA"))
           .andExpect(jsonPath("$[1].fullName").value("ANA PEREZ ZAPATA"))
           .andExpect(jsonPath("$[2].fullName").value("BETO RUIZ ACOSTA"));
    }

    @Test
    void el_listado_de_administracion_sale_por_apellidos() throws Exception {
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES ('admin@oap.co', 'x', 'Admin OAP', 'ADMIN', TRUE) ON CONFLICT (email) DO NOTHING
                """);
        mvc.perform(get("/api/admin/students").param("grade", "OAP")
                        .header("Authorization", tokenDe("admin@oap.co", "ADMIN")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].fullName").value("ZOE PEREZ ACOSTA"))
           .andExpect(jsonPath("$[1].fullName").value("ANA PEREZ ZAPATA"))
           .andExpect(jsonPath("$[2].fullName").value("BETO RUIZ ACOSTA"));
    }
}
