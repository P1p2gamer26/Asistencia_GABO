package co.edu.ggm.asistencia.attendance.model;

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
}
