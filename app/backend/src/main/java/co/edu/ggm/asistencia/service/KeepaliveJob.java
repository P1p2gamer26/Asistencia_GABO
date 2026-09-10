package co.edu.ggm.asistencia.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Mantiene viva la base contra el pause de Supabase Free (se pausa tras ~7 dias sin
 * consultas): una consulta cada 6 horas cuenta como actividad. En un host que no se
 * duerme (VM Always Free) es la capa que nunca falla; el trafico real y el ping
 * externo de health/db son capas extra.
 */
@Component
public class KeepaliveJob {

    private static final Logger log = LoggerFactory.getLogger(KeepaliveJob.class);
    private static final String CHECK_DB = "SELECT 1";

    private final JdbcTemplate jdbc;

    public KeepaliveJob(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Scheduled(cron = "${app.keepalive.cron:0 0 */6 * * *}", zone = "America/Bogota")
    public void mantenerVivaLaBase() {
        try {
            jdbc.queryForObject(CHECK_DB, Integer.class);
        } catch (Exception e) {
            log.error("Keepalive: no se pudo consultar la base", e);
        }
    }
}