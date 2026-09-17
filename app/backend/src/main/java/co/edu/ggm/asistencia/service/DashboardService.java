package co.edu.ggm.asistencia.service;

import co.edu.ggm.asistencia.service.CalendarService;
import co.edu.ggm.asistencia.repository.ReportRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

@Service
public class DashboardService {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final ReportRepository repo;
    private final CalendarService calendar;

    public DashboardService(ReportRepository repo, CalendarService calendar) {
        this.repo = repo; this.calendar = calendar;
    }

    public record Kpi(double attendanceRate, int absentToday, int evasionsWeek,
                      int blocksPending, int schoolDays) {}
    public record GradeDto(String grade, int present, int late, int absent, int evasion) {}
    public record TrendDto(LocalDate classDate, double attendanceRate) {}
    public record Dashboard(Kpi kpi, List<GradeDto> byGrade, List<TrendDto> trend) {}

    public Dashboard build(String grade, LocalDate from, LocalDate to) {
        List<GradeDto> porCurso = repo.byGrade(grade, from, to).stream()
                .map(r -> new GradeDto(r.getGrade(), r.getPresent(), r.getLate(),
                        r.getAbsent(), r.getEvasion()))
                .toList();

        int presentes = porCurso.stream().mapToInt(g -> g.present() + g.late()).sum();
        int total = porCurso.stream()
                .mapToInt(g -> g.present() + g.late() + g.absent() + g.evasion()).sum();
        double tasa = total == 0 ? 0.0 : Math.round(1000.0 * presentes / total) / 10.0;

        LocalDate hoy = LocalDate.now(BOGOTA);
        // Si hoy no es lectivo, no hay bloques "pendientes" que reclamar.
        int pendientes = calendar.isSchoolDay(hoy)
                ? repo.countBlocksPending(calendar.cycleDay(hoy), hoy)
                : 0;

        var kpi = new Kpi(tasa,
                repo.countAbsentOn(hoy),
                repo.countEvasions(hoy.minusDays(6), hoy),
                pendientes,
                repo.countSchoolDays(from, to));

        List<TrendDto> tendencia = repo.trend(grade, from, to).stream()
                .map(r -> new TrendDto(r.getClassDate(), r.getAttendanceRate()))
                .toList();

        return new Dashboard(kpi, porCurso, tendencia);
    }
}
