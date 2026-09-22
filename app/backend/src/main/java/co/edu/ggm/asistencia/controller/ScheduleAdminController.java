package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.model.ScheduleBlock;
import co.edu.ggm.asistencia.repository.ScheduleRepository;
import co.edu.ggm.asistencia.repository.SubjectRepository;
import co.edu.ggm.asistencia.service.JwtService;
import co.edu.ggm.asistencia.service.ScheduleAdminService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalTime;
import java.util.List;

/**
 * CRUD del horario del colegio. Solo coordinacion/admin: un docente no edita el
 * horario, solo lo consulta (ver ScheduleController).
 */
@RestController
@RequestMapping("/api/admin/schedule")
@PreAuthorize("hasRole('ADMIN')")
public class ScheduleAdminController {

    private final ScheduleAdminService service;
    private final ScheduleRepository schedules;
    private final SubjectRepository subjects;

    public ScheduleAdminController(ScheduleAdminService service, ScheduleRepository schedules,
                                   SubjectRepository subjects) {
        this.service = service;
        this.schedules = schedules;
        this.subjects = subjects;
    }

    public record MateriaDto(Long id, String name) {}

    @GetMapping("/subjects")
    public List<MateriaDto> materias() {
        return subjects.findAll().stream().map(s -> new MateriaDto(s.getId(), s.getName())).toList();
    }

    public record Request(@NotBlank String grade, @NotNull Integer weekday, @NotNull Integer blockNo,
                          @NotNull LocalTime startTime, @NotNull LocalTime endTime,
                          @NotNull Long subjectId, @NotNull Long teacherId, String room) {
        ScheduleAdminService.Datos aDatos() {
            return new ScheduleAdminService.Datos(grade, weekday, blockNo, startTime, endTime,
                    subjectId, teacherId, room);
        }
    }

    public record BloqueDto(Long id, String grade, int weekday, int blockNo, String subject, Long subjectId,
                            String startTime, String endTime, String room, Long teacherId, String teacherName,
                            Long createdBy, String createdByName, String createdAt,
                            Long updatedBy, String updatedByName, String updatedAt) {}

    @GetMapping
    public List<BloqueDto> listar(@RequestParam(required = false) String grade,
                                  @RequestParam(required = false) Long teacherId) {
        return schedules.paraAdmin(
                        grade == null || grade.isBlank() ? null : grade.trim(), teacherId)
                .stream().map(ScheduleAdminController::toDto).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BloqueDto crear(@Valid @RequestBody Request req) {
        ScheduleBlock b = service.crear(req.aDatos(), JwtService.currentUserId());
        return toDto(b);
    }

    @PutMapping("/{id}")
    public BloqueDto editar(@PathVariable Long id, @Valid @RequestBody Request req) {
        ScheduleBlock b = service.editar(id, req.aDatos(), JwtService.currentUserId());
        return toDto(b);
    }

    @DeleteMapping("/{id}")
    public void borrar(@PathVariable Long id) {
        service.borrar(id);
    }

    private static String hhmm(LocalTime t) {
        return t == null ? null : String.format("%02d:%02d", t.getHour(), t.getMinute());
    }

    private static BloqueDto toDto(ScheduleBlock b) {
        return new BloqueDto(b.getId(), b.getGrade(), b.getWeekday(), b.getBlockNo(),
                b.getSubject().getName(), b.getSubject().getId(),
                hhmm(b.getStartTime()), hhmm(b.getEndTime()), b.getRoom(),
                b.getTeacherId(), null,
                b.getCreatedBy(), null, b.getCreatedAt() == null ? null : b.getCreatedAt().toString(),
                b.getUpdatedBy(), null, b.getUpdatedAt() == null ? null : b.getUpdatedAt().toString());
    }

    private static BloqueDto toDto(ScheduleRepository.AdminRow r) {
        return new BloqueDto(r.getId(), r.getGrade(), r.getWeekday(), r.getBlockNo(),
                r.getSubject(), r.getSubjectId(),
                hhmm(r.getStartTime()), hhmm(r.getEndTime()), r.getRoom(),
                r.getTeacherId(), r.getTeacherName(),
                r.getCreatedBy(), r.getCreatedByName(),
                r.getCreatedAt() == null ? null : r.getCreatedAt().toString(),
                r.getUpdatedBy(), r.getUpdatedByName(),
                r.getUpdatedAt() == null ? null : r.getUpdatedAt().toString());
    }
}
