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

    interface AbsenceRow {
        String getDocumentId();
        String getFullName();
        String getGrade();
        int getAbsences();
        int getEvasions();
        String getDates();
    }

    @Query(value = """
            SELECT s.document_id AS documentId,
                   trim(regexp_replace(concat_ws(' ', s.first_name, s.middle_name,
                        s.last_name, s.second_surname), '\\s+', ' ', 'g')) AS fullName,
                   s.grade AS grade,
                   count(*) FILTER (WHERE a.status = 'F') AS absences,
                   count(*) FILTER (WHERE a.status = 'E') AS evasions,
                   string_agg(DISTINCT to_char(a.class_date, 'YYYY-MM-DD'), ', ') AS dates
            FROM attendance a
            JOIN students s ON s.id = a.student_id
            WHERE a.class_date BETWEEN :from AND :to
              AND a.status IN ('F','E')
              AND s.active
              AND (:grade IS NULL OR s.grade = :grade)
            GROUP BY s.id, s.document_id, s.first_name, s.middle_name,
                     s.last_name, s.second_surname, s.grade
            ORDER BY count(*) FILTER (WHERE a.status = 'F') DESC,
                     count(*) FILTER (WHERE a.status = 'E') DESC,
                     s.last_name, s.first_name
            """, nativeQuery = true)
    List<AbsenceRow> absences(@Param("grade") String grade,
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
              -- Un bloque esta pendiente mientras le falte algun estudiante, no solo
              -- cuando no tenga ninguno: antes bastaba un registro para darlo por
              -- completo y nadie avisaba de los que faltaban.
              AND (SELECT count(*) FROM attendance a
                    WHERE a.schedule_block_id = b.id AND a.class_date = :day)
                  < (SELECT count(*) FROM students s
                      WHERE s.grade = b.grade AND s.active)
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

    @Query(value = """
            SELECT count(*) FROM schedule_blocks WHERE weekday = :weekday
            """, nativeQuery = true)
    int countBlocksOfWeekday(@Param("weekday") int weekday);

    @Query(value = """
            SELECT count(*) FROM schedule_blocks b
            WHERE b.weekday = :weekday
              AND (SELECT count(*) FROM attendance a
                    WHERE a.schedule_block_id = b.id AND a.class_date = :day)
                  >= (SELECT count(*) FROM students s WHERE s.grade = b.grade AND s.active)
              AND EXISTS (SELECT 1 FROM students s WHERE s.grade = b.grade AND s.active)
            """, nativeQuery = true)
    int countBlocksReported(@Param("weekday") int weekday, @Param("day") LocalDate day);

    interface DayCounts {
        int getPresentes();
        int getTarde();
        int getAusentes();
        int getEvasiones();
    }

    @Query(value = """
            SELECT count(*) FILTER (WHERE status = 'P') AS presentes,
                   count(*) FILTER (WHERE status = 'T') AS tarde,
                   count(*) FILTER (WHERE status = 'F') AS ausentes,
                   count(*) FILTER (WHERE status = 'E') AS evasiones
            FROM attendance WHERE class_date = :day
            """, nativeQuery = true)
    DayCounts countsOfDay(@Param("day") LocalDate day);

    @Query(value = "SELECT count(*) FROM entry_log WHERE entry_date = :day", nativeQuery = true)
    int countEntries(@Param("day") LocalDate day);

    interface NovedadRow {
        Long getStudentId();
        String getFullName();
        String getGrade();
        LocalDate getClassDate();
        String getSubject();
        String getComment();
    }

    @Query(value = """
            SELECT s.id AS studentId,
                   trim(regexp_replace(concat_ws(' ', s.first_name, s.middle_name,
                        s.last_name, s.second_surname), '\\s+', ' ', 'g')) AS fullName,
                   s.grade AS grade,
                   a.class_date AS classDate,
                   sub.name AS subject,
                   a.comment AS comment
            FROM attendance a
            JOIN students s ON s.id = a.student_id
            JOIN schedule_blocks b ON b.id = a.schedule_block_id
            JOIN subjects sub ON sub.id = b.subject_id
            WHERE a.status = :status AND a.class_date BETWEEN :from AND :to
            ORDER BY a.class_date DESC
            LIMIT :limite
            """, nativeQuery = true)
    List<NovedadRow> novedadesPorEstado(@Param("status") String status,
                                        @Param("from") LocalDate from,
                                        @Param("to") LocalDate to,
                                        @Param("limite") int limite);

    @Query(value = """
            SELECT count(*) FROM attendance a WHERE a.class_date BETWEEN :from AND :to
            """, nativeQuery = true)
    int countAttendanceRecords(@Param("from") LocalDate from, @Param("to") LocalDate to);

    interface CursoPeriodoRow {
        String getGrade();
        int getPresent();
        int getLate();
        int getAbsent();
        int getEvasion();
    }

    // A diferencia de byGrade (que solo trae cursos con algun registro, porque
    // hace INNER JOIN contra attendance), esta arranca de los cursos activos y
    // les hace LEFT JOIN: el curso que nadie ha marcado en el periodo sale
    // igual, con todo en cero, para poder distinguirlo de uno con 100% real.
    @Query(value = """
            SELECT g.grade AS grade,
                   count(*) FILTER (WHERE a.status = 'P') AS present,
                   count(*) FILTER (WHERE a.status = 'T') AS late,
                   count(*) FILTER (WHERE a.status = 'F') AS absent,
                   count(*) FILTER (WHERE a.status = 'E') AS evasion
            FROM (SELECT DISTINCT grade FROM students WHERE active) g
            LEFT JOIN students s ON s.grade = g.grade AND s.active
            LEFT JOIN attendance a ON a.student_id = s.id AND a.class_date BETWEEN :from AND :to
            GROUP BY g.grade
            ORDER BY g.grade
            """, nativeQuery = true)
    List<CursoPeriodoRow> cursosDelPeriodo(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
