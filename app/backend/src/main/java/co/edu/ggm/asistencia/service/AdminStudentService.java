package co.edu.ggm.asistencia.service;

import co.edu.ggm.asistencia.model.Student;
import co.edu.ggm.asistencia.repository.StudentRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class AdminStudentService {

    private final StudentRepository students;
    private final JdbcTemplate jdbc;

    public AdminStudentService(StudentRepository students, JdbcTemplate jdbc) {
        this.students = students; this.jdbc = jdbc;
    }

    public List<Student> list(String grade, String query) {
        List<Student> base = (grade == null || grade.isBlank())
                ? students.findAllByOrderByGradeAscLastNameAscFirstNameAsc()
                : students.findByGradeOrderByLastNameAscFirstNameAsc(grade.trim());
        if (query == null || query.isBlank()) return base;
        String q = query.trim().toLowerCase();
        return base.stream()
                .filter(s -> s.fullName().toLowerCase().contains(q)
                          || s.getDocumentId().toLowerCase().contains(q))
                .toList();
    }

    @Transactional
    public Student create(String documentId, String firstName, String middleName,
                          String lastName, String secondSurname, String grade) {
        String documento = documentId.trim();
        if (students.existsByDocumentId(documento)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Ya hay un estudiante con ese documento");
        }
        Student s = new Student();
        s.setDocumentId(documento);
        s.setFirstName(firstName.trim());
        s.setMiddleName(vacioANulo(middleName));
        s.setLastName(lastName.trim());
        s.setSecondSurname(vacioANulo(secondSurname));
        s.setGrade(grade.trim());
        s.setActive(true);
        return students.save(s);
    }

    @Transactional
    public Student update(Long id, String firstName, String middleName, String lastName,
                          String secondSurname, String grade, boolean active) {
        Student s = students.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No existe ese estudiante"));
        s.setFirstName(firstName.trim());
        s.setMiddleName(vacioANulo(middleName));
        s.setLastName(lastName.trim());
        s.setSecondSurname(vacioANulo(secondSurname));
        s.setGrade(grade.trim());
        s.setActive(active);
        return students.save(s);
    }

    /**
     * Da de baja al estudiante y dice si desaparecio de verdad.
     *
     * Con asistencia o ingresos ya registrados NO se borra: se desactiva. Borrarlo se
     * llevaria por delante el historial del colegio, que es lo unico que este sistema
     * existe para conservar. Sin historial si se borra: un estudiante creado por error
     * hace un minuto no tiene por que quedarse de por vida en la lista de inactivos.
     *
     * @return true si la fila desaparecio de la base.
     */
    @Transactional
    public boolean delete(Long id) {
        Student s = students.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No existe ese estudiante"));

        Integer historial = jdbc.queryForObject("""
                SELECT (SELECT count(*) FROM attendance WHERE student_id = ?)
                     + (SELECT count(*) FROM entry_log  WHERE student_id = ?)
                """, Integer.class, id, id);

        if (historial != null && historial > 0) {
            s.setActive(false);
            students.save(s);
            return false;
        }
        // Los acudientes cuelgan del estudiante y no son historial: se van con el.
        jdbc.update("DELETE FROM guardianships WHERE student_id = ?", id);
        students.delete(s);
        return true;
    }

    private static String vacioANulo(String v) {
        return (v == null || v.isBlank()) ? null : v.trim();
    }
}
