package co.edu.ggm.asistencia;

import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Limpia y vuelve a migrar la base de test al arrancar el contexto.
 * Sin esto, los datos de una corrida contaminan la siguiente y un test que inserta
 * falla en el segundo `mvn test` sin que nadie haya tocado el codigo.
 *
 * OJO: Spring reutiliza el ApplicationContext entre clases con la misma
 * configuracion, pero no todas la tienen identica (por ejemplo, solo algunas
 * llevan @AutoConfigureMockMvc), asi que en la suite completa se construyen
 * VARIOS contextos, cada uno disparando este FlywayMigrationStrategy. Medido:
 * en una corrida de `mvn test` con 148 tests se crean 2 contextos distintos y
 * cada `flyway.clean()` limpia la base A MITAD DE LA SUITE, borrando los datos
 * que las clases ya ejecutadas habian sembrado. Que clase queda con la base
 * vacia depende del orden de ejecucion: eso es lo que causaba fallos
 * intermitentes como "no existe la relacion users" o HoyTest fallando solo con
 * -Dsurefire.runOrder=reversealphabetical.
 *
 * El guardia estatico de abajo asegura que clean() corra UNA sola vez por JVM
 * (la primera vez que se construye un contexto), sin importar cuantos
 * contextos distintos arme Spring durante la suite. migrate() si puede correr
 * en cada contexto: es idempotente. NO QUITAR este guardia sin entender que
 * su ausencia reintroduce el problema de arriba.
 */
@TestConfiguration
public class TestDatabaseConfig {

    private static final AtomicBoolean YA_LIMPIADA = new AtomicBoolean(false);

    @Bean
    FlywayMigrationStrategy limpiarYMigrar() {
        return flyway -> {
            if (YA_LIMPIADA.compareAndSet(false, true)) {
                flyway.clean();
            }
            flyway.migrate();
        };
    }
}
