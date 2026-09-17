package co.edu.ggm.asistencia.attendance;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
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
 * Ver/editar/borrar asistencia ya registrada. Usa su propio curso ("CRA") y sus propios
 * documentos ("CRA...") para no chocar con la semilla ni con otras clases de test.
 */
@AutoConfigureMockMvc
class CrudAsistenciaTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private static final String GRADE = "CRA";
    private static final String FECHA = "2026-04-20"; // lunes lectivo, no usado por SyncTest ni otras clases

    private Long propioDocenteId;
    private Long otroDocenteId;
    private Long bloquePropio;
    private Long bloqueAjeno;
    private Long estudianteId;

    private Long crearDocente(String email) {
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES (?, 'x', 'Docente CRA', 'DOCENTE', TRUE)
                ON CONFLICT (email) DO NOTHING
                """, email);
        return jdbcBase.queryForObject("SELECT id FROM users WHERE email = ?", Long.class, email);
    }

    private Long crearBloque(String grade, int blockNo, Long teacherId) {
        jdbcBase.update(
                "INSERT INTO subjects (name) VALUES ('Materia CRA') ON CONFLICT (name) DO NOTHING");
        int weekday = diaCiclo(FECHA);
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id)
                VALUES (?, ?, ?, '07:00', '07:50',
                        (SELECT id FROM subjects WHERE name = 'Materia CRA'), ?)
                ON CONFLICT (grade, weekday, block_no) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
                """, grade, weekday, blockNo, teacherId);
        return jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade = ? AND weekday = ? AND block_no = ?",
                Long.class, grade, weekday, blockNo);
    }

    private void preparar() {
        propioDocenteId = crearDocente("propio@cra.co");
        otroDocenteId = crearDocente("otro@cra.co");
        bloquePropio = crearBloque(GRADE, 1, propioDocenteId);
        bloqueAjeno = crearBloque(GRADE, 2, otroDocenteId);

        jdbcBase.update("""
                INSERT INTO students (document_id, first_name, last_name, grade, active)
                VALUES ('CRA0001', 'ESTUDIANTE', 'CRA', ?, TRUE)
                ON CONFLICT (document_id) DO NOTHING
                """, GRADE);
        estudianteId = jdbcBase.queryForObject(
                "SELECT id FROM students WHERE document_id = 'CRA0001'", Long.class);

        jdbcBase.update("DELETE FROM attendance WHERE student_id = ?", estudianteId);
    }

    private int diaCiclo(String fecha) {
        jdbcBase.update("""
                INSERT INTO school_calendar (calendar_date, day_type) VALUES (?, 'LECTIVO')
                ON CONFLICT (calendar_date) DO UPDATE SET day_type = 'LECTIVO'
                """, LocalDate.parse(fecha));
        return jdbcBase.queryForObject("SELECT dia_ciclo(?::date)", Integer.class, fecha);
    }

    private UUID marcar(Long blockId, Long recordedBy) {
        UUID id = UUID.randomUUID();
        jdbcBase.update("""
                INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                        status, recorded_by, recorded_at)
                VALUES (?, ?, ?, ?, 'P', ?, now())
                """, id, estudianteId, blockId, LocalDate.parse(FECHA), recordedBy);
        return id;
    }

    @Test
    void la_vista_muestra_quien_registro_y_cuando() throws Exception {
        preparar();
        marcar(bloquePropio, propioDocenteId);
        mvc.perform(get("/api/attendance/detalle")
                        .param("blockId", String.valueOf(bloquePropio)).param("date", FECHA)
                        .header("Authorization", tokenDe("propio@cra.co", "DOCENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].recordedByName").value("Docente CRA"))
           .andExpect(jsonPath("$[0].recordedAt").exists());
    }

    @Test
    void un_docente_no_puede_editar_asistencia_de_un_bloque_que_no_es_suyo() throws Exception {
        preparar();
        UUID id = marcar(bloqueAjeno, otroDocenteId);
        mvc.perform(put("/api/attendance/" + id)
                        .header("Authorization", tokenDe("propio@cra.co", "DOCENTE"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"F\"}"))
           .andExpect(status().isForbidden());
    }

    @Test
    void un_docente_no_puede_borrar_asistencia_de_un_bloque_que_no_es_suyo() throws Exception {
        preparar();
        UUID id = marcar(bloqueAjeno, otroDocenteId);
        mvc.perform(delete("/api/attendance/" + id)
                        .header("Authorization", tokenDe("propio@cra.co", "DOCENTE")))
           .andExpect(status().isForbidden());
        Integer vivos = jdbcBase.queryForObject(
                "SELECT count(*) FROM attendance WHERE id = ? AND deleted_at IS NULL", Integer.class, id);
        assertThat(vivos).isEqualTo(1);
    }

    @Test
    void editar_deja_constancia_de_quien_cambio_sin_perder_quien_registro() throws Exception {
        preparar();
        UUID id = marcar(bloquePropio, propioDocenteId);
        mvc.perform(put("/api/attendance/" + id)
                        .header("Authorization", tokenDe("propio@cra.co", "DOCENTE"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"F\",\"comment\":\"corregido\"}"))
           .andExpect(status().isOk());

        var fila = jdbcBase.queryForMap(
                "SELECT status, previous_status, recorded_by, edited_by FROM attendance WHERE id = ?", id);
        assertThat(fila.get("status")).isEqualTo("F");
        assertThat(fila.get("previous_status")).isEqualTo("P");
        assertThat(fila.get("recorded_by")).isEqualTo(propioDocenteId);
        assertThat(fila.get("edited_by")).isEqualTo(propioDocenteId);
    }

    @Test
    void borrar_deja_rastro_en_vez_de_desaparecer() throws Exception {
        preparar();
        UUID id = marcar(bloquePropio, propioDocenteId);
        mvc.perform(delete("/api/attendance/" + id)
                        .header("Authorization", tokenDe("propio@cra.co", "DOCENTE")))
           .andExpect(status().isOk());

        var fila = jdbcBase.queryForMap(
                "SELECT deleted_by, deleted_at FROM attendance WHERE id = ?", id);
        assertThat(fila.get("deleted_by")).isEqualTo(propioDocenteId);
        assertThat(fila.get("deleted_at")).isNotNull();

        // Borrado logico: ya no aparece en la vista de lo registrado...
        mvc.perform(get("/api/attendance/detalle")
                        .param("blockId", String.valueOf(bloquePropio)).param("date", FECHA)
                        .header("Authorization", tokenDe("propio@cra.co", "DOCENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.length()").value(0));
        // ...pero la fila sigue en la base, no un DELETE fisico.
        Integer total = jdbcBase.queryForObject(
                "SELECT count(*) FROM attendance WHERE id = ?", Integer.class, id);
        assertThat(total).isEqualTo(1);
    }

    /**
     * `recorded_by` es NOT NULL + FK en la tabla: nunca falta un autor real de quien
     * tomo la lista. Lo que si puede faltar, y es lo que la interfaz no puede inventar,
     * es quien la EDITO cuando nadie la ha corregido: debe verse "sin registro", nunca
     * atribuido a quien la tomo ni a nadie mas.
     */
    @Test
    void un_registro_sin_editor_conocido_no_se_le_atribuye_a_nadie() throws Exception {
        preparar();
        marcar(bloquePropio, propioDocenteId);
        mvc.perform(get("/api/attendance/detalle")
                        .param("blockId", String.valueOf(bloquePropio)).param("date", FECHA)
                        .header("Authorization", tokenDe("propio@cra.co", "DOCENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].recordedByName").value("Docente CRA"))
           .andExpect(jsonPath("$[0].editedByName").doesNotExist());
    }

    @Test
    void coordinacion_si_puede_editar_asistencia_de_un_bloque_ajeno() throws Exception {
        preparar();
        UUID id = marcar(bloqueAjeno, otroDocenteId);
        mvc.perform(put("/api/attendance/" + id)
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"T\"}"))
           .andExpect(status().isOk());
    }
}
