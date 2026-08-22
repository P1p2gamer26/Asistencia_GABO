package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.repository.ScheduleRepository;
import co.edu.ggm.asistencia.service.JwtService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalTime;
import java.util.List;

@RestController
@RequestMapping("/api/schedule")
public class ScheduleController {

    private final ScheduleRepository schedules;

    public ScheduleController(ScheduleRepository schedules) { this.schedules = schedules; }

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
}
