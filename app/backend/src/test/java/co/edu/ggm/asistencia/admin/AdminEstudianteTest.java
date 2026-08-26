package co.edu.ggm.asistencia.admin;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Alta, edicion y baja de estudiantes desde administracion. Usa el curso "AES" y
 * documentos "AES..." para no chocar con la semilla ni con otras clases de test.
 *
 * La regla que mas importa aqui es la de borrar: un estudiante con asistencia
 * registrada NO se borra de la base, se desactiva. Borrarlo se llevaria por delante
 * su historial, que es justamente lo que el colegio tiene que conservar.
 */
@AutoConfigureMockMvc
class AdminEstudianteTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private static final String GRADE = "AES";

    private String admin;

    private Long crearDocente() {
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES ('admin@aes.co', 'x', 'Admin AES', 'ADMIN', TRUE)
                ON CONFLICT (email) DO NOTHING
                """);
        return jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = 'admin@aes.co'", Long.class);
    }

    @BeforeEach
    void preparar() {
        crearDocente();
        admin = tokenDe("admin@aes.co", "ADMIN");
        jdbcBase.update("""
                DELETE FROM attendance WHERE student_id IN
                    (SELECT id FROM students WHERE document_id LIKE 'AES%')
                """);
        jdbcBase.update("DELETE FROM students WHERE document_id LIKE 'AES%'");
    }

    private Long crearPorApi(String documento, String nombre) throws Exception {
        String cuerpo = """
                {"documentId":"%s","firstName":"%s","lastName":"PRUEBA","grade":"%s"}
                """.formatted(documento, nombre, GRADE);
        mvc.perform(post("/api/admin/students")
                        .header("Authorization", admin)
                        .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
           .andExpect(status().isOk());
        return jdbcBase.queryForObject(
                "SELECT id FROM students WHERE document_id = ?", Long.class, documento);
    }

    @Test
    void el_administrador_crea_un_estudiante_y_aparece_en_la_lista() throws Exception {
        crearPorApi("AES0001", "ANA");

        mvc.perform(get("/api/admin/students").param("grade", GRADE)
                        .header("Authorization", admin))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.documentId == 'AES0001')].fullName").value("ANA PRUEBA"))
           .andExpect(jsonPath("$[?(@.documentId == 'AES0001')].active").value(true));
    }

    @Test
    void no_se_puede_crear_dos_veces_el_mismo_documento() throws Exception {
        crearPorApi("AES0002", "BETO");

        mvc.perform(post("/api/admin/students")
                        .header("Authorization", admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"documentId":"AES0002","firstName":"OTRO","lastName":"DISTINTO","grade":"AES"}
                                """))
           .andExpect(status().isConflict());
    }

    @Test
    void el_administrador_edita_el_nombre_y_el_curso() throws Exception {
        Long id = crearPorApi("AES0003", "CARLA");

        mvc.perform(put("/api/admin/students/" + id)
                        .header("Authorization", admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"firstName":"CARLA","middleName":"MARIA","lastName":"PRUEBA",
                                 "grade":"AES2","active":true}
                                """))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.fullName").value("CARLA MARIA PRUEBA"))
           .andExpect(jsonPath("$.grade").value("AES2"));
    }

    @Test
    void un_estudiante_sin_historial_se_borra_de_verdad() throws Exception {
        // Un estudiante recien creado por error debe poder desaparecer, no quedarse
        // como "inactivo" ensuciando las listas para siempre.
        Long id = crearPorApi("AES0004", "DIEGO");

        mvc.perform(delete("/api/admin/students/" + id).header("Authorization", admin))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.borradoDefinitivo").value(true));

        Integer quedan = jdbcBase.queryForObject(
                "SELECT count(*) FROM students WHERE id = ?", Integer.class, id);
        assertThat(quedan).isZero();
    }

    @Test
    void un_estudiante_con_asistencia_se_desactiva_pero_no_se_borra() throws Exception {
        Long id = crearPorApi("AES0005", "ELENA");
        Long bloque = bloqueCualquiera();
        jdbcBase.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                        status, recorded_by, recorded_at)
                VALUES (?, ?, ?, ?, 'P', (SELECT id FROM users WHERE email = 'admin@aes.co'), now())
                """, UUID.randomUUID(), id, bloque, LocalDate.parse("2026-05-11"));

        mvc.perform(delete("/api/admin/students/" + id).header("Authorization", admin))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.borradoDefinitivo").value(false));

        Boolean activo = jdbcBase.queryForObject(
                "SELECT active FROM students WHERE id = ?", Boolean.class, id);
        assertThat(activo).isFalse();

        Integer marcas = jdbcBase.queryForObject(
                "SELECT count(*) FROM attendance WHERE student_id = ?", Integer.class, id);
        assertThat(marcas).isEqualTo(1);
    }

    @Test
    void un_docente_no_puede_crear_ni_borrar_estudiantes() throws Exception {
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES ('profe@aes.co', 'x', 'Profe AES', 'DOCENTE', TRUE)
                ON CONFLICT (email) DO NOTHING
                """);
        String docente = tokenDe("profe@aes.co", "DOCENTE");

        mvc.perform(post("/api/admin/students")
                        .header("Authorization", docente)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"documentId":"AES9999","firstName":"NO","lastName":"DEBE","grade":"AES"}
                                """))
           .andExpect(status().isForbidden());
    }

    private Long bloqueCualquiera() {
        jdbcBase.update(
                "INSERT INTO subjects (name) VALUES ('Materia AES') ON CONFLICT (name) DO NOTHING");
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id)
                VALUES (?, 1, 8, '13:00', '13:50',
                        (SELECT id FROM subjects WHERE name = 'Materia AES'),
                        (SELECT id FROM users WHERE email = 'admin@aes.co'))
                ON CONFLICT (grade, weekday, block_no) DO NOTHING
                """, GRADE);
        return jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade = ? AND weekday = 1 AND block_no = 8",
                Long.class, GRADE);
    }
}
