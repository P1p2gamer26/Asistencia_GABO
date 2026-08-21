package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.model.DayType;
import co.edu.ggm.asistencia.model.SchoolDay;
import co.edu.ggm.asistencia.repository.CalendarRepository;
import co.edu.ggm.asistencia.repository.ReportRepository;
import co.edu.ggm.asistencia.repository.StudentRepository;
import co.edu.ggm.asistencia.service.DashboardService;
import co.edu.ggm.asistencia.service.ExcelReportService;
import co.edu.ggm.asistencia.service.JwtService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

@RestController
@RequestMapping("/api/reports")
@PreAuthorize("hasAnyRole('DOCENTE','COORDINADOR','ADMIN')")
public class ReportController {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final ReportRepository repo;
    private final ExcelReportService excel;
    private final DashboardService dashboardService;
    private final CalendarRepository calendar;
    private final StudentRepository students;

    public ReportController(ReportRepository repo, ExcelReportService excel,
                            DashboardService dashboardService, CalendarRepository calendar,
                            StudentRepository students) {
        this.repo = repo; this.excel = excel;
        this.dashboardService = dashboardService; this.calendar = calendar;
        this.students = students;
    }

    @GetMapping("/summary")
    public List<ReportRepository.Row> summary(
            @RequestParam(required = false) String grade,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return repo.summary(grade, from, to);
    }

    @GetMapping("/excel")
    public ResponseEntity<byte[]> excel(
            @RequestParam(required = false) String grade,
            @RequestParam(required = false, defaultValue = "resumen") String tipo,
            @RequestParam(required = false) Long studentId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

        String curso = grade == null ? "todos" : grade;
        byte[] libro;
        String nombre;
        switch (tipo) {
            case "matriz" -> {
                var lectivos = calendar
                        .findByDayTypeAndCalendarDateBetweenOrderByCalendarDate(DayType.LECTIVO, from, to)
                        .stream().map(SchoolDay::getCalendarDate).toList();
                libro = excel.buildMatriz(repo.matrix(grade, from, to), lectivos, from, to);
                nombre = "asistencia_matriz_%s_%s_%s.xlsx".formatted(curso, from, to);
            }
            case "individual" -> {
                if (studentId == null) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Falta el parametro studentId");
                }
                var s = students.findById(studentId).orElseThrow(() ->
                        new ResponseStatusException(HttpStatus.NOT_FOUND, "Estudiante no encontrado"));
                libro = excel.buildIndividual(s.getDocumentId(), s.fullName(), s.getGrade(),
                        students.recentAttendance(studentId, from, to), from, to);
                nombre = "informe_%s_%s_%s.xlsx".formatted(s.getDocumentId(), from, to);
            }
            case "inasistencias" -> {
                libro = excel.buildInasistencias(repo.absences(grade, from, to), from, to);
                nombre = "inasistencias_%s_%s_%s.xlsx".formatted(curso, from, to);
            }
            default -> {
                libro = excel.build(repo.summary(grade, from, to), from, to);
                nombre = "asistencia_%s_%s_%s.xlsx".formatted(curso, from, to);
            }
        }
        return descarga(libro, nombre);
    }

    private ResponseEntity<byte[]> descarga(byte[] libro, String nombre) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + nombre + "\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(libro);
    }

    @GetMapping("/pending-today")
    public List<ReportRepository.PendingBlock> pendingToday() {
        LocalDate hoy = LocalDate.now(BOGOTA);
        return repo.pendingToday(JwtService.currentUserId(), hoy.getDayOfWeek().getValue(), hoy);
    }

    @GetMapping("/dashboard")
    @PreAuthorize("hasAnyRole('COORDINADOR','ADMIN')")
    public DashboardService.Dashboard dashboard(
            @RequestParam(required = false) String grade,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return dashboardService.build(grade, from, to);
    }
}
