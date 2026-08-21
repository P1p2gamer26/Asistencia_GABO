package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.service.JwtService;
import co.edu.ggm.asistencia.repository.StudentRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
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

    public GuardianController(StudentRepository students) {
        this.students = students;
    }

    public record Mark(LocalDate classDate, String subject, String status, String comment) {}
    public record Child(Long studentId, String fullName, String grade, List<Mark> recent) {}

    @GetMapping("/children")
    public List<Child> children() {
        LocalDate hasta = LocalDate.now(BOGOTA);
        LocalDate desde = hasta.minusDays(30);

        return students.findChildren(JwtService.currentUserId()).stream()
                .map(c -> new Child(c.getStudentId(), c.getFullName(), c.getGrade(),
                        students.recentAttendance(c.getStudentId(), desde, hasta).stream()
                                .map(a -> new Mark(a.getClassDate(), a.getSubject(), a.getStatus(), a.getComment()))
                                .toList()))
                .toList();
    }
}
