package co.edu.ggm.asistencia.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.Instant;
import java.time.LocalTime;

@Entity
@Table(name = "schedule_blocks")
@Getter
@Setter
public class ScheduleBlock {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String grade;
    private short weekday;

    @Column(name = "block_no")
    private short blockNo;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "subject_id")
    private Subject subject;

    @Column(name = "teacher_id")
    private Long teacherId;

    private String room;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_by")
    private Long updatedBy;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
