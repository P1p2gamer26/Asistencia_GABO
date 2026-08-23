package co.edu.ggm.asistencia.service;

import co.edu.ggm.asistencia.repository.ReportRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;

@Service
public class TodayService {

    public static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final ReportRepository repo;
    private final CalendarService calendar;

    public TodayService(ReportRepository repo, CalendarService calendar) {
        this.repo = repo; this.calendar = calendar;
    }

    /** sinRegistros: ningun registro de asistencia en el mes para este curso.
     * No es lo mismo que 100% de asistencia -- un curso donde nadie paso lista
     * no puede aparecer como si fuera el mejor del colegio. */
    public record CursoMes(String grade, int present, int late, int absent, int evasion,
                           double attendanceRate, boolean sinRegistros) {}

    public record ResumenDeHoy(boolean lectivo, LocalDate fecha,
                               int bloquesEsperados, int bloquesMarcados,
                               int presentes, int tarde, int ausentes, int evasiones,
                               int ingresos,
                               double mesAsistencia, int mesDiasLectivos,
                               int mesPresentes, int mesTarde, int mesAusentes, int mesEvasiones,
                               List<CursoMes> mesPorCurso) {}

    public ResumenDeHoy resumen(LocalDate dia) {
        boolean lectivo = calendar.isSchoolDay(dia);
        int weekday = dia.getDayOfWeek().getValue();

        // Un dia no lectivo no espera ningun bloque: decir "0 de 36" un domingo seria
        // dar una alarma falsa todos los fines de semana.
        int esperados = lectivo ? repo.countBlocksOfWeekday(weekday) : 0;
        int marcados = lectivo ? repo.countBlocksReported(weekday, dia) : 0;

        var c = repo.countsOfDay(dia);

        LocalDate inicioMes = dia.withDayOfMonth(1);
        int diasLectivosMes = repo.countSchoolDays(inicioMes, dia);
        var porCurso = repo.cursosDelPeriodo(inicioMes, dia);
        int presentesMes = porCurso.stream().mapToInt(g -> g.getPresent() + g.getLate()).sum();
        int tardeMes = porCurso.stream().mapToInt(ReportRepository.CursoPeriodoRow::getLate).sum();
        int ausentesMes = porCurso.stream().mapToInt(ReportRepository.CursoPeriodoRow::getAbsent).sum();
        int evasionesMes = porCurso.stream().mapToInt(ReportRepository.CursoPeriodoRow::getEvasion).sum();
        int totalMes = porCurso.stream()
                .mapToInt(g -> g.getPresent() + g.getLate() + g.getAbsent() + g.getEvasion())
                .sum();
        double asistenciaMes = totalMes == 0 ? 0.0
                : Math.round(1000.0 * presentesMes / totalMes) / 10.0;

        List<CursoMes> mesPorCurso = porCurso.stream()
                .map(g -> {
                    int total = g.getPresent() + g.getLate() + g.getAbsent() + g.getEvasion();
                    boolean sinRegistros = total == 0;
                    double tasa = sinRegistros ? 0.0
                            : Math.round(1000.0 * (g.getPresent() + g.getLate()) / total) / 10.0;
                    return new CursoMes(g.getGrade(), g.getPresent(), g.getLate(),
                            g.getAbsent(), g.getEvasion(), tasa, sinRegistros);
                })
                // peor a mejor primero; los que no tienen ni un registro van al final,
                // nunca arriba como si fueran el curso ejemplar del mes.
                .sorted(Comparator
                        .comparing(CursoMes::sinRegistros)
                        .thenComparing(CursoMes::attendanceRate))
                .toList();

        return new ResumenDeHoy(lectivo, dia, esperados, marcados,
                c.getPresentes(), c.getTarde(), c.getAusentes(), c.getEvasiones(),
                repo.countEntries(dia), asistenciaMes, diasLectivosMes,
                presentesMes, tardeMes, ausentesMes, evasionesMes, mesPorCurso);
    }
}
