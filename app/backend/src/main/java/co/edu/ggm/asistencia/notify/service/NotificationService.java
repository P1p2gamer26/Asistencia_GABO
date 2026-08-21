package co.edu.ggm.asistencia.notify.service;

import co.edu.ggm.asistencia.notify.model.Notification;
import co.edu.ggm.asistencia.notify.repository.NotificationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository repo;
    private final JavaMailSender mailer;
    private final String coordination;
    private final String from;
    private final boolean enabled;

    public NotificationService(NotificationRepository repo, JavaMailSender mailer,
                               @Value("${app.notify.coordination}") String coordination,
                               @Value("${app.notify.from}") String from,
                               @Value("${app.notify.enabled}") boolean enabled) {
        this.repo = repo; this.mailer = mailer;
        this.coordination = coordination; this.from = from; this.enabled = enabled;
    }

    @Transactional
    public int enqueuePending() {
        return repo.enqueueEvasion(coordination) + repo.enqueueAusencias();
    }

    @Transactional
    public int dispatchPending() {
        if (!enabled) return 0;
        int enviados = 0;
        for (Notification n : repo.findTop200BySentAtIsNullAndErrorIsNullOrderByIdAsc()) {
            try {
                var msg = new SimpleMailMessage();
                msg.setFrom(from);
                msg.setTo(n.getRecipient());
                msg.setSubject(n.getSubject());
                msg.setText(n.getBody());
                mailer.send(msg);
                n.setSentAt(Instant.now());
                enviados++;
            } catch (MailException e) {
                // Se guarda el motivo y se deja de reintentar: un correo mal escrito
                // reintentado en bucle bloquea la cola entera.
                String motivo = String.valueOf(e.getMessage());
                log.warn("Fallo el envio de la notificacion {}: {}", n.getId(), motivo);
                n.setError(motivo.substring(0, Math.min(300, motivo.length())));
            }
            repo.save(n);
        }
        return enviados;
    }
}
