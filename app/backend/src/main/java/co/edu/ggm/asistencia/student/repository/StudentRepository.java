package co.edu.ggm.asistencia.student.repository;

import co.edu.ggm.asistencia.student.model.Student;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface StudentRepository extends JpaRepository<Student, Long> {
    List<Student> findByActiveTrueAndGradeInOrderByLastNameAscFirstNameAsc(Collection<String> grades);
    List<Student> findByActiveTrueAndGradeOrderByLastNameAscFirstNameAsc(String grade);
    Optional<Student> findByDocumentIdAndActiveTrue(String documentId);
}
