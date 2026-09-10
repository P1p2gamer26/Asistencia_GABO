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
     *
     * `marcados` solo cuenta asistencia de estudiantes activos: un estudiante retirado
     * conserva su asistencia pasada (no se borra), pero si se contara aqui el numerador
     * hablaria de un curso distinto al del denominador (`estudiantes`, ya filtrado por
     * activos) y podria superarlo, ej. "31 de 30".
     */
    @org.springframework.data.jpa.repository.Query(value = """
            SELECT b.id AS id, b.block_no AS blockNo, b.grade AS grade,
                   s.name AS subject, b.room AS room,
                   b.start_time AS startTime, b.end_time AS endTime,
                   (SELECT count(*) FROM students st
                     WHERE st.grade = b.grade AND st.active) AS estudiantes,
                   (SELECT count(*) FROM attendance a
                     JOIN students st2 ON st2.id = a.student_id AND st2.active
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

    @org.springframework.data.jpa.repository.Query(value = """
            SELECT b.id AS id, b.grade AS grade, b.weekday AS weekday, b.block_no AS blockNo,
                   s.name AS subject, b.start_time AS startTime, b.end_time AS endTime,
                   b.room AS room, u.full_name AS teacherName
            FROM schedule_blocks b
            JOIN subjects s ON s.id = b.subject_id
            JOIN users u ON u.id = b.teacher_id
            WHERE b.room = :room
            ORDER BY b.weekday, b.block_no
            """, nativeQuery = true)
    java.util.List<WeekRow> weekOfRoom(
            @org.springframework.data.repository.query.Param("room") String room);

    /** Cursos con al menos un bloque asignado, en el orden del colegio (601, 602, ..., 1103). */
    @org.springframework.data.jpa.repository.Query(value = """
            SELECT grade FROM (
                SELECT DISTINCT b.grade, orden_curso(b.grade) AS orden
                FROM schedule_blocks b
            ) cursos ORDER BY orden, grade
            """, nativeQuery = true)
    java.util.List<String> distinctGrades();

    /** Salones distintos con al menos un bloque asignado, en orden alfabetico. */
    @org.springframework.data.jpa.repository.Query(value = """
            SELECT DISTINCT b.room FROM schedule_blocks b
            WHERE b.room IS NOT NULL AND b.room <> ''
            ORDER BY b.room
            """, nativeQuery = true)
    java.util.List<String> distinctRooms();

    /** Bloques sin aula asignada: la columna es opcional y eso es informacion util para coordinacion. */
    @org.springframework.data.jpa.repository.Query(value = """
            SELECT count(*) FROM schedule_blocks b WHERE b.room IS NULL OR b.room = ''
            """, nativeQuery = true)
    long countWithoutRoom();

    /** Otro bloque del mismo docente en el mismo dia/bloque horario (para detectar choque). */
    @org.springframework.data.jpa.repository.Query(value = """
            SELECT b.id AS id, b.grade AS grade, b.weekday AS weekday, b.block_no AS blockNo,
                   s.name AS subject, b.start_time AS startTime, b.end_time AS endTime,
                   b.room AS room, u.full_name AS teacherName
            FROM schedule_blocks b
            JOIN subjects s ON s.id = b.subject_id
            JOIN users u ON u.id = b.teacher_id
            WHERE b.teacher_id = :teacherId AND b.weekday = :weekday AND b.block_no = :blockNo
              AND (:excludeId IS NULL OR b.id <> :excludeId)
            """, nativeQuery = true)
    java.util.List<WeekRow> choqueDeDocente(
            @org.springframework.data.repository.query.Param("teacherId") Long teacherId,
            @org.springframework.data.repository.query.Param("weekday") int weekday,
            @org.springframework.data.repository.query.Param("blockNo") int blockNo,
            @org.springframework.data.repository.query.Param("excludeId") Long excludeId);

    /** Otro bloque en la misma aula en el mismo dia/bloque horario (para detectar choque). */
    @org.springframework.data.jpa.repository.Query(value = """
            SELECT b.id AS id, b.grade AS grade, b.weekday AS weekday, b.block_no AS blockNo,
                   s.name AS subject, b.start_time AS startTime, b.end_time AS endTime,
                   b.room AS room, u.full_name AS teacherName
            FROM schedule_blocks b
            JOIN subjects s ON s.id = b.subject_id
            JOIN users u ON u.id = b.teacher_id
            WHERE b.room = :room AND b.weekday = :weekday AND b.block_no = :blockNo
              AND (:excludeId IS NULL OR b.id <> :excludeId)
            """, nativeQuery = true)
    java.util.List<WeekRow> choqueDeAula(
            @org.springframework.data.repository.query.Param("room") String room,
            @org.springframework.data.repository.query.Param("weekday") int weekday,
            @org.springframework.data.repository.query.Param("blockNo") int blockNo,
            @org.springframework.data.repository.query.Param("excludeId") Long excludeId);

    /** Otro bloque del mismo curso en el mismo dia/bloque (el slot ya esta ocupado). */
    @org.springframework.data.jpa.repository.Query(value = """
            SELECT b.id AS id, b.grade AS grade, b.weekday AS weekday, b.block_no AS blockNo,
                   s.name AS subject, b.start_time AS startTime, b.end_time AS endTime,
                   b.room AS room, u.full_name AS teacherName
            FROM schedule_blocks b
            JOIN subjects s ON s.id = b.subject_id
            JOIN users u ON u.id = b.teacher_id
            WHERE b.grade = :grade AND b.weekday = :weekday AND b.block_no = :blockNo
              AND (:excludeId IS NULL OR b.id <> :excludeId)
            """, nativeQuery = true)
    java.util.List<WeekRow> choqueDeCurso(
            @org.springframework.data.repository.query.Param("grade") String grade,
            @org.springframework.data.repository.query.Param("weekday") int weekday,
            @org.springframework.data.repository.query.Param("blockNo") int blockNo,
            @org.springframework.data.repository.query.Param("excludeId") Long excludeId);

    interface AdminRow {
        Long getId(); String getGrade(); int getWeekday(); int getBlockNo();
        String getSubject(); Long getSubjectId();
        java.time.LocalTime getStartTime(); java.time.LocalTime getEndTime();
        String getRoom(); Long getTeacherId(); String getTeacherName();
        Long getCreatedBy(); String getCreatedByName(); java.time.Instant getCreatedAt();
        Long getUpdatedBy(); String getUpdatedByName(); java.time.Instant getUpdatedAt();
    }

    /** Lista completa para el panel de administracion, con nombres de autoria (NULL si no hay registro). */
    @org.springframework.data.jpa.repository.Query(value = """
            SELECT b.id AS id, b.grade AS grade, b.weekday AS weekday, b.block_no AS blockNo,
                   s.name AS subject, s.id AS subjectId,
                   b.start_time AS startTime, b.end_time AS endTime,
                   b.room AS room, b.teacher_id AS teacherId, u.full_name AS teacherName,
                   b.created_by AS createdBy, cu.full_name AS createdByName, b.created_at AS createdAt,
                   b.updated_by AS updatedBy, uu.full_name AS updatedByName, b.updated_at AS updatedAt
            FROM schedule_blocks b
            JOIN subjects s ON s.id = b.subject_id
            JOIN users u ON u.id = b.teacher_id
            LEFT JOIN users cu ON cu.id = b.created_by
            LEFT JOIN users uu ON uu.id = b.updated_by
            WHERE (:grade IS NULL OR b.grade = :grade)
              AND (:teacherId IS NULL OR b.teacher_id = :teacherId)
            ORDER BY orden_curso(b.grade), b.grade, b.weekday, b.block_no
            """, nativeQuery = true)
    java.util.List<AdminRow> paraAdmin(
            @org.springframework.data.repository.query.Param("grade") String grade,
            @org.springframework.data.repository.query.Param("teacherId") Long teacherId);
}
