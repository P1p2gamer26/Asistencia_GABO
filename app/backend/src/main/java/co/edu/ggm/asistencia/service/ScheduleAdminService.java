package co.edu.ggm.asistencia.service;

import co.edu.ggm.asistencia.model.ScheduleBlock;
import co.edu.ggm.asistencia.model.Subject;
import co.edu.ggm.asistencia.repository.AttendanceRepository;
import co.edu.ggm.asistencia.repository.ScheduleRepository;
import co.edu.ggm.asistencia.repository.SubjectRepository;
import co.edu.ggm.asistencia.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalTime;
import java.util.Locale;

/**
 * CRUD del horario para coordinacion/admin. Solo aqui se escribe schedule_blocks;
 * la lectura general vive en ScheduleController.
 */
@Service
public class ScheduleAdminService {

    private final ScheduleRepository schedules;
    private final AttendanceRepository attendance;
    private final SubjectRepository subjects;
    private final UserRepository users;

    public ScheduleAdminService(ScheduleRepository schedules, AttendanceRepository attendance,
                                SubjectRepository subjects, UserRepository users) {
        this.schedules = schedules;
        this.attendance = attendance;
        this.subjects = subjects;
        this.users = users;
    }

    public record Datos(String grade, int weekday, int blockNo, LocalTime startTime, LocalTime endTime,
                        Long subjectId, Long teacherId, String room) {}

    @Transactional
    public ScheduleBlock crear(Datos d, Long autorId) {
        ScheduleBlock b = new ScheduleBlock();
        aplicar(b, d);
        verificarChoques(d, null);
        b.setCreatedBy(autorId);
        b.setCreatedAt(Instant.now());
        return schedules.save(b);
    }

    @Transactional
    public ScheduleBlock editar(Long id, Datos d, Long autorId) {
        ScheduleBlock b = schedules.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No existe ese bloque de horario"));
        aplicar(b, d);
        verificarChoques(d, id);
        b.setUpdatedBy(autorId);
        b.setUpdatedAt(Instant.now());
        return schedules.save(b);
    }

    @Transactional
    public void borrar(Long id) {
        ScheduleBlock b = schedules.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No existe ese bloque de horario"));
        long marcas = attendance.countByScheduleBlockId(id);
        if (marcas > 0) {
            // No se borra en cascada ni se rompe la FK: un bloque con asistencia registrada
            // es historial academico y borrarlo lo destruiria de forma irreversible.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "No se puede borrar: tiene " + marcas + " registro(s) de asistencia. "
                    + "Cambia la materia, el docente o el horario en vez de borrar el bloque.");
        }
        schedules.delete(b);
    }

    private void aplicar(ScheduleBlock b, Datos d) {
        if (d.grade() == null || d.grade().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El curso es obligatorio");
        }
        if (d.weekday() < 1 || d.weekday() > 6) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El dia de ciclo (1 a 5) debe ser entre 1 y 6");
        }
        if (d.blockNo() < 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El numero de bloque debe ser positivo");
        }
        if (d.startTime() == null || d.endTime() == null || !d.startTime().isBefore(d.endTime())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La hora de inicio debe ser anterior a la de fin");
        }
        Subject subject = subjects.findById(d.subjectId()).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No existe esa materia"));
        if (!users.existsById(d.teacherId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No existe ese docente");
        }
        // Curso en mayusculas: '8a' y '8A' deben ser el mismo curso. Si no, el bloque
        // queda ligado a un curso que ningun estudiante tiene ('8A'), y al docente le
        // sale la clase sin un solo estudiante.
        b.setGrade(d.grade().trim().toUpperCase(Locale.ROOT));
        b.setWeekday((short) d.weekday());
        b.setBlockNo((short) d.blockNo());
        b.setStartTime(d.startTime());
        b.setEndTime(d.endTime());
        b.setSubject(subject);
        b.setTeacherId(d.teacherId());
        b.setRoom(d.room() == null || d.room().isBlank() ? null : d.room().trim());
    }

    private void verificarChoques(Datos d, Long excludeId) {
        // El curso ya tiene una clase en ese dia/bloque: sin este aviso, chocaba contra
        // la restriccion unica de la base y salia un 500 en vez de un mensaje claro.
        String curso = d.grade().trim().toUpperCase(Locale.ROOT);
        var choqueCurso = schedules.choqueDeCurso(curso, d.weekday(), d.blockNo(), excludeId);
        if (!choqueCurso.isEmpty()) {
            var c = choqueCurso.get(0);
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "El curso " + curso + " ya tiene " + c.getSubject() + " con "
                    + c.getTeacherName() + " en ese dia y bloque. Edita ese bloque en vez de crear otro.");
        }
        var choqueDocente = schedules.choqueDeDocente(d.teacherId(), d.weekday(), d.blockNo(), excludeId);
        if (!choqueDocente.isEmpty()) {
            var c = choqueDocente.get(0);
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "El docente ya tiene clase de " + c.getSubject() + " con el curso " + c.getGrade()
                    + " en ese mismo bloque horario (dia " + c.getWeekday() + ", bloque " + c.getBlockNo() + ")");
        }
        if (d.room() != null && !d.room().isBlank()) {
            var choqueAula = schedules.choqueDeAula(d.room().trim(), d.weekday(), d.blockNo(), excludeId);
            if (!choqueAula.isEmpty()) {
                var c = choqueAula.get(0);
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "El aula " + d.room() + " ya esta ocupada por " + c.getSubject() + " con el curso "
                        + c.getGrade() + " (docente " + c.getTeacherName() + ") en ese mismo bloque horario "
                        + "(dia " + c.getWeekday() + ", bloque " + c.getBlockNo() + ")");
            }
        }
    }
}
