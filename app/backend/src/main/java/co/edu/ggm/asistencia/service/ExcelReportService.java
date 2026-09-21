package co.edu.ggm.asistencia.service;

import co.edu.ggm.asistencia.repository.ReportRepository;
import co.edu.ggm.asistencia.repository.StudentRepository;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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

    private static final Map<String, String> ESTADO_LEGIBLE = Map.of(
            "P", "Presente", "T", "Tarde", "F", "Falta", "E", "Evasion");

    /** Una hoja para entregarle al acudiente: se lee sin saber que significa "T". */
    public byte[] buildIndividual(String documento, String nombre, String curso,
                                  List<StudentRepository.RecentMark> marcas,
                                  LocalDate from, LocalDate to) {
        try (var wb = new SXSSFWorkbook(100); var out = new ByteArrayOutputStream()) {
            var hoja = wb.createSheet("Informe individual");

            Row r0 = hoja.createRow(0);
            r0.createCell(0).setCellValue("Estudiante");
            r0.createCell(1).setCellValue(nombre);
            Row r1 = hoja.createRow(1);
            r1.createCell(0).setCellValue("Documento");
            r1.createCell(1).setCellValue(documento);
            Row r2 = hoja.createRow(2);
            r2.createCell(0).setCellValue("Curso");
            r2.createCell(1).setCellValue(curso);
            r2.createCell(2).setCellValue("Periodo");
            r2.createCell(3).setCellValue(from + " a " + to);

            Row cab = hoja.createRow(3);
            cab.createCell(0).setCellValue("Fecha");
            cab.createCell(1).setCellValue("Asignatura");
            cab.createCell(2).setCellValue("Estado");
            cab.createCell(3).setCellValue("Observacion");

            int n = 4;
            for (var m : marcas) {
                Row r = hoja.createRow(n++);
                r.createCell(0).setCellValue(m.getClassDate().toString());
                r.createCell(1).setCellValue(m.getSubject() == null ? "" : m.getSubject());
                r.createCell(2).setCellValue(ESTADO_LEGIBLE.getOrDefault(m.getStatus(), m.getStatus()));
                r.createCell(3).setCellValue(m.getComment() == null ? "" : m.getComment());
            }
            wb.write(out);
            wb.dispose();
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static final String[] CABECERAS_INASISTENCIA =
            {"Documento", "Estudiante", "Curso", "Faltas", "Evasiones", "Fechas"};

    /** Solo quien tiene faltas o evasiones, de mas a menos, con los dias concretos. */
    public byte[] buildInasistencias(List<ReportRepository.AbsenceRow> filas,
                                     LocalDate from, LocalDate to) {
        try (var wb = new SXSSFWorkbook(100); var out = new ByteArrayOutputStream()) {
            var hoja = wb.createSheet("Inasistencias " + from + " a " + to);

            Row cabecera = hoja.createRow(0);
            for (int i = 0; i < CABECERAS_INASISTENCIA.length; i++) {
                cabecera.createCell(i).setCellValue(CABECERAS_INASISTENCIA[i]);
            }
            int n = 1;
            for (var f : filas) {
                Row r = hoja.createRow(n++);
                r.createCell(0).setCellValue(f.getDocumentId());
                r.createCell(1).setCellValue(f.getFullName());
                r.createCell(2).setCellValue(f.getGrade());
                r.createCell(3).setCellValue(f.getAbsences());
                r.createCell(4).setCellValue(f.getEvasions());
                r.createCell(5).setCellValue(f.getDates() == null ? "" : f.getDates());
            }
            wb.write(out);
            wb.dispose();
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * Matriz estudiantes x dias lectivos. Una celda vacia significa "sin registro",
     * que no es lo mismo que una falta: si la docente no paso lista, decir "F" seria
     * inventarse una inasistencia que nadie marco.
     */
    public byte[] buildMatriz(List<ReportRepository.MatrixRow> filas,
                              List<LocalDate> lectivos, LocalDate from, LocalDate to) {
        try (var wb = new SXSSFWorkbook(100); var out = new ByteArrayOutputStream()) {
            var hoja = wb.createSheet("Asistencia " + from + " a " + to);

            Row cabecera = hoja.createRow(0);
            cabecera.createCell(0).setCellValue("Documento");
            cabecera.createCell(1).setCellValue("Estudiante");
            cabecera.createCell(2).setCellValue("Curso");
            for (int i = 0; i < lectivos.size(); i++) {
                cabecera.createCell(3 + i).setCellValue(lectivos.get(i).toString());
            }
            int colPorcentaje = 3 + lectivos.size();
            cabecera.createCell(colPorcentaje).setCellValue("% Asistencia");

            var porEstudiante = new LinkedHashMap<Long, List<ReportRepository.MatrixRow>>();
            for (var f : filas) porEstudiante.computeIfAbsent(f.getStudentId(), k -> new ArrayList<>()).add(f);

            int n = 1;
            for (var grupo : porEstudiante.values()) {
                var primera = grupo.get(0);
                Row r = hoja.createRow(n++);
                r.createCell(0).setCellValue(primera.getDocumentId());
                r.createCell(1).setCellValue(primera.getFullName());
                r.createCell(2).setCellValue(primera.getGrade());

                var porDia = new HashMap<LocalDate, String>();
                for (var f : grupo) if (f.getClassDate() != null) porDia.put(f.getClassDate(), f.getStatus());

                int asistidos = 0;
                for (int i = 0; i < lectivos.size(); i++) {
                    String estado = porDia.getOrDefault(lectivos.get(i), "");
                    r.createCell(3 + i).setCellValue(estado);
                    if ("P".equals(estado) || "T".equals(estado)) asistidos++;
                }
                r.createCell(colPorcentaje).setCellValue(lectivos.isEmpty() ? 0
                        : Math.round(asistidos * 1000.0 / lectivos.size()) / 10.0);
            }
            wb.write(out);
            wb.dispose();
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static final DateTimeFormatter HORA_BOGOTA =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneId.of("America/Bogota"));

    /** Quien tomo cada lista: una fila por bloque y fecha, para auditar la jornada. */
    public byte[] buildTomas(List<ReportRepository.TomaRow> filas, LocalDate from, LocalDate to) {
        String[] cabeceras = {"Fecha", "Curso", "Bloque", "Materia", "Docente asignado", "Registro por",
                              "Hora de registro", "Marcas", "Faltas", "Evasiones"};
        try (var wb = new SXSSFWorkbook(100); var out = new ByteArrayOutputStream()) {
            var hoja = wb.createSheet("Tomas " + from + " a " + to);
            Row cabecera = hoja.createRow(0);
            for (int i = 0; i < cabeceras.length; i++) cabecera.createCell(i).setCellValue(cabeceras[i]);
            int n = 1;
            for (var f : filas) {
                Row r = hoja.createRow(n++);
                r.createCell(0).setCellValue(f.getClassDate().toString());
                r.createCell(1).setCellValue(f.getGrade());
                r.createCell(2).setCellValue(f.getBlockNo());
                r.createCell(3).setCellValue(f.getSubject() == null ? "" : f.getSubject());
                r.createCell(4).setCellValue(f.getTeacherName() == null ? "" : f.getTeacherName());
                r.createCell(5).setCellValue(f.getRecordedByName() == null ? "" : f.getRecordedByName());
                r.createCell(6).setCellValue(f.getLastRecordedAt() == null ? "" : HORA_BOGOTA.format(f.getLastRecordedAt()));
                r.createCell(7).setCellValue(f.getTotal());
                r.createCell(8).setCellValue(f.getAbsent());
                r.createCell(9).setCellValue(f.getEvasion());
            }
            wb.write(out);
            wb.dispose();
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * Volcado completo: una fila por marca con todo su contexto. Es para quien quiere
     * armar sus propias tablas dinamicas; puede pasar de cien mil filas, por eso se
     * escribe en streaming.
     */
    public byte[] buildCompleto(List<ReportRepository.MarcaCompletaRow> filas, LocalDate from, LocalDate to) {
        String[] cabeceras = {"Fecha", "Curso", "Bloque", "Materia", "Docente asignado", "Salon",
                              "Documento", "Estudiante", "Estado", "Estado (texto)", "Comentario",
                              "Registrado por", "Hora de registro", "Editado por", "Hora de edicion", "Estado anterior"};
        try (var wb = new SXSSFWorkbook(100); var out = new ByteArrayOutputStream()) {
            var hoja = wb.createSheet("Detalle " + from + " a " + to);
            Row cabecera = hoja.createRow(0);
            for (int i = 0; i < cabeceras.length; i++) cabecera.createCell(i).setCellValue(cabeceras[i]);
            int n = 1;
            for (var f : filas) {
                Row r = hoja.createRow(n++);
                r.createCell(0).setCellValue(f.getClassDate().toString());
                r.createCell(1).setCellValue(f.getGrade());
                r.createCell(2).setCellValue(f.getBlockNo() == null ? 0 : f.getBlockNo());
                r.createCell(3).setCellValue(texto(f.getSubject()));
                r.createCell(4).setCellValue(texto(f.getTeacherName()));
                r.createCell(5).setCellValue(texto(f.getRoom()));
                r.createCell(6).setCellValue(f.getDocumentId());
                r.createCell(7).setCellValue(f.getFullName());
                r.createCell(8).setCellValue(f.getStatus());
                r.createCell(9).setCellValue(ESTADO_LEGIBLE.getOrDefault(f.getStatus(), f.getStatus()));
                r.createCell(10).setCellValue(texto(f.getComment()));
                r.createCell(11).setCellValue(texto(f.getRecordedByName()));
                r.createCell(12).setCellValue(f.getRecordedAt() == null ? "" : HORA_BOGOTA.format(f.getRecordedAt()));
                r.createCell(13).setCellValue(texto(f.getEditedByName()));
                r.createCell(14).setCellValue(f.getEditedAt() == null ? "" : HORA_BOGOTA.format(f.getEditedAt()));
                r.createCell(15).setCellValue(texto(f.getPreviousStatus()));
            }
            wb.write(out);
            wb.dispose();
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static String texto(String v) { return v == null ? "" : v; }
}
