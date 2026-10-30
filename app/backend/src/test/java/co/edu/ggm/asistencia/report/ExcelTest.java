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

    private static final String ALUMNO = "1010101010";   // AREVALO FIGUEROA LINDA ISABELLA, curso 601

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
                .header("Authorization", tokenDe("coord@ggm.edu.co", "ADMIN"))
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

    // ---- consolidado de inasistencias ----

    @Test
    void el_consolidado_solo_trae_estudiantes_con_faltas_o_evasiones() throws Exception {
        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(descargar("tipo", "inasistencias")))) {
            Sheet hoja = wb.getSheetAt(0);
            assertThat(hoja.getRow(0).getCell(3).getStringCellValue()).isEqualTo("Faltas");
            assertThat(hoja.getLastRowNum()).isGreaterThanOrEqualTo(1);
            for (int i = 1; i <= hoja.getLastRowNum(); i++) {
                double faltas = hoja.getRow(i).getCell(3).getNumericCellValue();
                double evasiones = hoja.getRow(i).getCell(4).getNumericCellValue();
                assertThat(faltas + evasiones).isGreaterThan(0);
            }
            // El estudiante sin ningun registro no puede aparecer aqui
            for (int i = 1; i <= hoja.getLastRowNum(); i++) {
                assertThat(hoja.getRow(i).getCell(0).getStringCellValue()).isNotEqualTo("1010101011");
            }
        }
    }

    @Test
    void el_consolidado_dice_en_que_dias_falto() throws Exception {
        // Sin las fechas el informe no sirve para el proceso de seguimiento:
        // "3 faltas" no le dice a nadie a que clase hay que ir a preguntar.
        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(descargar("tipo", "inasistencias")))) {
            Row fila = filaDe(wb.getSheetAt(0), ALUMNO);
            assertThat(fila.getCell(3).getNumericCellValue()).isEqualTo(1.0);   // una F
            assertThat(fila.getCell(4).getNumericCellValue()).isEqualTo(1.0);   // una E
            assertThat(fila.getCell(5).getStringCellValue())
                    .contains("2026-06-02").contains("2026-06-03")
                    .doesNotContain("2026-06-01");                              // el dia que asistio no
        }
    }

    // ---- informe individual ----

    @Test
    void el_informe_individual_trae_la_cabecera_del_estudiante_y_sus_registros() throws Exception {
        Long id = jdbc.queryForObject("SELECT id FROM students WHERE document_id = ?", Long.class, ALUMNO);
        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(
                descargar("tipo", "individual", "studentId", String.valueOf(id))))) {
            Sheet hoja = wb.getSheetAt(0);
            assertThat(hoja.getRow(0).getCell(0).getStringCellValue()).isEqualTo("Estudiante");
            assertThat(hoja.getRow(0).getCell(1).getStringCellValue())
                    .isEqualTo("AREVALO FIGUEROA LINDA ISABELLA");
            assertThat(hoja.getRow(1).getCell(1).getStringCellValue()).isEqualTo(ALUMNO);
            assertThat(hoja.getRow(3).getCell(0).getStringCellValue()).isEqualTo("Fecha");
            // recentAttendance ordena por fecha descendente: el mas reciente primero
            assertThat(hoja.getRow(4).getCell(0).getStringCellValue()).isEqualTo("2026-06-03");
        }
    }

    @Test
    void el_informe_individual_traduce_el_estado_a_algo_que_se_entienda() throws Exception {
        // Va a manos del acudiente: nadie de fuera del colegio sabe que significa "E".
        Long id = jdbc.queryForObject("SELECT id FROM students WHERE document_id = ?", Long.class, ALUMNO);
        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(
                descargar("tipo", "individual", "studentId", String.valueOf(id))))) {
            assertThat(wb.getSheetAt(0).getRow(4).getCell(2).getStringCellValue()).isEqualTo("Evasion");
        }
    }

    @Test
    void el_informe_individual_exige_studentId() throws Exception {
        mvc.perform(get("/api/reports/excel")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "ADMIN"))
                        .param("tipo", "individual")
                        .param("from", "2026-06-01").param("to", "2026-06-03"))
           .andExpect(status().isBadRequest());
    }

    @Test
    void un_acudiente_no_puede_descargar_el_informe_individual_de_nadie() throws Exception {
        mvc.perform(get("/api/reports/excel")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "ACUDIENTE"))
                        .param("tipo", "individual").param("studentId", "1")
                        .param("from", "2026-06-01").param("to", "2026-06-03"))
           .andExpect(status().isForbidden());
    }

    @Test
    void el_semanal_trae_la_rejilla_con_el_estudiante_y_la_hoja_de_comentarios() throws Exception {
        jdbc.update("UPDATE attendance SET comment = 'llego con excusa' WHERE status = 'F'");
        // El curso de las marcas que crea datos(): con la CI en orden aleatorio otros tests
        // agregan bloques y "el primer bloque" ya no es el de esas marcas.
        String curso = jdbc.queryForObject("""
                SELECT sb.grade FROM attendance a JOIN schedule_blocks sb ON sb.id = a.schedule_block_id
                LIMIT 1""", String.class);
        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(descargar("tipo", "semanal", "grade", curso)))) {
            Sheet hoja = wb.getSheetAt(0);
            assertThat(hoja.getRow(0).getCell(0).getStringCellValue()).isEqualTo("Estudiante");
            assertThat(hoja.getRow(0).getCell(2).getStringCellValue()).startsWith("Lun 01/06");
            assertThat(hoja.getRow(0).getCell(2).getStringCellValue()).contains("·");
            boolean esta = false;
            for (int i = 2; i <= hoja.getLastRowNum(); i++) {
                esta |= "AREVALO FIGUEROA LINDA ISABELLA".equals(hoja.getRow(i).getCell(0).getStringCellValue());
            }
            assertThat(esta).isTrue();
            var com = wb.getSheet("Comentarios");
            assertThat(com.getRow(0).getCell(7).getStringCellValue()).isEqualTo("Comentario");
            assertThat(com.getRow(1).getCell(7).getStringCellValue()).isEqualTo("llego con excusa");
        }
    }

    @Test
    void el_semanal_exige_curso() throws Exception {
        mvc.perform(get("/api/reports/excel")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "ADMIN"))
                        .param("tipo", "semanal").param("from", "2026-06-01").param("to", "2026-06-03"))
           .andExpect(status().isBadRequest());
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
