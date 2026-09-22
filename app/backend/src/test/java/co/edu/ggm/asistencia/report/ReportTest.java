package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.service.JwtService;
import co.edu.ggm.asistencia.repository.UserRepository;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
class ReportTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;

    private String token() {
        var u = users.findByEmailAndActiveTrue("coord@ggm.edu.co").orElseThrow();
        return "Bearer " + jwt.issueAccess(u.getId(), "ADMIN");
    }

    @BeforeEach
    void datos() {
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
            WHERE s.document_id = '1010101010' AND u.email = 'coord@ggm.edu.co'
            """);
    }

    @Test
    void el_resumen_cuenta_cada_estado_por_estudiante() throws Exception {
        mvc.perform(get("/api/reports/summary")
                        .param("grade", "601").param("from", "2026-06-01").param("to", "2026-06-30")
                        .header("Authorization", token()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].fullName").value("LINDA ISABELLA AREVALO FIGUEROA"))
           .andExpect(jsonPath("$[0].present").value(1))
           .andExpect(jsonPath("$[0].absent").value(1))
           .andExpect(jsonPath("$[0].evasion").value(1));
    }

    @Test
    void el_resumen_trae_porcentaje_de_asistencia_calculado_sobre_las_marcas() throws Exception {
        // LINDA tiene 1 P, 1 F, 1 E en el periodo -> 1 de 3 marcas fue presente.
        mvc.perform(get("/api/reports/summary")
                        .param("grade", "601").param("from", "2026-06-01").param("to", "2026-06-30")
                        .header("Authorization", token()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].fullName").value("LINDA ISABELLA AREVALO FIGUEROA"))
           .andExpect(jsonPath("$[0].attendanceRate").value(33.3));
    }

    @Test
    void un_estudiante_sin_ninguna_marca_no_muestra_un_porcentaje_inventado() throws Exception {
        // El curso 602 (Daniel) no tiene bloques de horario ni asistencia en el periodo.
        mvc.perform(get("/api/reports/summary")
                        .param("grade", "602").param("from", "2026-06-01").param("to", "2026-06-30")
                        .header("Authorization", token()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].fullName").value("DANIEL ALEJANDRO BARRIOS PARATES"))
           .andExpect(jsonPath("$[0].present").value(0))
           .andExpect(jsonPath("$[0].attendanceRate").doesNotExist());
    }

    @Test
    void avisa_de_marcas_en_un_dia_que_el_calendario_declaro_no_lectivo() throws Exception {
        // Fecha propia de este test, fuera de cualquier otro rango usado en la clase.
        jdbc.update("""
            INSERT INTO school_calendar (calendar_date, day_type, description)
            VALUES (DATE '2026-07-15', 'SUSPENDIDO', 'suspendido despues de pasar lista')
            ON CONFLICT (calendar_date) DO UPDATE SET day_type = EXCLUDED.day_type
            """);
        jdbc.update("""
            INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status, recorded_by, recorded_at)
            SELECT gen_random_uuid(), s.id, b.id, DATE '2026-07-15', 'P', u.id, now()
            FROM students s
            CROSS JOIN (SELECT id FROM schedule_blocks LIMIT 1) b
            CROSS JOIN users u
            WHERE s.document_id = '1010101010' AND u.email = 'coord@ggm.edu.co'
            """);

        mvc.perform(get("/api/reports/dias-no-lectivos-con-marcas")
                        .param("from", "2026-07-01").param("to", "2026-07-31")
                        .header("Authorization", token()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[0].fecha").value("2026-07-15"))
           .andExpect(jsonPath("$[0].tipo").value("SUSPENDIDO"))
           .andExpect(jsonPath("$[0].marcas").value(1));
    }

    @Test
    void sin_dias_no_lectivos_con_marcas_la_lista_viene_vacia() throws Exception {
        mvc.perform(get("/api/reports/dias-no-lectivos-con-marcas")
                        .param("from", "2026-06-01").param("to", "2026-06-30")
                        .header("Authorization", token()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$").isArray())
           .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void el_excel_se_descarga_y_es_un_libro_valido_con_encabezados() throws Exception {
        byte[] bytes = mvc.perform(get("/api/reports/excel")
                        .param("grade", "601").param("from", "2026-06-01").param("to", "2026-06-30")
                        .header("Authorization", token()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition",
                        org.hamcrest.Matchers.containsString("attachment")))
                .andReturn().getResponse().getContentAsByteArray();

        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            var hoja = wb.getSheetAt(0);
            assertThat(hoja.getRow(0).getCell(0).getStringCellValue()).isEqualTo("Documento");
            assertThat(hoja.getRow(1).getCell(1).getStringCellValue())
                    .isEqualTo("LINDA ISABELLA AREVALO FIGUEROA");
        }
    }
}
