package co.edu.ggm.asistencia.repository;

import co.edu.ggm.asistencia.model.Student;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface ReportRepository extends Repository<Student, Long> {

    interface Row {
        Long getStudentId();
        String getDocumentId();
        String getFullName();
        String getGrade();
        int getPresent();
        int getLate();
        int getAbsent();
        int getEvasion();
        int getSchoolDays();
    }

    @Query(value = """
            SELECT s.id AS studentId,
                   s.document_id AS documentId,
                   trim(regexp_replace(concat_ws(' ', s.first_name, s.middle_name,
                        s.last_name, s.second_surname), '\\s+', ' ', 'g')) AS fullName,
                   s.grade AS grade,
                   count(*) FILTER (WHERE a.status = 'P') AS present,
                   count(*) FILTER (WHERE a.status = 'T') AS late,
                   count(*) FILTER (WHERE a.status = 'F') AS absent,
                   count(*) FILTER (WHERE a.status = 'E') AS evasion,
                   (SELECT count(*) FROM school_calendar c
                     WHERE c.day_type = 'LECTIVO'
                       AND c.calendar_date BETWEEN :from AND :to) AS schoolDays
            FROM students s
            LEFT JOIN attendance a ON a.student_id = s.id AND a.class_date BETWEEN :from AND :to
            WHERE s.active AND (:grade IS NULL OR s.grade = :grade)
            GROUP BY s.id, s.document_id, s.first_name, s.middle_name,
                     s.last_name, s.second_surname, s.grade
            ORDER BY s.grade, s.last_name, s.first_name
            """, nativeQuery = true)
    List<Row> summary(@Param("grade") String grade,
                      @Param("from") LocalDate from,
                      @Param("to") LocalDate to);

    interface MatrixRow {
        Long getStudentId();
        String getDocumentId();
        String getFullName();
        String getGrade();
        LocalDate getClassDate();
        String getStatus();
    }

    @Query(value = """
            SELECT s.id AS studentId,
                   s.document_id AS documentId,
                   trim(regexp_replace(concat_ws(' ', s.first_name, s.middle_name,
                        s.last_name, s.second_surname), '\\s+', ' ', 'g')) AS fullName,
                   s.grade AS grade,
                   a.class_date AS classDate,
                   a.status AS status
            FROM students s
            LEFT JOIN attendance a ON a.student_id = s.id AND a.class_date BETWEEN :from AND :to
            WHERE s.active AND (:grade IS NULL OR s.grade = :grade)
            ORDER BY s.grade, s.last_name, s.first_name, a.class_date
            """, nativeQuery = true)
    List<MatrixRow> matrix(@Param("grade") String grade,
                           @Param("from") LocalDate from,
                           @Param("to") LocalDate to);

    interface PendingBlock {
        Long getBlockId();
        String getGrade();
        String getSubject();
        int getBlockNo();
    }

    @Query(value = """
            SELECT b.id AS blockId, b.grade AS grade, sub.name AS subject, b.block_no AS blockNo
            FROM schedule_blocks b
            JOIN subjects sub ON sub.id = b.subject_id
            WHERE b.teacher_id = :teacherId
              AND b.weekday = :weekday
              AND NOT EXISTS (SELECT 1 FROM attendance a
                              WHERE a.schedule_block_id = b.id AND a.class_date = :day)
            ORDER BY b.block_no
            """, nativeQuery = true)
    List<PendingBlock> pendingToday(@Param("teacherId") Long teacherId,
                                    @Param("weekday") int weekday,
                                    @Param("day") LocalDate day);

    interface GradeRow {
        String getGrade();
        int getPresent();
        int getLate();
        int getAbsent();
        int getEvasion();
    }

    @Query(value = """
            SELECT s.grade AS grade,
                   count(*) FILTER (WHERE a.status = 'P') AS present,
                   count(*) FILTER (WHERE a.status = 'T') AS late,
                   count(*) FILTER (WHERE a.status = 'F') AS absent,
                   count(*) FILTER (WHERE a.status = 'E') AS evasion
            FROM attendance a
            JOIN students s ON s.id = a.student_id
            WHERE a.class_date BETWEEN :from AND :to
              AND (:grade IS NULL OR s.grade = :grade)
            GROUP BY s.grade
            ORDER BY s.grade
            """, nativeQuery = true)
    List<GradeRow> byGrade(@Param("grade") String grade,
                           @Param("from") LocalDate from,
                           @Param("to") LocalDate to);

    interface TrendRow {
        LocalDate getClassDate();
        double getAttendanceRate();
    }

    @Query(value = """
            SELECT a.class_date AS classDate,
                   round(100.0 * count(*) FILTER (WHERE a.status IN ('P','T')) / count(*), 1)
                     AS attendanceRate
            FROM attendance a
            JOIN students s ON s.id = a.student_id
            WHERE a.class_date BETWEEN :from AND :to
              AND (:grade IS NULL OR s.grade = :grade)
            GROUP BY a.class_date
            ORDER BY a.class_date
            """, nativeQuery = true)
    List<TrendRow> trend(@Param("grade") String grade,
                         @Param("from") LocalDate from,
                         @Param("to") LocalDate to);

    @Query(value = """
            SELECT count(*) FROM school_calendar
            WHERE day_type = 'LECTIVO' AND calendar_date BETWEEN :from AND :to
            """, nativeQuery = true)
    int countSchoolDays(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query(value = """
            SELECT count(DISTINCT a.student_id) FROM attendance a
            WHERE a.class_date = :day AND a.status = 'F'
            """, nativeQuery = true)
    int countAbsentOn(@Param("day") LocalDate day);

    @Query(value = """
            SELECT count(*) FROM attendance a
            WHERE a.status = 'E' AND a.class_date BETWEEN :from AND :to
            """, nativeQuery = true)
    int countEvasions(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query(value = """
            SELECT count(*) FROM schedule_blocks b
            WHERE b.weekday = :weekday
              AND NOT EXISTS (SELECT 1 FROM attendance a
                              WHERE a.schedule_block_id = b.id AND a.class_date = :day)
            """, nativeQuery = true)
    int countBlocksPending(@Param("weekday") int weekday, @Param("day") LocalDate day);
}
