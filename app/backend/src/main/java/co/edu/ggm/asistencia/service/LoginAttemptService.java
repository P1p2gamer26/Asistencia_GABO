package co.edu.ggm.asistencia.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limita los intentos de acceso fallidos por correo.
 *
 * Se cuenta por correo y no por direccion IP a proposito: el colegio sale a internet
 * por una sola conexion, asi que bloquear por IP dejaria fuera a todo el mundo en
 * cuanto un docente se equivocara cinco veces.
 *
 * ponytail: contador en memoria. Si algun dia hay varias instancias del backend, cada
 * una contara por su cuenta y el limite efectivo se multiplica: entonces habria que
 * moverlo a la base o a una cache compartida.
 */
@Service
public class LoginAttemptService {

    private static final int MAXIMO = 5;
    private static final Duration BLOQUEO = Duration.ofMinutes(15);

    private record Intentos(int fallos, Instant ultimo) {}

    private final ConcurrentHashMap<String, Intentos> porCorreo = new ConcurrentHashMap<>();

    /** Lanza 429 si el correo esta bloqueado. Se llama ANTES de comprobar la clave. */
    public void check(String email) {
        Intentos i = porCorreo.get(clave(email));
        if (i == null || i.fallos() < MAXIMO) return;

        if (Duration.between(i.ultimo(), Instant.now()).compareTo(BLOQUEO) < 0) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Demasiados intentos fallidos. Intente de nuevo en unos minutos.");
        }
        porCorreo.remove(clave(email));   // ya paso el bloqueo
    }

    public void fail(String email) {
        porCorreo.merge(clave(email), new Intentos(1, Instant.now()),
                (viejo, nuevo) -> new Intentos(viejo.fallos() + 1, nuevo.ultimo()));
    }

    public void success(String email) {
        porCorreo.remove(clave(email));
    }

    private static String clave(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }
}
