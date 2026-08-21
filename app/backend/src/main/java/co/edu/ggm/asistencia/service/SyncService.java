package co.edu.ggm.asistencia.service;

import co.edu.ggm.asistencia.repository.AttendanceRepository;
import co.edu.ggm.asistencia.service.CalendarService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

@Service
public class SyncService {

    private static final Set<String> ESTADOS = Set.of("P", "T", "F", "E");

    private final AttendanceRepository repo;
    private final CalendarService calendar;

    public SyncService(AttendanceRepository repo, CalendarService calendar) {
        this.repo = repo; this.calendar = calendar;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void save(UUID id, Long studentId, Long blockId, LocalDate classDate,
                     String status, String comment, Long recordedBy, Instant recordedAt) {
        if (!ESTADOS.contains(status)) {
            throw new IllegalArgumentException("Estado invalido: " + status);
        }
        if (!calendar.isSchoolDay(classDate)) {
            throw new IllegalArgumentException("La fecha no es un dia lectivo");
        }
        String limpio = (comment == null || comment.isBlank()) ? null : comment.trim();
        int actualizadas = repo.updateExisting(studentId, blockId, classDate, status,
                limpio, recordedBy, recordedAt);
        if (actualizadas == 0) {
            repo.insertIfAbsent(id, studentId, blockId, classDate, status,
                    limpio, recordedBy, recordedAt);
        }
    }
}
