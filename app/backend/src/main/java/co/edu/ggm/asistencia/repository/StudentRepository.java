package co.edu.ggm.asistencia.repository;

import co.edu.ggm.asistencia.model.Student;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface StudentRepository extends JpaRepository<Student, Long> {
    List<Student> findByActiveTrueAndGradeInOrderByLastNameAscFirstNameAsc(Collection<String> grades);
    List<Student> findByActiveTrueAndGradeOrderByLastNameAscFirstNameAsc(String grade);
    Optional<Student> findByDocumentIdAndActiveTrue(String documentId);

    interface ChildRow {
        Long getStudentId();
        String getFullName();
        String getGrade();
    }

    @Query(value = """
            SELECT s.id AS studentId,
                   trim(regexp_replace(concat_ws(' ', s.first_name, s.middle_name,
                        s.last_name, s.second_surname), '\\s+', ' ', 'g')) AS fullName,
                   s.grade AS grade
            FROM students s
            JOIN guardianships g ON g.student_id = s.id
            WHERE g.guardian_id = :guardianId AND s.active
            ORDER BY s.first_name
            """, nativeQuery = true)
    List<ChildRow> findChildren(@Param("guardianId") Long guardianId);

    interface RecentMark {
        java.time.LocalDate getClassDate();
        String getSubject();
        String getStatus();
        String getComment();
    }

    @Query(value = """
            SELECT a.class_date AS classDate, sub.name AS subject, a.status AS status, a.comment AS comment
            FROM attendance a
            JOIN schedule_blocks b ON b.id = a.schedule_block_id
            JOIN subjects sub ON sub.id = b.subject_id
            WHERE a.student_id = :studentId AND a.class_date BETWEEN :from AND :to
            ORDER BY a.class_date DESC
            """, nativeQuery = true)
    List<RecentMark> recentAttendance(@Param("studentId") Long studentId,
                                      @Param("from") java.time.LocalDate from,
                                      @Param("to") java.time.LocalDate to);

    @Modifying
    @Query(value = """
            INSERT INTO students (document_id, first_name, middle_name, last_name, second_surname, grade)
            VALUES (:documentId, :firstName, :middleName, :lastName, :secondSurname, :grade)
            ON CONFLICT (document_id) DO UPDATE
              SET first_name = EXCLUDED.first_name,
                  middle_name = EXCLUDED.middle_name,
                  last_name = EXCLUDED.last_name,
                  second_surname = EXCLUDED.second_surname,
                  grade = EXCLUDED.grade,
                  active = TRUE
            """, nativeQuery = true)
    void upsert(@Param("documentId") String documentId,
                @Param("firstName") String firstName,
                @Param("middleName") String middleName,
                @Param("lastName") String lastName,
                @Param("secondSurname") String secondSurname,
                @Param("grade") String grade);
}
