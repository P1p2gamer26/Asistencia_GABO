package co.edu.ggm.asistencia.admin;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Borrar cuentas (sufijo @bor.co) y orden por apellidos de docentes/acudientes. */
@AutoConfigureMockMvc
class BorrarUsuarioTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private Long usuario(String email, String nombre, String rol) {
        jdbcBase.update("INSERT INTO users (email, password_hash, full_name, role) VALUES (?, 'x', ?, ?)",
                email, nombre, rol);
        return jdbcBase.queryForObject("SELECT id FROM users WHERE email = ?", Long.class, email);
    }

    @BeforeEach
    void limpiar() {
        jdbcBase.update("DELETE FROM attendance WHERE student_id IN (SELECT id FROM students WHERE document_id = 'BOR1')");
        jdbcBase.update("DELETE FROM students WHERE document_id = 'BOR1'");
        jdbcBase.update("DELETE FROM schedule_blocks WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@bor.co')");
        jdbcBase.update("DELETE FROM users WHERE email LIKE '%@bor.co'");
        usuario("admin@bor.co", "Admin Bor", "ADMIN");
    }

    private String admin() { return tokenDe("admin@bor.co", "ADMIN"); }

    @Test
    void borrar_un_docente_con_asistencia_conserva_la_asistencia_y_su_nombre() throws Exception {
        Long viejo = usuario("viejo@bor.co", "Docente Que Se Va", "DOCENTE");
        Long otro = usuario("otro@bor.co", "Docente Que Queda", "DOCENTE");
        jdbcBase.update("INSERT INTO students (document_id, first_name, last_name, grade, active) VALUES ('BOR1','X','BOR','BOR',TRUE)");
        Long est = jdbcBase.queryForObject("SELECT id FROM students WHERE document_id='BOR1'", Long.class);
        // El bloque es del docente que se queda; el que se va solo registro la asistencia.
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time, subject_id, teacher_id)
                SELECT 'BOR', 1, 1, '07:00', '07:50', s.id, ? FROM subjects s LIMIT 1
                """, otro);
        Long bloque = jdbcBase.queryForObject("SELECT id FROM schedule_blocks WHERE grade='BOR'", Long.class);
        jdbcBase.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status, recorded_by, recorded_at)
                VALUES (gen_random_uuid(), ?, ?, '2026-09-01', 'F', ?, now())
                """, est, bloque, viejo);

        mvc.perform(delete("/api/admin/users/" + viejo).header("Authorization", admin()))
           .andExpect(status().isNoContent());

        Map<String, Object> fila = jdbcBase.queryForMap(
                "SELECT status, recorded_by, recorded_by_name FROM attendance WHERE student_id = ?", est);
        assertThat(fila.get("status")).isEqualTo("F");
        assertThat(fila.get("recorded_by")).isNull();
        assertThat(fila.get("recorded_by_name")).isEqualTo("Docente Que Se Va");
        assertThat(jdbcBase.queryForObject("SELECT count(*) FROM users WHERE id = ?", Integer.class, viejo)).isZero();
    }

    @Test
    void un_docente_con_bloques_en_el_horario_no_se_borra() throws Exception {
        Long doc = usuario("conbloque@bor.co", "Con Bloque", "DOCENTE");
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time, subject_id, teacher_id)
                SELECT 'BOR', 2, 1, '07:00', '07:50', s.id, ? FROM subjects s LIMIT 1
                """, doc);
        mvc.perform(delete("/api/admin/users/" + doc).header("Authorization", admin()))
           .andExpect(status().isConflict());
        assertThat(jdbcBase.queryForObject("SELECT count(*) FROM users WHERE id = ?", Integer.class, doc)).isEqualTo(1);
    }

    @Test
    void nadie_borra_su_propia_cuenta() throws Exception {
        Long yo = jdbcBase.queryForObject("SELECT id FROM users WHERE email='admin@bor.co'", Long.class);
        mvc.perform(delete("/api/admin/users/" + yo).header("Authorization", admin()))
           .andExpect(status().isConflict());
    }

    @Test
    void un_docente_no_puede_borrar_cuentas() throws Exception {
        usuario("d@bor.co", "Docente D", "DOCENTE");
        Long victima = usuario("v@bor.co", "Victima", "DOCENTE");
        mvc.perform(delete("/api/admin/users/" + victima).header("Authorization", tokenDe("d@bor.co", "DOCENTE")))
           .andExpect(status().isForbidden());
    }

    @Test
    void docentes_y_acudientes_salen_por_apellidos_con_respaldo_en_full_name() throws Exception {
        Long a = usuario("a@bor.co", "Zoila Acosta", "DOCENTE");
        Long b = usuario("b@bor.co", "Ana Zapata", "DOCENTE");
        Long c = usuario("c@bor.co", "Beto Sin Columnas", "DOCENTE");
        jdbcBase.update("UPDATE users SET last_name='ACOSTA', second_surname='RUIZ', first_names='ZOILA' WHERE id=?", a);
        jdbcBase.update("UPDATE users SET last_name='ZAPATA', first_names='ANA' WHERE id=?", b);
        // c queda sin columnas: ordena por full_name ("Beto Sin Columnas")

        String json = mvc.perform(get("/api/admin/users").param("query", "@bor.co").header("Authorization", admin()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<String> orden = com.jayway.jsonpath.JsonPath.read(json, "$[?(@.email != 'admin@bor.co')].email");
        // ACOSTA, Beto Sin Columnas (respaldo), ZAPATA
        assertThat(orden).containsExactly("a@bor.co", "c@bor.co", "b@bor.co");
    }
}
