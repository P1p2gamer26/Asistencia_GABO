package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.model.DayType;
import co.edu.ggm.asistencia.repository.CalendarRepository;
import co.edu.ggm.asistencia.service.JwtService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Asistencia general de los dias 0: una marca por estudiante y dia, sin bloques. */
@RestController
@RequestMapping("/api/dia-cero")
@PreAuthorize("hasAnyRole('DOCENTE','ADMIN')")
public class DiaCeroController {

    private static final Set<String> ESTADOS = Set.of("P", "T", "F", "E");

    private final JdbcTemplate jdbc;
    private final CalendarRepository calendar;

    public DiaCeroController(JdbcTemplate jdbc, CalendarRepository calendar) {
        this.jdbc = jdbc; this.calendar = calendar;
    }

    public record Marca(Long studentId, String status, String comment) {}
    public record Guardado(String grade, LocalDate date, List<Marca> marcas) {}

    private void exigirDiaCero(LocalDate date) {
        var dia = calendar.findById(date).orElse(null);
        if (dia == null || dia.getDayType() != DayType.DIA_CERO) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ese dia no es dia 0");
        }
    }

    private static ResponseStatusException invalido(String motivo) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, motivo);
    }

    @GetMapping
    public List<Marca> marcas(@RequestParam String grade,
                              @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        exigirDiaCero(date);
        return jdbc.query("""
                SELECT g.student_id, g.status, g.comment
                FROM attendance_general g
                JOIN students s ON s.id = g.student_id
                WHERE s.grade = ? AND g.class_date = ?
                """,
                (rs, i) -> new Marca(rs.getLong(1), rs.getString(2), rs.getString(3)),
                grade, date);
    }

    @PutMapping
    @Transactional
    public Map<String, Integer> guardar(@RequestBody Guardado req) {
        exigirDiaCero(req.date());
        Set<Long> delCurso = new HashSet<>(jdbc.queryForList(
                "SELECT id FROM students WHERE grade = ? AND active", Long.class, req.grade()));
        for (Marca m : req.marcas()) {
            if (!ESTADOS.contains(m.status())) throw invalido("Estado invalido: " + m.status());
            if (!delCurso.contains(m.studentId())) throw invalido("Estudiante fuera del curso");
        }
        for (Marca m : req.marcas()) {
            jdbc.update("""
                    INSERT INTO attendance_general (student_id, class_date, status, comment, recorded_by, recorded_at)
                    VALUES (?, ?, ?, ?, ?, now())
                    ON CONFLICT (student_id, class_date) DO UPDATE SET
                        status = EXCLUDED.status, comment = EXCLUDED.comment,
                        recorded_by = EXCLUDED.recorded_by, recorded_at = now()
                    """,
                    m.studentId(), req.date(), m.status(), m.comment(), JwtService.currentUserId());
        }
        return Map.of("guardadas", req.marcas().size());
    }
}
