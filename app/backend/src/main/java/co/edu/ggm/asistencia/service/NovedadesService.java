package co.edu.ggm.asistencia.service;

import co.edu.ggm.asistencia.repository.ReportRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

@Service
public class NovedadesService {

    private final ReportRepository repo;

    public NovedadesService(ReportRepository repo) {
        this.repo = repo;
    }

    public record Novedad(Long studentId, String fullName, String grade, LocalDate classDate,
                          String subject, String comment) {}

    /** sinRegistros distingue "nadie tomo asistencia en el periodo" (verdad
     * incomoda) de "se tomo asistencia y no hubo evasiones ni ausencias"
     * (buena noticia): reportar 0 en ambos casos con el mismo texto le
     * mentiria al rector cuando en realidad nadie paso lista. */
    public record Reporte(List<Novedad> evasiones, List<Novedad> ausencias, boolean sinRegistros) {}

    public Reporte build(LocalDate from, LocalDate to, int limite) {
        List<Novedad> evasiones = repo.novedadesPorEstado("E", from, to, limite).stream()
                .map(NovedadesService::toDto).toList();
        List<Novedad> ausencias = repo.novedadesPorEstado("F", from, to, limite).stream()
                .map(NovedadesService::toDto).toList();
        boolean sinRegistros = repo.countAttendanceRecords(from, to) == 0;
        return new Reporte(evasiones, ausencias, sinRegistros);
    }

    private static Novedad toDto(ReportRepository.NovedadRow r) {
        return new Novedad(r.getStudentId(), r.getFullName(), r.getGrade(), r.getClassDate(),
                r.getSubject(), r.getComment());
    }
}
