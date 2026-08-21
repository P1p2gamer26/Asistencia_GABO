package co.edu.ggm.asistencia;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * Base de todos los tests de integracion. Usa el PostgreSQL local indicado por
 * TEST_DB_URL (por defecto asistencia_test) y parte siempre de una base limpia.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestDatabaseConfig.class)
public abstract class AbstractIntegrationTest {

    @org.springframework.beans.factory.annotation.Autowired
    protected co.edu.ggm.asistencia.service.JwtService jwt;

    @org.springframework.beans.factory.annotation.Autowired
    protected org.springframework.jdbc.core.JdbcTemplate jdbcBase;

    /** Token de acceso para el usuario con ese correo, con el rol indicado. */
    protected String tokenDe(String email, String rol) {
        Long id = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, email);
        return "Bearer " + jwt.issueAccess(id, rol);
    }
}
