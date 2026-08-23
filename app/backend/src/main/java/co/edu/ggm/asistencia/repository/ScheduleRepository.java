package co.edu.ggm.asistencia.repository;

import co.edu.ggm.asistencia.model.ScheduleBlock;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ScheduleRepository extends JpaRepository<ScheduleBlock, Long> {
    List<ScheduleBlock> findByTeacherIdOrderByWeekdayAscBlockNoAsc(Long teacherId);
    List<ScheduleBlock> findAllByOrderByWeekdayAscBlockNoAsc();

    interface WeekRow {
        Long getId();
        String getGrade();
        int getWeekday();
        int getBlockNo();
        String getSubject();
        java.time.LocalTime getStartTime();
        java.time.LocalTime getEndTime();
        String getRoom();
        String getTeacherName();
    }

    @org.springframework.data.jpa.repository.Query(value = """
            SELECT b.id AS id, b.grade AS grade, b.weekday AS weekday, b.block_no AS blockNo,
                   s.name AS subject, b.start_time AS startTime, b.end_time AS endTime,
                   b.room AS room, u.full_name AS teacherName
            FROM schedule_blocks b
            JOIN subjects s ON s.id = b.subject_id
            JOIN users u ON u.id = b.teacher_id
            WHERE b.teacher_id = :teacherId
            ORDER BY b.weekday, b.block_no
            """, nativeQuery = true)
    java.util.List<WeekRow> weekOfTeacher(
            @org.springframework.data.repository.query.Param("teacherId") Long teacherId);

    @org.springframework.data.jpa.repository.Query(value = """
            SELECT b.id AS id, b.grade AS grade, b.weekday AS weekday, b.block_no AS blockNo,
                   s.name AS subject, b.start_time AS startTime, b.end_time AS endTime,
                   b.room AS room, u.full_name AS teacherName
            FROM schedule_blocks b
            JOIN subjects s ON s.id = b.subject_id
            JOIN users u ON u.id = b.teacher_id
            WHERE b.grade = :grade
            ORDER BY b.weekday, b.block_no
            """, nativeQuery = true)
    java.util.List<WeekRow> weekOfGrade(
            @org.springframework.data.repository.query.Param("grade") String grade);

    /**
     * Los bloques que el docente dicta ese dia de la semana, con cuantos estudiantes
     * tiene el curso y cuantos lleva marcados en esa fecha.
     *
     * Los conteos van como subconsultas y no como JOIN contra `attendance`: un JOIN
     * dejaria fuera los bloques sin marcar, que son precisamente los que hay que ver.
     */
    @org.springframework.data.jpa.repository.Query(value = """
            SELECT b.id AS id, b.block_no AS blockNo, b.grade AS grade,
                   s.name AS subject, b.room AS room,
                   b.start_time AS startTime, b.end_time AS endTime,
                   (SELECT count(*) FROM students st
                     WHERE st.grade = b.grade AND st.active) AS estudiantes,
                   (SELECT count(*) FROM attendance a
                     WHERE a.schedule_block_id = b.id AND a.class_date = :fecha) AS marcados
              FROM schedule_blocks b
              JOIN subjects s ON s.id = b.subject_id
             WHERE b.teacher_id = :teacherId AND b.weekday = :weekday
             ORDER BY b.block_no
            """, nativeQuery = true)
    List<DayRow> myDay(@org.springframework.data.repository.query.Param("teacherId") Long teacherId,
                       @org.springframework.data.repository.query.Param("weekday") int weekday,
                       @org.springframework.data.repository.query.Param("fecha") java.time.LocalDate fecha);

    interface DayRow {
        Long getId(); int getBlockNo(); String getGrade(); String getSubject();
        String getRoom(); java.time.LocalTime getStartTime(); java.time.LocalTime getEndTime();
        int getEstudiantes(); int getMarcados();
    }
}
