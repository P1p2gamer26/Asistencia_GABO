package co.edu.ggm.asistencia.notify.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "notifications")
@Getter
@Setter
public class Notification {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "attendance_id") private UUID attendanceId;
    private String kind;
    private String recipient;
    private String subject;
    private String body;
    @Column(name = "sent_at") private Instant sentAt;
    private String error;
}
