package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.service.JwtService;
import co.edu.ggm.asistencia.repository.ReportRepository;
import co.edu.ggm.asistencia.repository.StudentRepository;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

@RestController
@RequestMapping("/api/guardian")
@PreAuthorize("hasRole('ACUDIENTE')")
public class GuardianController {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final StudentRepository students;
    private final ReportRepository reports;

    public GuardianController(StudentRepository students, ReportRepository reports) {
        this.students = students;
        this.reports = reports;
    }

    public record Mark(LocalDate classDate, String subject, String status, String comment) {}
    public record Child(Long studentId, String fullName, String grade,
                        int schoolDays, int recordedDays, List<Mark> recent) {}

    @GetMapping("/children")
    public List<Child> children(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

        // Por defecto, un bimestre: el portal es para el seguimiento cercano. Para el
        // historico completo esta el informe que descarga coordinacion.
        LocalDate hasta = to != null ? to : LocalDate.now(BOGOTA);
        LocalDate desde = from != null ? from : hasta.minusDays(60);

        int lectivos = reports.countSchoolDays(desde, hasta);

        return students.findChildren(JwtService.currentUserId()).stream()
                .map(c -> new Child(
                        c.getStudentId(), c.getFullName(), c.getGrade(),
                        lectivos,
                        students.countRecordedDays(c.getStudentId(), desde, hasta),
                        students.recentAttendance(c.getStudentId(), desde, hasta).stream()
                                .map(a -> new Mark(a.getClassDate(), a.getSubject(), a.getStatus(), a.getComment()))
                                .toList()))
                .toList();
    }
}
