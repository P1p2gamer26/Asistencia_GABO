package co.edu.ggm.asistencia.service;

import co.edu.ggm.asistencia.model.DayType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;

/**
 * Recordatorios a docentes para tomar lista. Cada minuto, en jornada, mira los bloques de hoy:
 * - ANTES: entre 15 y 5 minutos antes de empezar el bloque.
 * - SIN_TOMA: 15 minutos o mas despues de empezar, si ese bloque aun no tiene asistencia.
 * La tabla reminder_log garantiza un solo aviso por docente, bloque, dia y tipo.
 */
@Component
public class RecordatorioJob {

    private static final Logger log = LoggerFactory.getLogger(RecordatorioJob.class);
    static final ZoneId ZONA = ZoneId.of("America/Bogota");
    static final LocalTime INICIO_JORNADA = LocalTime.of(6, 0);
    static final LocalTime FIN_JORNADA = LocalTime.of(14, 0);

    private final JdbcTemplate jdbc;
    private final CalendarService calendario;
    private final PushService push;

    public RecordatorioJob(JdbcTemplate jdbc, CalendarService calendario, PushService push) {
        this.jdbc = jdbc;
        this.calendario = calendario;
        this.push = push;
    }

    /** Tipo de aviso que corresponde a esta hora para un bloque, o null si no toca ninguno. */
    static String ventana(LocalTime ahora, LocalTime inicio, LocalTime fin) {
        long m = ahora.toSecondOfDay() / 60 - inicio.toSecondOfDay() / 60; // minutos desde el inicio
        if (m >= -15 && m < -5) return "ANTES";
        if (m >= 15 && ahora.isBefore(fin)) return "SIN_TOMA";
        return null;
    }

    record Bloque(long id, long teacherId, String grade, int blockNo, LocalTime inicio, LocalTime fin, String materia) {}

    @Scheduled(cron = "0 * * * * *", zone = "America/Bogota")
    public void ejecutar() {
        if (!push.activo()) return;
        int enviados = procesar(LocalDateTime.now(ZONA));
        if (enviados > 0) log.info("Recordatorios de toma de lista enviados: {}", enviados);
    }

    /** Revisa los bloques de hoy a la hora dada. Devuelve cuantos avisos se enviaron. */
    int procesar(LocalDateTime ahora) {
        LocalTime hora = ahora.toLocalTime();
        if (hora.isBefore(INICIO_JORNADA) || !hora.isBefore(FIN_JORNADA)) return 0;
        LocalDate hoy = ahora.toLocalDate();
        var dias = calendario.range(hoy, hoy);
        if (dias.isEmpty()) return 0;
        var dia = dias.get(0);
        // Solo dias lectivos con ciclo: Dia 0 no tiene bloques que avisar.
        if (dia.getDayType() != DayType.LECTIVO || dia.getCycleDay() == null) return 0;

        var bloques = jdbc.query("""
                SELECT sb.id, sb.teacher_id, sb.grade, sb.block_no, sb.start_time, sb.end_time, su.name
                FROM schedule_blocks sb JOIN subjects su ON su.id = sb.subject_id
                WHERE sb.weekday = ?
                """,
                (rs, i) -> new Bloque(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getInt(4),
                        rs.getTime(5).toLocalTime(), rs.getTime(6).toLocalTime(), rs.getString(7)),
                dia.getCycleDay());

        int enviados = 0;
        for (Bloque b : bloques) {
            String tipo = ventana(hora, b.inicio(), b.fin());
            if (tipo == null) continue;
            if ("SIN_TOMA".equals(tipo) && tomado(b.id(), hoy)) continue;
            int nuevo = jdbc.update("""
                    INSERT INTO reminder_log (teacher_id, schedule_block_id, class_date, tipo)
                    VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING
                    """, b.teacherId(), b.id(), hoy, tipo);
            if (nuevo == 0) continue; // ya se aviso antes
            String titulo = "ANTES".equals(tipo) ? "Tu clase empieza pronto" : "Falta la toma de lista";
            String cuerpo = "ANTES".equals(tipo)
                    ? "En 15 minutos tienes " + b.materia() + " con " + b.grade() + " (bloque " + b.blockNo() + ")."
                    : "Aun no has tomado lista de " + b.grade() + " (bloque " + b.blockNo() + ").";
            enviados += push.enviar(b.teacherId(), titulo, cuerpo);
        }
        return enviados;
    }

    private boolean tomado(long bloqueId, LocalDate fecha) {
        Boolean existe = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM attendance WHERE schedule_block_id = ? AND class_date = ?)",
                Boolean.class, bloqueId, fecha);
        return Boolean.TRUE.equals(existe);
    }
}
