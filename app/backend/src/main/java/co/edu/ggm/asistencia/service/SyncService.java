package co.edu.ggm.asistencia.service;

import co.edu.ggm.asistencia.repository.AttendanceRepository;
import co.edu.ggm.asistencia.repository.ScheduleRepository;
import co.edu.ggm.asistencia.repository.StudentRepository;
import co.edu.ggm.asistencia.service.CalendarService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Set;
import java.util.UUID;

@Service
public class SyncService {

    private static final Set<String> ESTADOS = Set.of("P", "T", "F", "E");

    private final AttendanceRepository repo;
    private final CalendarService calendar;
    private final StudentRepository students;
    private final ScheduleRepository blocks;
    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    public SyncService(AttendanceRepository repo, CalendarService calendar,
                       StudentRepository students, ScheduleRepository blocks) {
        this.repo = repo; this.calendar = calendar; this.students = students; this.blocks = blocks;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void save(UUID id, Long studentId, Long blockId, LocalDate classDate,
                     String status, String comment, Long recordedBy, boolean admin, Instant recordedAt) {
        // Un UUID ya persistido es la confirmacion de un envio anterior. No se vuelve a
        // aplicar aunque el registro haya sido corregido o borrado despues.
        if (repo.existsById(id)) return;
        var student = students.findById(studentId)
                .orElseThrow(() -> new SyncRejectedException("Estudiante inexistente"));
        var block = blocks.findById(blockId)
                .orElseThrow(() -> new SyncRejectedException("Bloque inexistente"));
        if (!admin && !recordedBy.equals(block.getTeacherId())) {
            throw new SyncRejectedException("El bloque no es suyo");
        }
        if (!student.getGrade().equals(block.getGrade())) {
            throw new SyncRejectedException("El estudiante no es de ese curso");
        }
        if (comment != null && comment.length() > 280) {
            throw new SyncRejectedException("Comentario demasiado largo");
        }
        if (classDate.isAfter(LocalDate.now(BOGOTA))) {
            throw new SyncRejectedException("Fecha futura");
        }
        if (!ESTADOS.contains(status)) {
            throw new SyncRejectedException("Estado invalido: " + status);
        }
        if (!calendar.isSchoolDay(classDate)) {
            throw new SyncRejectedException("La fecha no es un dia lectivo");
        }
        String limpio = (comment == null || comment.isBlank()) ? null : comment.trim();
        Instant now = Instant.now();
        if (recordedAt.isAfter(now.plusSeconds(300))) recordedAt = now;
        int actualizadas = repo.updateExisting(studentId, blockId, classDate, status,
                limpio, recordedBy, recordedAt);
        if (actualizadas == 0) {
            repo.insertIfAbsent(id, studentId, blockId, classDate, status,
                    limpio, recordedBy, recordedAt);
        }
    }

    /** Error de negocio que puede mostrarse de forma segura en la cola offline. */
    public static class SyncRejectedException extends RuntimeException {
        public SyncRejectedException(String reason) { super(reason); }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int editar(UUID id, String status, String comment, Long editedBy) {
        if (!ESTADOS.contains(status)) {
            throw new IllegalArgumentException("Estado invalido: " + status);
        }
        String limpio = (comment == null || comment.isBlank()) ? null : comment.trim();
        return repo.editar(id, status, limpio, editedBy);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int borrar(UUID id, Long deletedBy) {
        return repo.borrar(id, deletedBy);
    }
}
