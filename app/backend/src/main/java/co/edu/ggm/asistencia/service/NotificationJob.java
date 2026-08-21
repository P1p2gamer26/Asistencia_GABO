package co.edu.ggm.asistencia.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class NotificationJob {

    private static final Logger log = LoggerFactory.getLogger(NotificationJob.class);

    private final NotificationService service;

    public NotificationJob(NotificationService service) { this.service = service; }

    @Scheduled(cron = "0 */15 * * * *", zone = "America/Bogota")
    public void ejecutar() {
        int encolados = service.enqueuePending();
        int enviados = service.dispatchPending();
        if (encolados + enviados > 0) {
            log.info("Notificaciones: {} encoladas, {} enviadas", encolados, enviados);
        }
    }
}
