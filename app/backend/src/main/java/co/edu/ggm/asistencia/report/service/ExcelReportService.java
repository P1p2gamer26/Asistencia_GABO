package co.edu.ggm.asistencia.report.service;

import co.edu.ggm.asistencia.report.repository.ReportRepository;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import java.util.List;

@Service
public class ExcelReportService {

    private static final String[] CABECERAS =
            {"Documento", "Estudiante", "Curso", "Dias lectivos", "Presente", "Tarde", "Falta", "Evasion", "% Asistencia"};

    public byte[] build(List<ReportRepository.Row> filas, LocalDate from, LocalDate to) {
        try (var wb = new SXSSFWorkbook(100); var out = new ByteArrayOutputStream()) {
            var hoja = wb.createSheet("Asistencia " + from + " a " + to);

            Row cabecera = hoja.createRow(0);
            for (int i = 0; i < CABECERAS.length; i++) cabecera.createCell(i).setCellValue(CABECERAS[i]);

            int n = 1;
            for (var f : filas) {
                Row r = hoja.createRow(n++);
                r.createCell(0).setCellValue(f.getDocumentId());
                r.createCell(1).setCellValue(f.getFullName());
                r.createCell(2).setCellValue(f.getGrade());
                r.createCell(3).setCellValue(f.getSchoolDays());
                r.createCell(4).setCellValue(f.getPresent());
                r.createCell(5).setCellValue(f.getLate());
                r.createCell(6).setCellValue(f.getAbsent());
                r.createCell(7).setCellValue(f.getEvasion());
                int total = f.getPresent() + f.getLate() + f.getAbsent() + f.getEvasion();
                r.createCell(8).setCellValue(total == 0 ? 0
                        : Math.round((f.getPresent() + f.getLate()) * 1000.0 / total) / 10.0);
            }
            wb.write(out);
            wb.dispose();
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
