package co.edu.ggm.asistencia.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "attendance")
@Getter
@Setter
public class Attendance {
    @Id
    private UUID id;

    @Column(name = "student_id")        private Long studentId;
    @Column(name = "schedule_block_id") private Long scheduleBlockId;
    @Column(name = "class_date")        private LocalDate classDate;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(length = 1)
    private String status;
    private String comment;

    @Column(name = "recorded_by") private Long recordedBy;
    @Column(name = "recorded_at") private Instant recordedAt;
    @Column(name = "synced_at")   private Instant syncedAt;

    @Column(name = "edited_by") private Long editedBy;
    @Column(name = "edited_at") private Instant editedAt;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "previous_status", length = 1)
    private String previousStatus;

    @Column(name = "deleted_by") private Long deletedBy;
    @Column(name = "deleted_at") private Instant deletedAt;
}
