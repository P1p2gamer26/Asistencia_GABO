package co.edu.ggm.asistencia.entry.controller;

import co.edu.ggm.asistencia.entry.repository.EntryRepository;
import co.edu.ggm.asistencia.shared.service.JwtService;
import co.edu.ggm.asistencia.student.repository.StudentRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/entry")
@PreAuthorize("hasAnyRole('DOCENTE','COORDINADOR','ADMIN')")
public class EntryController {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final EntryRepository entries;
    private final StudentRepository students;

    public EntryController(EntryRepository entries, StudentRepository students) {
        this.entries = entries; this.students = students;
    }

    public record EntryDto(@NotNull UUID id, @NotNull String documentId, @NotNull Instant scannedAt) {}
    public record EntryRequest(@NotEmpty List<EntryDto> entries) {}
    public record Rejection(UUID id, String reason) {}
    public record EntryResult(int accepted, List<Rejection> rejected, Map<String, String> names) {}

    @PostMapping("/sync")
    @Transactional
    public EntryResult sync(@Valid @RequestBody EntryRequest req) {
        Long userId = JwtService.currentUserId();
        List<Rejection> rejected = new ArrayList<>();
        Map<String, String> names = new LinkedHashMap<>();
        int accepted = 0;

        for (EntryDto e : req.entries()) {
            var student = students.findByDocumentIdAndActiveTrue(e.documentId().trim());
            if (student.isEmpty()) {
                rejected.add(new Rejection(e.id(), "Carnet no registrado"));
                continue;
            }
            // La fecha del ingreso es el dia calendario en Bogota, no en UTC:
            // un escaneo de las 18:30 hora local caeria al dia siguiente si se usara UTC.
            LocalDate fecha = e.scannedAt().atZone(BOGOTA).toLocalDate();
            entries.upsert(e.id(), student.get().getId(), fecha, e.scannedAt(), userId);
            names.put(e.id().toString(), student.get().fullName());
            accepted++;
        }
        return new EntryResult(accepted, rejected, names);
    }
}
