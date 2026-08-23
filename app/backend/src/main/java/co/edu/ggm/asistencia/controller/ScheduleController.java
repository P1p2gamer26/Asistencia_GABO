package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.repository.CalendarRepository;
import co.edu.ggm.asistencia.repository.ScheduleRepository;
import co.edu.ggm.asistencia.service.CalendarService;
import co.edu.ggm.asistencia.service.JwtService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;

@RestController
@RequestMapping("/api/schedule")
public class ScheduleController {

    private static final ZoneId ZONA = ZoneId.of("America/Bogota");

    private final ScheduleRepository schedules;
    private final CalendarService calendario;
    private final CalendarRepository calendarioRepo;

    public ScheduleController(ScheduleRepository schedules, CalendarService calendario,
                              CalendarRepository calendarioRepo) {
        this.schedules = schedules;
        this.calendario = calendario;
        this.calendarioRepo = calendarioRepo;
    }

    public record WeekBlock(Long id, String grade, int weekday, int blockNo, String subject,
                            String startTime, String endTime, String room, String teacherName) {}

    @GetMapping("/week")
    public List<WeekBlock> week(@RequestParam(required = false) String grade) {
        List<ScheduleRepository.WeekRow> filas;

        if (grade == null || grade.isBlank()) {
            // "Donde tengo clase yo": la pregunta del docente desde el celular.
            filas = schedules.weekOfTeacher(JwtService.currentUserId());
        } else {
            // "Quien le da ciencias a 601": la pregunta de coordinacion. El horario de
            // un docente es suyo, asi que pedir el de un curso exige otro rol.
            if (!tieneRol("ROLE_COORDINADOR") && !tieneRol("ROLE_ADMIN")) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Solo coordinacion puede consultar el horario de un curso");
            }
            filas = schedules.weekOfGrade(grade.trim());
        }

        return filas.stream().map(ScheduleController::toDto).toList();
    }

    private static boolean tieneRol(String rol) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getAuthorities().stream()
                .anyMatch(a -> rol.equals(a.getAuthority()));
    }

    private static String hhmm(LocalTime t) {
        return t == null ? null : String.format("%02d:%02d", t.getHour(), t.getMinute());
    }

    private static WeekBlock toDto(ScheduleRepository.WeekRow r) {
        return new WeekBlock(r.getId(), r.getGrade(), r.getWeekday(), r.getBlockNo(),
                r.getSubject(), hhmm(r.getStartTime()), hhmm(r.getEndTime()),
                r.getRoom(), r.getTeacherName());
    }

    public record BloqueDelDia(Long id, int blockNo, String grade, String subject,
                               String room, String startTime, String endTime,
                               int marcados, int estudiantes) {}

    public record MiDia(boolean lectivo, LocalDate fecha, String motivo,
                        List<BloqueDelDia> bloques) {}

    /**
     * El dia del docente: donde tiene clase y de que cursos ya paso lista.
     *
     * `fecha` es opcional y existe para poder probar esto sin depender del reloj del
     * servidor; sin ella se usa hoy.
     */
    @GetMapping("/my-day")
    public MiDia miDia(@RequestParam(required = false)
                       @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fecha) {
        LocalDate dia = fecha != null ? fecha : LocalDate.now(ZONA);
        if (!calendario.isSchoolDay(dia)) {
            // No se devuelven bloques en un dia no lectivo: mostrarlos invitaria a
            // marcar la asistencia de una clase que no existe.
            String motivo = calendarioRepo.findById(dia)
                    .map(co.edu.ggm.asistencia.model.SchoolDay::getDescription).orElse(null);
            return new MiDia(false, dia, motivo, List.of());
        }
        var filas = schedules.myDay(JwtService.currentUserId(), dia.getDayOfWeek().getValue(), dia);
        return new MiDia(true, dia, null, filas.stream()
                .map(f -> new BloqueDelDia(f.getId(), f.getBlockNo(), f.getGrade(),
                        f.getSubject(), f.getRoom(),
                        hhmm(f.getStartTime()), hhmm(f.getEndTime()),
                        f.getMarcados(), f.getEstudiantes()))
                .toList());
    }
}
