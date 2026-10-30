package co.edu.ggm.asistencia.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "users")
@Getter
@Setter
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String email;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "full_name")
    private String fullName;

    @Column(name = "last_name")
    private String lastName;

    @Column(name = "second_surname")
    private String secondSurname;

    @Column(name = "first_names")
    private String firstNames;

    @Enumerated(EnumType.STRING)
    private Role role;

    private boolean active;

    @Column(name = "must_change_password")
    private boolean mustChangePassword;
}
