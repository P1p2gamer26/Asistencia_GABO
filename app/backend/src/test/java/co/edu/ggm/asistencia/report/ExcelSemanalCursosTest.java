package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.controller.ReportController;
import co.edu.ggm.asistencia.service.ExcelReportService;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class ExcelSemanalCursosTest {

    @Test
    void una_hoja_por_curso_y_comentarios_con_quien_registro() throws Exception {
        var f = LocalDate.of(2026, 10, 26);
        var bloque = new ReportController.BloqueSemana((short) 1, "Matematicas", "Ana Docente", null, null);
        var dia = new ReportController.DiaSemana(f, 1, null, List.of(bloque), "LECTIVO");
        var estudiante = new ReportController.EstudianteSemana(5L, "123", "Ruiz Luis");
        var marca = new ReportController.MarcaSemana(f, (short) 1, "Matematicas", "Ana Docente", 5L, "123",
                "Ruiz Luis", "T", "llego tarde", "Luisa Registro");
        var semana = new ReportController.SemanaDto(List.of(estudiante), List.of(dia), List.of(marca));

        var cursos = new LinkedHashMap<String, ReportController.SemanaDto>();
        cursos.put("601", semana);
        cursos.put("602", semana);

        byte[] bytes = new ExcelReportService().buildSemanalCursos(cursos, f, f);

        try (var wb = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            assertNotNull(wb.getSheet("601"));
            assertNotNull(wb.getSheet("602"));
            var com = wb.getSheet("Comentarios");
            // Una fila por curso con comentario, con la columna Curso al inicio.
            assertEquals("601", com.getRow(1).getCell(0).getStringCellValue());
            assertEquals("602", com.getRow(2).getCell(0).getStringCellValue());
            // "Registrado por" es la columna 8 (despues de Curso y 7 columnas del cuerpo).
            assertEquals("Luisa Registro", com.getRow(1).getCell(8).getStringCellValue());
            assertEquals("llego tarde", com.getRow(1).getCell(9).getStringCellValue());
        }
    }
}
