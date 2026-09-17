package co.edu.ggm.asistencia.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "school_calendar")
@Getter
@Setter
public class SchoolDay {
    @Id
    @Column(name = "calendar_date")
    private LocalDate calendarDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "day_type")
    private DayType dayType;

    private String description;

    /** Ancla manual del dia de ciclo; null = conteo automatico. */
    @Column(name = "cycle_day_fixed") private Short cycleDayFixed;

    @Column(name = "updated_by") private Long updatedBy;
    @Column(name = "updated_at") private Instant updatedAt;
}
