package co.edu.ggm.asistencia.model;

import jakarta.persistence.*;
import lombok.Getter;

@Entity
@Table(name = "students")
@Getter
public class Student {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "document_id")
    private String documentId;

    @Column(name = "first_name")  private String firstName;
    @Column(name = "middle_name") private String middleName;
    @Column(name = "last_name")   private String lastName;
    @Column(name = "second_surname") private String secondSurname;

    private String grade;
    private String eps;
    private String address;
    private String phone;
    private boolean active;

    /** Nombre completo sin espacios dobles cuando faltan segundo nombre o segundo apellido. */
    public String fullName() {
        return String.join(" ", java.util.stream.Stream.of(firstName, middleName, lastName, secondSurname)
                .filter(s -> s != null && !s.isBlank()).toList());
    }
}
