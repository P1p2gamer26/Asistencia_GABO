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
}
