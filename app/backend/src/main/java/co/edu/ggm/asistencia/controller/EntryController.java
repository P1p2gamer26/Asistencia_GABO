package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.repository.EntryRepository;
import co.edu.ggm.asistencia.service.CarnetParser;
import co.edu.ggm.asistencia.service.JwtService;
import co.edu.ggm.asistencia.repository.StudentRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import co.edu.ggm.asistencia.model.EntryLog;
import co.edu.ggm.asistencia.model.Student;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

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
            // El QR del carnet trae el texto completo, no solo el numero. Se extrae
            // aqui y no solo en el navegador porque la cola offline puede llevar
            // semanas de escaneos hechos con la version anterior.
            String documento = CarnetParser.documento(e.documentId());
            if (documento == null) {
                rejected.add(new Rejection(e.id(), "Carnet ilegible"));
                continue;
            }
            var student = students.findByDocumentIdAndActiveTrue(documento);
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

    // --- Ficha del estudiante (solo lectura) y CRUD del ingreso del dia ------------

    public record FichaDto(Long studentId, String documentId, String fullName, String grade,
                           String phone, String address, String eps,
                           UUID entryId, Instant scannedAt) {}

    public record EntryDiaDto(UUID id, String documentId, String fullName, String grade,
                              Instant scannedAt) {}

    public record UpdateEntry(@NotNull Instant scannedAt) {}

    /** Lo que se muestra al escanear: datos del estudiante (sin editar) y su ingreso de hoy. */
    @GetMapping("/ficha")
    public FichaDto ficha(@RequestParam String documentId) {
        String doc = CarnetParser.documento(documentId);
        Student s = students.findByDocumentIdAndActiveTrue(doc == null ? documentId : doc)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Estudiante no encontrado"));
        LocalDate hoy = LocalDate.now(BOGOTA);
        var e = entries.findByStudentIdAndEntryDate(s.getId(), hoy).orElse(null);
        return new FichaDto(s.getId(), s.getDocumentId(), s.fullName(), s.getGrade(),
                s.getPhone(), s.getAddress(), s.getEps(),
                e == null ? null : e.getId(), e == null ? null : e.getScannedAt());
    }

    /** Todos los ingresos de un dia (por defecto hoy), para revisarlos y corregirlos. */
    @GetMapping("/dia")
    public List<EntryDiaDto> dia(@RequestParam(required = false) String date) {
        LocalDate d = date == null ? LocalDate.now(BOGOTA) : LocalDate.parse(date);
        var lista = entries.findByEntryDateOrderByScannedAtDesc(d);
        Map<Long, Student> porId = students.findAllById(
                lista.stream().map(EntryLog::getStudentId).toList())
                .stream().collect(Collectors.toMap(Student::getId, Function.identity()));
        return lista.stream().map(e -> {
            Student s = porId.get(e.getStudentId());
            return new EntryDiaDto(e.getId(),
                    s == null ? "" : s.getDocumentId(),
                    s == null ? "(sin ficha)" : s.fullName(),
                    s == null ? "" : s.getGrade(),
                    e.getScannedAt());
        }).toList();
    }

    /** Corregir la hora de un ingreso (se escaneo con la hora del telefono mal puesta). */
    @PutMapping("/{id}")
    @Transactional
    public void editar(@PathVariable UUID id, @Valid @RequestBody UpdateEntry req) {
        var e = entries.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ingreso no encontrado"));
        e.setScannedAt(req.scannedAt());
        e.setEntryDate(req.scannedAt().atZone(BOGOTA).toLocalDate());
        entries.save(e);
    }

    /** Borrar un ingreso (escaneo por error, carnet ajeno). */
    @DeleteMapping("/{id}")
    @Transactional
    public void borrar(@PathVariable UUID id) {
        entries.deleteById(id);
    }
}
