package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.io.ByteArrayInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Consultas que pidio coordinacion despues del resumen por curso: seguir a un
 * estudiante puntual y saber quien tomo cada lista.
 */
@AutoConfigureMockMvc
class ConsultasAvanzadasTest extends AbstractIntegrationTest {

    private static final String ALUMNO = "1010101010";   // LINDA ISABELLA AREVALO FIGUEROA, curso 601

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void datos() {
        jdbc.update("DELETE FROM attendance");
        // Dos dias: el lunes P, el martes F. Registra la coordinadora, que no es la
        // titular del bloque: asi "docente asignado" y "registro por" difieren.
        jdbc.update("""
            INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status, recorded_by, recorded_at)
            SELECT gen_random_uuid(), s.id, b.id, x.dia, x.estado, u.id, now()
            FROM students s
            CROSS JOIN (SELECT id FROM schedule_blocks ORDER BY id LIMIT 1) b
            CROSS JOIN users u
            CROSS JOIN (VALUES (DATE '2026-06-01', 'P'), (DATE '2026-06-02', 'F')) AS x(dia, estado)
            WHERE s.document_id = ? AND u.email = 'coord@ggm.edu.co'
            """, ALUMNO);
    }

    private String coord() { return tokenDe("coord@ggm.edu.co", "COORDINADOR"); }

    @Test
    void busca_por_trozo_de_nombre_sin_acentos_ni_mayusculas() throws Exception {
        mvc.perform(get("/api/reports/estudiantes").param("q", "arevalo fig")
                        .header("Authorization", coord()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].documentId").value(ALUMNO))
                .andExpect(jsonPath("$[0].grade").value("601"));
    }

    @Test
    void busca_por_prefijo_de_documento() throws Exception {
        mvc.perform(get("/api/reports/estudiantes").param("q", "10101")
                        .header("Authorization", coord()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.documentId == '" + ALUMNO + "')]").exists());
    }

    @Test
    void el_detalle_trae_las_marcas_con_quien_las_registro() throws Exception {
        Long id = jdbc.queryForObject("SELECT id FROM students WHERE document_id = ?", Long.class, ALUMNO);
        mvc.perform(get("/api/reports/estudiante/" + id)
                        .param("from", "2026-06-01").param("to", "2026-06-03")
                        .header("Authorization", coord()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.documentId").value(ALUMNO))
                .andExpect(jsonPath("$.present").value(1))
                .andExpect(jsonPath("$.absent").value(1))
                .andExpect(jsonPath("$.marcas", hasSize(2)))
                .andExpect(jsonPath("$.marcas[0].classDate").value("2026-06-02"))
                .andExpect(jsonPath("$.marcas[0].status").value("F"))
                .andExpect(jsonPath("$.marcas[0].recordedByName").isNotEmpty());
    }

    @Test
    void las_tomas_dan_una_fila_por_bloque_y_fecha_con_su_total() throws Exception {
        mvc.perform(get("/api/reports/tomas")
                        .param("from", "2026-06-01").param("to", "2026-06-03")
                        .header("Authorization", coord()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].classDate").value("2026-06-02"))
                .andExpect(jsonPath("$[0].total").value(1))
                .andExpect(jsonPath("$[0].absent").value(1))
                .andExpect(jsonPath("$[0].recordedByName").isNotEmpty());
    }

    @Test
    void la_lista_de_docentes_solo_trae_docentes() throws Exception {
        mvc.perform(get("/api/reports/docentes").header("Authorization", coord()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].fullName").isNotEmpty());
    }

    @Test
    void el_excel_de_tomas_tiene_la_cabecera_de_auditoria() throws Exception {
        byte[] libro = mvc.perform(get("/api/reports/excel")
                        .param("tipo", "tomas").param("from", "2026-06-01").param("to", "2026-06-03")
                        .header("Authorization", coord()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(libro))) {
            var hoja = wb.getSheetAt(0);
            assertThat(hoja.getRow(0).getCell(4).getStringCellValue()).isEqualTo("Docente asignado");
            assertThat(hoja.getRow(0).getCell(5).getStringCellValue()).isEqualTo("Registro por");
            assertThat(hoja.getLastRowNum()).isEqualTo(2);
            assertThat(hoja.getRow(1).getCell(0).getStringCellValue()).isEqualTo("2026-06-02");
        }
    }
}
