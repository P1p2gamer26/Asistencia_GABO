package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.service.JwtService;
import co.edu.ggm.asistencia.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class DashboardTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;

    private String tokenCoord() {
        var u = users.findByEmailAndActiveTrue("coord@ggm.edu.co").orElseThrow();
        return "Bearer " + jwt.issueAccess(u.getId(), "ADMIN");
    }

    @BeforeEach
    void datos() {
        jdbc.update("DELETE FROM attendance");
        // 3 presentes y 1 falta el mismo dia lectivo => 75 % de asistencia
        jdbc.update("""
            INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status, recorded_by, recorded_at)
            SELECT gen_random_uuid(), s.id, b.id, DATE '2026-07-13', x.estado, u.id, now()
            FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM students) s
            CROSS JOIN (SELECT id FROM schedule_blocks LIMIT 1) b
            CROSS JOIN users u
            JOIN (VALUES (1,'P'),(2,'P'),(3,'F')) AS x(n, estado) ON x.n = s.n
            WHERE u.email = 'coord@ggm.edu.co'
            """);
    }

    @Test
    void el_dashboard_calcula_la_tasa_de_asistencia_y_agrupa_por_curso() throws Exception {
        mvc.perform(get("/api/reports/dashboard")
                        .param("from", "2026-07-13").param("to", "2026-07-13")
                        .header("Authorization", tokenCoord()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.kpi.attendanceRate").value(66.7))
           .andExpect(jsonPath("$.kpi.schoolDays").value(1))
           .andExpect(jsonPath("$.byGrade.length()").value(2))
           .andExpect(jsonPath("$.trend.length()").value(1))
           .andExpect(jsonPath("$.trend[0].classDate").value("2026-07-13"));
    }

    @Test
    void un_docente_no_puede_ver_el_dashboard_del_colegio() throws Exception {
        mvc.perform(get("/api/reports/dashboard")
                        .param("from", "2026-07-13").param("to", "2026-07-13")
                        .header("Authorization", "Bearer " + jwt.issueAccess(1L, "DOCENTE")))
           .andExpect(status().isForbidden());
    }

    @Test
    void un_rango_sin_datos_devuelve_ceros_y_no_revienta() throws Exception {
        mvc.perform(get("/api/reports/dashboard")
                        .param("from", "2026-02-02").param("to", "2026-02-06")
                        .header("Authorization", tokenCoord()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.kpi.attendanceRate").value(0.0))
           .andExpect(jsonPath("$.byGrade.length()").value(0));
    }
}
