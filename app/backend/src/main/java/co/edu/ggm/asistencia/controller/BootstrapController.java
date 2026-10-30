package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.controller.CalendarController;
import co.edu.ggm.asistencia.service.AccesoCursoService;
import co.edu.ggm.asistencia.service.CalendarService;
import co.edu.ggm.asistencia.model.ScheduleBlock;
import co.edu.ggm.asistencia.repository.ScheduleRepository;
import co.edu.ggm.asistencia.service.JwtService;
import co.edu.ggm.asistencia.model.Student;
import co.edu.ggm.asistencia.repository.StudentRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
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
@PreAuthorize("hasAnyRole('DOCENTE','ORIENTADOR','ADMIN')")
public class BootstrapController {

    private final ScheduleRepository schedules;
    private final StudentRepository students;
    private final CalendarService calendar;
    private final AccesoCursoService acceso;

    public BootstrapController(ScheduleRepository schedules, StudentRepository students, CalendarService calendar,
                               AccesoCursoService acceso) {
        this.schedules = schedules; this.students = students; this.calendar = calendar; this.acceso = acceso;
    }

    public record BlockDto(Long id, String grade, int weekday, int blockNo, String subject, String startTime,
                           String room, Long teacherId) {}
    public record StudentDto(Long id, String documentId, String fullName, String grade, String sortKey) {}
    public record Bootstrap(List<BlockDto> blocks, List<StudentDto> students,
                            List<CalendarController.DayDto> schoolDays, List<String> assignedGrades) {}

    @GetMapping("/sync/bootstrap")
    public Bootstrap bootstrap() {
        // Coordinacion y rectoria necesitan ver todos los cursos para poder tomar
        // asistencia por cualquiera de ellos, no solo los que tengan asignados a su
        // propio nombre (que normalmente son cero). El docente sigue viendo solo lo
        // suyo: es la unica via que impide que un docente vea datos de otro curso.
        Long userId = JwtService.currentUserId();
        List<String> asignados = acceso.asignados(userId);
        // ORIENTADOR, ADMIN y el docente sin horario ni asignaciones toman lista de cualquier curso.
        boolean vecTodoElColegio = tieneRol("ROLE_ADMIN") || tieneRol("ROLE_ORIENTADOR")
                || (tieneRol("ROLE_DOCENTE") && acceso.sinRestriccion(userId));

        List<ScheduleBlock> myBlocks = vecTodoElColegio
                ? schedules.findAllByOrderByWeekdayAscBlockNoAsc()
                : schedules.findByTeacherIdOrderByWeekdayAscBlockNoAsc(userId);
        if (!vecTodoElColegio && !asignados.isEmpty()) {
            // Cursos asignados: se suman sus bloques (de cualquier docente) para poder tomar lista.
            var propios = myBlocks.stream().map(ScheduleBlock::getId).collect(Collectors.toSet());
            var todos = new java.util.ArrayList<>(myBlocks);
            schedules.findAllByOrderByWeekdayAscBlockNoAsc().stream()
                    .filter(b -> asignados.contains(b.getGrade()) && !propios.contains(b.getId()))
                    .forEach(todos::add);
            myBlocks = todos;
        }

        List<Student> myStudents;
        if (vecTodoElColegio) {
            // Con ~1200 estudiantes reales esto trae todos: aceptable y medido en
            // este proyecto (bootstrap se pide una vez al abrir la app, no por curso).
            myStudents = students.findByActiveTrueOrderByLastNameAscSecondSurnameAscFirstNameAsc();
        } else {
            Set<String> grades = myBlocks.stream().map(ScheduleBlock::getGrade).collect(Collectors.toSet());
            grades.addAll(asignados);
            myStudents = grades.isEmpty()
                    ? List.of()
                    : students.findByActiveTrueAndGradeInOrderByLastNameAscSecondSurnameAscFirstNameAsc(grades);
        }

        // Ventana corta a proposito: un mes atras para corregir dias pasados,
        // tres adelante para planear. El ano entero serian ~250 fechas de mas.
        LocalDate hoy = LocalDate.now(ZoneId.of("America/Bogota"));
        List<CalendarController.DayDto> dias = calendar.range(hoy.minusMonths(1), hoy.plusMonths(3))
                .stream()
                .map(d -> new CalendarController.DayDto(d.getCalendarDate(), d.getDayType(),
                        d.getDescription(), d.getCycleDay(), d.getCycleDayFixed()))
                .toList();

        return new Bootstrap(
                myBlocks.stream().map(BootstrapController::toDto).toList(),
                myStudents.stream()
                        .map(s -> new StudentDto(s.getId(), s.getDocumentId(), s.fullName(), s.getGrade(), s.sortKey()))
                        .toList(),
                dias, asignados);
    }

    @GetMapping("/schedule/mine")
    public List<BlockDto> mine() {
        return bootstrap().blocks();
    }

    private static boolean tieneRol(String rol) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getAuthorities().stream()
                .anyMatch(a -> rol.equals(a.getAuthority()));
    }

    private static BlockDto toDto(ScheduleBlock b) {
        LocalTime start = b.getStartTime();
        return new BlockDto(b.getId(), b.getGrade(), b.getWeekday(), b.getBlockNo(),
                b.getSubject().getName(), String.format("%02d:%02d", start.getHour(), start.getMinute()),
                b.getRoom(), b.getTeacherId());
    }
}
