package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.io.ByteArrayInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Los tres informes en Excel que pidio coordinacion. Se comprueba el contenido del
 * libro, no solo que la descarga responda 200: un .xlsx vacio tambien responde 200.
 */
@AutoConfigureMockMvc
class ExcelTest extends AbstractIntegrationTest {

    private static final String ALUMNO = "1010101010";   // LINDA ISABELLA AREVALO FIGUEROA, curso 601

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void datos() {
        // 2026-06-01 lunes, 02 martes, 03 miercoles: los tres son lectivos en V2.
        jdbc.update("DELETE FROM attendance");
        jdbc.update("""
            INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status, recorded_by, recorded_at)
            SELECT gen_random_uuid(), s.id, b.id, x.dia, x.estado, u.id, now()
            FROM students s
            CROSS JOIN (SELECT id FROM schedule_blocks LIMIT 1) b
            CROSS JOIN users u
            CROSS JOIN (VALUES (DATE '2026-06-01', 'P'),
                               (DATE '2026-06-02', 'F'),
                               (DATE '2026-06-03', 'E')) AS x(dia, estado)
            WHERE s.document_id = ? AND u.email = 'coord@ggm.edu.co'
            """, ALUMNO);
    }

    private byte[] descargar(String... params) throws Exception {
        var peticion = get("/api/reports/excel")
                .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR"))
                .param("from", "2026-06-01").param("to", "2026-06-03");
        for (int i = 0; i < params.length; i += 2) peticion = peticion.param(params[i], params[i + 1]);
        return mvc.perform(peticion).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
    }

    private Row filaDe(Sheet hoja, String documento) {
        for (int i = 1; i <= hoja.getLastRowNum(); i++) {
            if (documento.equals(hoja.getRow(i).getCell(0).getStringCellValue())) return hoja.getRow(i);
        }
        throw new AssertionError("No aparece el estudiante " + documento + " en la hoja");
    }

    // ---- resumen (el de siempre, que humo.sh comprueba) ----

    @Test
    void sin_tipo_devuelve_el_resumen_de_siempre_con_sus_nueve_columnas() throws Exception {
        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(descargar()))) {
            assertThat(wb.getSheetAt(0).getRow(0).getLastCellNum()).isEqualTo((short) 9);
        }
    }

    // ---- matriz ----

    @Test
    void la_matriz_tiene_una_columna_por_dia_lectivo() throws Exception {
        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(descargar("tipo", "matriz", "grade", "601")))) {
            Row cabecera = wb.getSheetAt(0).getRow(0);
            // Documento, Estudiante, Curso, 01, 02, 03, % Asistencia
            assertThat(cabecera.getLastCellNum()).isEqualTo((short) 7);
            assertThat(cabecera.getCell(3).getStringCellValue()).isEqualTo("2026-06-01");
            assertThat(cabecera.getCell(6).getStringCellValue()).isEqualTo("% Asistencia");
        }
    }

    @Test
    void la_matriz_pinta_la_letra_del_estado_en_el_dia_que_corresponde() throws Exception {
        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(descargar("tipo", "matriz", "grade", "601")))) {
            Row fila = filaDe(wb.getSheetAt(0), ALUMNO);
            assertThat(fila.getCell(3).getStringCellValue()).isEqualTo("P");
            assertThat(fila.getCell(4).getStringCellValue()).isEqualTo("F");
            assertThat(fila.getCell(5).getStringCellValue()).isEqualTo("E");
        }
    }

    @Test
    void una_celda_vacia_no_es_una_falta() throws Exception {
        // El otro estudiante de 601 no tiene ningun registro: sus tres dias van en
        // blanco. Decir "F" seria inventarse una inasistencia que nadie marco.
        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(descargar("tipo", "matriz", "grade", "601")))) {
            Row fila = filaDe(wb.getSheetAt(0), "1010101011");
            assertThat(fila.getCell(3).getStringCellValue()).isEmpty();
            assertThat(fila.getCell(6).getNumericCellValue()).isEqualTo(0.0);
        }
    }
}
