package co.edu.ggm.asistencia;

import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

/**
 * Limpia y vuelve a migrar la base de test al arrancar el contexto.
 * Sin esto, los datos de una corrida contaminan la siguiente y un test que inserta
 * falla en el segundo `mvn test` sin que nadie haya tocado el codigo.
 */
@TestConfiguration
public class TestDatabaseConfig {

    @Bean
    FlywayMigrationStrategy limpiarYMigrar() {
        return flyway -> {
            flyway.clean();
            flyway.migrate();
        };
    }
}
