package co.edu.ggm.asistencia.model;

import jakarta.persistence.*;
import lombok.Getter;

@Entity
@Table(name = "subjects")
@Getter
public class Subject {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;
}
