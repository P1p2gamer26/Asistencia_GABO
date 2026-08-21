package co.edu.ggm.asistencia.entry.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "entry_log")
@Getter
@Setter
public class EntryLog {
    @Id private UUID id;
    @Column(name = "student_id")  private Long studentId;
    @Column(name = "entry_date")  private LocalDate entryDate;
    @Column(name = "scanned_at")  private Instant scannedAt;
    @Column(name = "recorded_by") private Long recordedBy;
}
