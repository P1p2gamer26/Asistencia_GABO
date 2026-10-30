package co.edu.ggm.asistencia.service;

import co.edu.ggm.asistencia.model.Role;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

/** Quien puede tomar lista de un curso y que cursos tiene asignados cada usuario. */
@Service
public class AccesoCursoService {

    private final JdbcTemplate jdbc;

    public AccesoCursoService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<String> asignados(Long userId) {
        return jdbc.queryForList(
                "SELECT grade FROM teacher_course_assignments WHERE user_id = ? ORDER BY grade",
                String.class, userId);
    }

    public boolean tieneBloques(Long userId) {
        return jdbc.queryForObject("SELECT count(*) FROM schedule_blocks WHERE teacher_id = ?",
                Long.class, userId) > 0;
    }

    /** DOCENTE sin horario ni asignaciones: puede tomar lista de cualquier curso. */
    public boolean sinRestriccion(Long userId) {
        return !tieneBloques(userId) && asignados(userId).isEmpty();
    }

    public boolean puedeTomarLista(Long userId, Role rol, String grade) {
        if (rol == Role.ADMIN || rol == Role.ORIENTADOR) return true;
        if (rol != Role.DOCENTE) return false;
        Long n = jdbc.queryForObject("""
                SELECT (SELECT count(*) FROM schedule_blocks WHERE teacher_id = ? AND grade = ?)
                     + (SELECT count(*) FROM teacher_course_assignments WHERE user_id = ? AND grade = ?)
                """, Long.class, userId, grade, userId, grade);
        return n > 0 || sinRestriccion(userId);
    }

    public boolean puedeTomarLista(Long userId, String grade) {
        String rol = jdbc.queryForList("SELECT role FROM users WHERE id = ?", String.class, userId)
                .stream().findFirst().orElse(null);
        return rol != null && puedeTomarLista(userId, Role.valueOf(rol), grade);
    }

    /** Reemplaza el conjunto completo de cursos asignados; solo DOCENTE u ORIENTADOR. */
    @org.springframework.transaction.annotation.Transactional
    public List<String> reemplazar(Long userId, List<String> grados) {
        String rol = jdbc.queryForList("SELECT role FROM users WHERE id = ?", String.class, userId)
                .stream().findFirst().orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND, "Usuario inexistente"));
        if (!rol.equals("DOCENTE") && !rol.equals("ORIENTADOR")) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Solo docentes u orientadores tienen cursos asignados");
        }
        List<String> limpios = grados.stream().map(g -> g == null ? "" : g.trim()).distinct().toList();
        for (String g : limpios) {
            Long existe = jdbc.queryForObject("""
                    SELECT (SELECT count(*) FROM students WHERE grade = ?)
                         + (SELECT count(*) FROM schedule_blocks WHERE grade = ?)""", Long.class, g, g);
            if (g.isEmpty() || existe == 0) {
                throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST, "Curso inexistente: " + g);
            }
        }
        jdbc.update("DELETE FROM teacher_course_assignments WHERE user_id = ?", userId);
        for (String g : limpios) {
            jdbc.update("INSERT INTO teacher_course_assignments (user_id, grade) VALUES (?, ?)", userId, g);
        }
        return asignados(userId);
    }
}
