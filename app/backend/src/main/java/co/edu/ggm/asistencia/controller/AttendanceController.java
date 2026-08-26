package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.model.ScheduleBlock;
import co.edu.ggm.asistencia.repository.AttendanceRepository;
import co.edu.ggm.asistencia.repository.ScheduleRepository;
import co.edu.ggm.asistencia.service.SyncService;
import co.edu.ggm.asistencia.service.JwtService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/attendance")
@PreAuthorize("hasAnyRole('DOCENTE','COORDINADOR','ADMIN')")
public class AttendanceController {

    private static final Logger log = LoggerFactory.getLogger(AttendanceController.class);

    private final SyncService sync;
    private final AttendanceRepository repo;
    private final ScheduleRepository blocks;

    public AttendanceController(SyncService sync, AttendanceRepository repo, ScheduleRepository blocks) {
        this.sync = sync; this.repo = repo; this.blocks = blocks;
    }

    private static String currentRole() {
        return SecurityContextHolder.getContext().getAuthentication().getAuthorities()
                .iterator().next().getAuthority().replace("ROLE_", "");
    }

    /**
     * Un docente solo puede editar/borrar la asistencia de un bloque que dicta el: es su
     * propia lista, y es lo unico que puede corregir de memoria sin volver a pasar lista.
     * Coordinacion y administracion no tienen esa restriccion: son quienes atienden
     * reclamos sobre cursos y fechas que no dictaron.
     *
     * ponytail: no se anadio una ventana de dias ("solo lo reciente"), esa regla dependeria
     * del reloj del servidor y este proyecto exige tests que no dependan de la fecha de hoy.
     * Si hace falta, agregarla como columna de configuracion en vez de LocalDate.now().
     */
    private void exigirPermiso(co.edu.ggm.asistencia.model.Attendance a) {
        String role = currentRole();
        if ("ADMIN".equals(role) || "COORDINADOR".equals(role)) return;
        Long userId = JwtService.currentUserId();
        ScheduleBlock bloque = blocks.findById(a.getScheduleBlockId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bloque inexistente"));
        if (!userId.equals(bloque.getTeacherId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Ese bloque no es suyo");
        }
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

    /** "sin registro" en vez de un nombre cuando no hay autor conocido: no se inventa un dato. */
    public record DetalleDto(UUID id, Long studentId, String fullName, String documentId,
                             String status, String comment,
                             String recordedByName, Instant recordedAt,
                             String editedByName, Instant editedAt) {}

    public record EditarDto(@NotBlank String status, String comment) {}

    private static final Set<String> ESTADOS = Set.of("P", "T", "F", "E");

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
        return repo.findByScheduleBlockIdAndClassDateAndDeletedAtIsNull(blockId, date).stream()
                .map(a -> new SavedDto(a.getId(), a.getStudentId(), a.getStatus(), a.getComment()))
                .toList();
    }

    /** Lo ya registrado para un bloque/fecha, con quien lo tomo y quien lo corrigio, para el panel de revision. */
    @GetMapping("/detalle")
    public List<DetalleDto> detalle(@RequestParam Long blockId,
                                    @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return repo.detalle(blockId, date).stream()
                .map(r -> new DetalleDto(r.getId(), r.getStudentId(), r.getFullName(), r.getDocumentId(),
                        r.getStatus(), r.getComment(),
                        r.getRecordedByName(), r.getRecordedAt(),
                        r.getEditedByName(), r.getEditedAt()))
                .toList();
    }

    public record SesionDto(Long blockId, String grade, Short blockNo, String subject,
                           LocalDate classDate, Long total, String recordedByName, Instant lastRecordedAt) {}

    /**
     * Las ultimas tomas de asistencia, para el panel lateral de /asistencia. Un docente ve
     * solo las de los bloques que dicta; coordinacion y administracion ven las de todos,
     * que es a quienes les llegan los reclamos de cursos que no dictan.
     */
    @GetMapping("/recientes")
    public List<SesionDto> recientes(@RequestParam(defaultValue = "15") int limite) {
        String role = currentRole();
        Long teacherId = ("ADMIN".equals(role) || "COORDINADOR".equals(role))
                ? null : JwtService.currentUserId();
        return repo.ultimasSesiones(teacherId, Math.min(Math.max(limite, 1), 50)).stream()
                .map(r -> new SesionDto(r.getBlockId(), r.getGrade(), r.getBlockNo(), r.getSubject(),
                        r.getClassDate(), r.getTotal(), r.getRecordedByName(), r.getLastRecordedAt()))
                .toList();
    }

    @PutMapping("/{id}")
    public void editar(@PathVariable UUID id, @Valid @RequestBody EditarDto body) {
        if (!ESTADOS.contains(body.status())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Estado invalido: " + body.status());
        }
        var a = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Registro inexistente"));
        exigirPermiso(a);
        sync.editar(id, body.status(), body.comment(), JwtService.currentUserId());
    }

    @DeleteMapping("/{id}")
    public void borrar(@PathVariable UUID id) {
        var a = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Registro inexistente"));
        exigirPermiso(a);
        sync.borrar(id, JwtService.currentUserId());
    }
}
