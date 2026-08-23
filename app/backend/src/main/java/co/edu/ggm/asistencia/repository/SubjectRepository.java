package co.edu.ggm.asistencia.repository;

import co.edu.ggm.asistencia.model.Subject;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SubjectRepository extends JpaRepository<Subject, Long> {
}
