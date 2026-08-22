package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.repository.AttendanceRepository;
import co.edu.ggm.asistencia.service.SyncService;
import co.edu.ggm.asistencia.service.JwtService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/attendance")
@PreAuthorize("hasAnyRole('DOCENTE','COORDINADOR','ADMIN')")
public class AttendanceController {

    private static final Logger log = LoggerFactory.getLogger(AttendanceController.class);

    private final SyncService sync;
    private final AttendanceRepository repo;

    public AttendanceController(SyncService sync, AttendanceRepository repo) {
        this.sync = sync; this.repo = repo;
    }

    public record RecordDto(@NotNull UUID id, @NotNull Long studentId, @NotNull Long scheduleBlockId,
                            @NotNull LocalDate classDate, @NotNull String status,
                            String comment, @NotNull Instant recordedAt) {}
    /**
     * 500 registros: un curso son 40 estudiantes y una jornada completa unos 240.
     * Deja holgura para un docente que estuvo una semana sin senal, y ataja el caso
     * de un almacen local corrupto, donde cada registro abre su propia transaccion.
     */
    public record SyncRequest(@NotEmpty @Size(max = 500) List<RecordDto> records) {}
    public record Rejection(UUID id, String reason) {}
    public record SyncResult(int accepted, List<Rejection> rejected) {}
    public record SavedDto(UUID id, Long studentId, String status, String comment) {}

    @PostMapping("/sync")
    public SyncResult sync(@Valid @RequestBody SyncRequest req) {
        Long userId = JwtService.currentUserId();
        List<Rejection> rejected = new ArrayList<>();
        int accepted = 0;
        for (RecordDto r : req.records()) {
            try {
                sync.save(r.id(), r.studentId(), r.scheduleBlockId(), r.classDate(),
                        r.status(), r.comment(), userId, r.recordedAt());
                accepted++;
            } catch (RuntimeException e) {
                log.warn("Registro rechazado {}: {}", r.id(), e.getMessage());
                rejected.add(new Rejection(r.id(), e.getMessage()));
            }
        }
        return new SyncResult(accepted, rejected);
    }

    @GetMapping
    public List<SavedDto> ofBlock(@RequestParam Long blockId,
                                  @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return repo.findByScheduleBlockIdAndClassDate(blockId, date).stream()
                .map(a -> new SavedDto(a.getId(), a.getStudentId(), a.getStatus(), a.getComment()))
                .toList();
    }
}
