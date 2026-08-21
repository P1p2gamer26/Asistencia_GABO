package co.edu.ggm.asistencia;

import org.junit.jupiter.api.Test;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Autowired;
import static org.assertj.core.api.Assertions.assertThat;

class SmokeTest extends AbstractIntegrationTest {

    @Autowired DataSource dataSource;

    @Test
    void el_contexto_arranca_contra_postgres_real() throws Exception {
        try (var conn = dataSource.getConnection()) {
            assertThat(conn.getMetaData().getDatabaseProductName()).isEqualTo("PostgreSQL");
        }
    }
}
