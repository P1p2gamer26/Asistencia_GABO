package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.model.DayType;
import co.edu.ggm.asistencia.model.SchoolDay;
import co.edu.ggm.asistencia.repository.CalendarRepository;
import co.edu.ggm.asistencia.repository.ReportRepository;
import co.edu.ggm.asistencia.repository.StudentRepository;
import co.edu.ggm.asistencia.service.CalendarService;
import co.edu.ggm.asistencia.service.DashboardService;
import co.edu.ggm.asistencia.service.ExcelReportService;
import co.edu.ggm.asistencia.service.JwtService;
import co.edu.ggm.asistencia.service.NovedadesService;
import co.edu.ggm.asistencia.service.TodayService;
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
    private final TodayService todayService;
    private final NovedadesService novedadesService;
    private final CalendarService calendarioService;

    public ReportController(ReportRepository repo, ExcelReportService excel,
                            DashboardService dashboardService, CalendarRepository calendar,
                            StudentRepository students, TodayService todayService,
                            NovedadesService novedadesService, CalendarService calendarioService) {
        this.repo = repo; this.excel = excel;
        this.dashboardService = dashboardService; this.calendar = calendar;
        this.students = students; this.todayService = todayService;
        this.novedadesService = novedadesService; this.calendarioService = calendarioService;
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

    public record PendienteReciente(LocalDate fecha, Long blockId, String grade,
                                    String subject, String room, int blockNo) {}

    /**
     * Las listas que el docente dejo sin tomar en dias lectivos pasados (no hoy).
     *
     * `hoy` es opcional y existe para poder probar esto sin depender del reloj del
     * servidor, igual que en /schedule/my-day.
     */
    @GetMapping("/pending-recent")
    public List<PendienteReciente> pendingRecent(
            @RequestParam(required = false, defaultValue = "7") int dias,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hoy) {
        LocalDate ref = hoy != null ? hoy : LocalDate.now(BOGOTA);
        List<LocalDate> lectivosPrevios = calendarioService.ultimosLectivosAntesDe(ref, dias);
        if (lectivosPrevios.isEmpty()) return List.of();
        return repo.pendingRecent(JwtService.currentUserId(), lectivosPrevios).stream()
                .map(r -> new PendienteReciente(r.getFecha(), r.getBlockId(), r.getGrade(),
                        r.getSubject(), r.getRoom(), r.getBlockNo()))
                .toList();
    }

    @GetMapping("/dashboard")
    @PreAuthorize("hasAnyRole('COORDINADOR','ADMIN')")
    public DashboardService.Dashboard dashboard(
            @RequestParam(required = false) String grade,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return dashboardService.build(grade, from, to);
    }

    @GetMapping("/today")
    @PreAuthorize("hasAnyRole('COORDINADOR','ADMIN')")
    public TodayService.ResumenDeHoy today() {
        return todayService.resumen(LocalDate.now(TodayService.BOGOTA));
    }

    @GetMapping("/novedades")
    @PreAuthorize("hasAnyRole('COORDINADOR','ADMIN')")
    public NovedadesService.Reporte novedades(
            @RequestParam(required = false, defaultValue = "7") int dias,
            @RequestParam(required = false, defaultValue = "10") int limite) {
        LocalDate hoy = LocalDate.now(BOGOTA);
        return novedadesService.build(hoy.minusDays(dias), hoy, limite);
    }
}
