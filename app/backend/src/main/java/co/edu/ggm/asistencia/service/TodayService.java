package co.edu.ggm.asistencia.service;

import co.edu.ggm.asistencia.repository.ReportRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;

@Service
public class TodayService {

    public static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final ReportRepository repo;
    private final CalendarService calendar;

    public TodayService(ReportRepository repo, CalendarService calendar) {
        this.repo = repo; this.calendar = calendar;
    }

    public record ResumenDeHoy(boolean lectivo, LocalDate fecha,
                               int bloquesEsperados, int bloquesMarcados,
                               int presentes, int tarde, int ausentes, int evasiones,
                               int ingresos,
                               double mesAsistencia, int mesDiasLectivos) {}

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
        var porCurso = repo.byGrade(null, inicioMes, dia);
        int presentesMes = porCurso.stream().mapToInt(g -> g.getPresent() + g.getLate()).sum();
        int totalMes = porCurso.stream()
                .mapToInt(g -> g.getPresent() + g.getLate() + g.getAbsent() + g.getEvasion())
                .sum();
        double asistenciaMes = totalMes == 0 ? 0.0
                : Math.round(1000.0 * presentesMes / totalMes) / 10.0;

        return new ResumenDeHoy(lectivo, dia, esperados, marcados,
                c.getPresentes(), c.getTarde(), c.getAusentes(), c.getEvasiones(),
                repo.countEntries(dia), asistenciaMes, diasLectivosMes);
    }
}
