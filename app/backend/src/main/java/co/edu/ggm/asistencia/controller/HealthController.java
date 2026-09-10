package co.edu.ggm.asistencia.controller;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Sonda publica para monitores externos (uptime, GitHub Actions, tareas locales):
 * responde 200 solo si la app esta viva Y la base responde una consulta. No
 * expone nada sensible: es un SELECT 1.
 */
@RestController
public class HealthController {

    private final JdbcTemplate jdbc;

    public HealthController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping("/api/health/db")
    public Map<String, String> db() {
        jdbc.queryForObject("SELECT 1", Integer.class);
        return Map.of("status", "UP", "db", "UP");
    }
}