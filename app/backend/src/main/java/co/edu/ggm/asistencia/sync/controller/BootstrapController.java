package co.edu.ggm.asistencia.sync.controller;

import co.edu.ggm.asistencia.calendar.controller.CalendarController;
import co.edu.ggm.asistencia.calendar.service.CalendarService;
import co.edu.ggm.asistencia.schedule.model.ScheduleBlock;
import co.edu.ggm.asistencia.schedule.repository.ScheduleRepository;
import co.edu.ggm.asistencia.shared.service.JwtService;
import co.edu.ggm.asistencia.student.model.Student;
import co.edu.ggm.asistencia.student.repository.StudentRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
@PreAuthorize("hasAnyRole('DOCENTE','COORDINADOR','ADMIN')")
public class BootstrapController {

    private final ScheduleRepository schedules;
    private final StudentRepository students;
    private final CalendarService calendar;

    public BootstrapController(ScheduleRepository schedules, StudentRepository students, CalendarService calendar) {
        this.schedules = schedules; this.students = students; this.calendar = calendar;
    }

    public record BlockDto(Long id, String grade, int weekday, int blockNo, String subject, String startTime) {}
    public record StudentDto(Long id, String documentId, String fullName, String grade) {}
    public record Bootstrap(List<BlockDto> blocks, List<StudentDto> students,
                            List<CalendarController.DayDto> schoolDays) {}

    @GetMapping("/sync/bootstrap")
    public Bootstrap bootstrap() {
        List<ScheduleBlock> myBlocks = schedules
                .findByTeacherIdOrderByWeekdayAscBlockNoAsc(JwtService.currentUserId());
        Set<String> grades = myBlocks.stream().map(ScheduleBlock::getGrade).collect(Collectors.toSet());
        List<Student> myStudents = grades.isEmpty()
                ? List.of()
                : students.findByActiveTrueAndGradeInOrderByLastNameAscFirstNameAsc(grades);

        // Ventana corta a proposito: un mes atras para corregir dias pasados,
        // tres adelante para planear. El ano entero serian ~250 fechas de mas.
        LocalDate hoy = LocalDate.now(ZoneId.of("America/Bogota"));
        List<CalendarController.DayDto> dias = calendar.range(hoy.minusMonths(1), hoy.plusMonths(3))
                .stream()
                .map(d -> new CalendarController.DayDto(d.getCalendarDate(), d.getDayType(),
                        d.getDescription()))
                .toList();

        return new Bootstrap(
                myBlocks.stream().map(BootstrapController::toDto).toList(),
                myStudents.stream()
                        .map(s -> new StudentDto(s.getId(), s.getDocumentId(), s.fullName(), s.getGrade()))
                        .toList(),
                dias);
    }

    @GetMapping("/schedule/mine")
    public List<BlockDto> mine() {
        return bootstrap().blocks();
    }

    private static BlockDto toDto(ScheduleBlock b) {
        LocalTime start = b.getStartTime();
        return new BlockDto(b.getId(), b.getGrade(), b.getWeekday(), b.getBlockNo(),
                b.getSubject().getName(), String.format("%02d:%02d", start.getHour(), start.getMinute()));
    }
}
