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
        // Evasiones se dejan por evento (una fila de attendance = una fila aqui):
        // una evasion es un hecho puntual de una clase concreta, y que el mismo
        // estudiante aparezca dos veces por evadir dos clases distintas el mismo
        // dia es informacion real -- no es el mismo defecto que las ausencias,
        // donde una fila por bloque es una sola falta repetida N veces.
        List<Novedad> evasiones = repo.novedadesPorEstado("E", from, to, limite).stream()
                .map(NovedadesService::toDto).toList();
        List<Novedad> ausencias = repo.ausenciasAgrupadas(from, to, limite).stream()
                .map(NovedadesService::toAusenciaDto).toList();
        boolean sinRegistros = repo.countAttendanceRecords(from, to) == 0;
        return new Reporte(evasiones, ausencias, sinRegistros);
    }

    private static Novedad toDto(ReportRepository.NovedadRow r) {
        return new Novedad(r.getStudentId(), r.getFullName(), r.getGrade(), r.getClassDate(),
                r.getSubject(), r.getComment());
    }

    private static Novedad toAusenciaDto(ReportRepository.AusenciaAgrupadaRow r) {
        // Sin una sola materia que mostrar (la ausencia cubre varios bloques),
        // se informa la cobertura: dia completo, o cuantos de cuantos bloques.
        String cobertura = r.getFaltados() >= r.getTotalBloques() && r.getTotalBloques() > 0
                ? "Falto el dia completo"
                : "%d de %d clases".formatted(r.getFaltados(), r.getTotalBloques());
        return new Novedad(r.getStudentId(), r.getFullName(), r.getGrade(), r.getClassDate(),
                null, cobertura);
    }
}
