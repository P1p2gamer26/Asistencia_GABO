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
}
