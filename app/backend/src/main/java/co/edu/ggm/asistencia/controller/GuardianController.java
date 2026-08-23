package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.service.JwtService;
import co.edu.ggm.asistencia.repository.ReportRepository;
import co.edu.ggm.asistencia.repository.ScheduleRepository;
import co.edu.ggm.asistencia.repository.StudentRepository;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/guardian")
@PreAuthorize("hasRole('ACUDIENTE')")
public class GuardianController {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final StudentRepository students;
    private final ReportRepository reports;
    private final ScheduleRepository schedules;

    public GuardianController(StudentRepository students, ReportRepository reports,
                              ScheduleRepository schedules) {
        this.students = students;
        this.reports = reports;
        this.schedules = schedules;
    }

    public record Mark(LocalDate classDate, String subject, String status, String comment) {}
    public record BloqueHorario(int weekday, int blockNo, String subject, String room,
                                String startTime, String endTime, String teacherName) {}
    public record Child(Long studentId, String fullName, String grade,
                        int schoolDays, int recordedDays,
                        int asistio, int falto, int tarde, int evadio,
                        List<Mark> recent, List<BloqueHorario> horario) {}

    @GetMapping("/children")
    public List<Child> children(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

        // Por defecto, un bimestre: el portal es para el seguimiento cercano. Para el
        // historico completo esta el informe que descarga coordinacion.
        LocalDate hasta = to != null ? to : LocalDate.now(BOGOTA);
        LocalDate desde = from != null ? from : hasta.minusDays(60);

        int lectivos = reports.countSchoolDays(desde, hasta);

        List<StudentRepository.ChildRow> hijos = students.findChildren(JwtService.currentUserId());
        List<Long> ids = hijos.stream().map(StudentRepository.ChildRow::getStudentId).toList();

        // Una sola consulta para todos los hijos, no una por hijo. `IN ()` es un error
        // de sintaxis en PostgreSQL si `ids` viene vacia.
        Map<Long, ReportRepository.ConteoRow> conteos = ids.isEmpty() ? Map.of()
                : reports.conteosPorEstudiante(ids).stream()
                        .collect(Collectors.toMap(ReportRepository.ConteoRow::getStudentId, c -> c));

        return hijos.stream()
                .map(c -> {
                    ReportRepository.ConteoRow conteo = conteos.get(c.getStudentId());
                    List<BloqueHorario> horario = schedules.weekOfGrade(c.getGrade()).stream()
                            .map(b -> new BloqueHorario(b.getWeekday(), b.getBlockNo(), b.getSubject(),
                                    b.getRoom(), hora(b.getStartTime()), hora(b.getEndTime()),
                                    b.getTeacherName()))
                            .toList();
                    return new Child(
                            c.getStudentId(), c.getFullName(), c.getGrade(),
                            lectivos,
                            students.countRecordedDays(c.getStudentId(), desde, hasta),
                            conteo != null ? conteo.getAsistio() : 0,
                            conteo != null ? conteo.getFalto() : 0,
                            conteo != null ? conteo.getTarde() : 0,
                            conteo != null ? conteo.getEvadio() : 0,
                            students.recentAttendance(c.getStudentId(), desde, hasta).stream()
                                    .map(a -> new Mark(a.getClassDate(), a.getSubject(), a.getStatus(), a.getComment()))
                                    .toList(),
                            horario);
                })
                .toList();
    }

    private static String hora(LocalTime t) {
        return t == null ? null : String.format("%02d:%02d", t.getHour(), t.getMinute());
    }
}
