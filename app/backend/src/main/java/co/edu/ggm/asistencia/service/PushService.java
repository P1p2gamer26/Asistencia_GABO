package co.edu.ggm.asistencia.service;

import org.apache.http.HttpResponse;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.security.Security;
import java.util.List;

/** Suscripciones push de los docentes y envio de avisos. Sin claves VAPID no hace nada. */
@Service
public class PushService {

    private static final Logger log = LoggerFactory.getLogger(PushService.class);

    private final JdbcTemplate jdbc;
    private final String publica;
    private final String privada;
    private final String subject;

    public PushService(JdbcTemplate jdbc,
                       @Value("${app.push.vapid-public:}") String publica,
                       @Value("${app.push.vapid-private:}") String privada,
                       @Value("${app.push.subject:mailto:coordinacion@ggm.edu.co}") String subject) {
        this.jdbc = jdbc;
        this.publica = publica;
        this.privada = privada;
        this.subject = subject;
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.addProvider(new BouncyCastleProvider());
        }
    }

    public boolean activo() {
        return publica != null && !publica.isBlank() && privada != null && !privada.isBlank();
    }

    public String clavePublica() {
        return publica;
    }

    public void guardar(long userId, String endpoint, String p256dh, String auth) {
        jdbc.update("""
                INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
                ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id,
                    p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
                """, userId, endpoint, p256dh, auth);
    }

    public void borrar(long userId, String endpoint) {
        jdbc.update("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", userId, endpoint);
    }

    private record Sub(String endpoint, String p256dh, String auth) {}

    /** Envia el aviso a todos los dispositivos del docente. Devuelve cuantos recibieron el envio. */
    public int enviar(long userId, String titulo, String cuerpo) {
        if (!activo()) return 0;
        List<Sub> subs = jdbc.query(
                "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
                (rs, i) -> new Sub(rs.getString("endpoint"), rs.getString("p256dh"), rs.getString("auth")),
                userId);
        String payload = "{\"title\":" + json(titulo) + ",\"body\":" + json(cuerpo) + ",\"url\":\"/\"}";
        int ok = 0;
        for (Sub s : subs) {
            try {
                var lib = new nl.martijndwars.webpush.PushService(publica, privada, subject);
                var notif = new nl.martijndwars.webpush.Notification(s.endpoint(), s.p256dh(), s.auth(), payload);
                HttpResponse resp = lib.send(notif);
                int code = resp.getStatusLine().getStatusCode();
                if (code == 404 || code == 410) {
                    // El navegador borro la suscripcion: no tiene sentido volver a intentarla.
                    jdbc.update("DELETE FROM push_subscriptions WHERE endpoint = ?", s.endpoint());
                } else if (code < 300) {
                    ok++;
                } else {
                    log.warn("Push rechazado por el servicio del navegador: HTTP {}", code);
                }
            } catch (Exception e) {
                log.warn("No se pudo enviar el aviso push: {}", e.getMessage());
            }
        }
        return ok;
    }

    private static String json(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}
