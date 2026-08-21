package co.edu.ggm.asistencia.repository;

import co.edu.ggm.asistencia.model.Attendance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface AttendanceRepository extends JpaRepository<Attendance, UUID> {

    List<Attendance> findByScheduleBlockIdAndClassDate(Long scheduleBlockId, LocalDate classDate);

    List<Attendance> findByStudentIdAndClassDateBetweenOrderByClassDateDesc(
            Long studentId, LocalDate desde, LocalDate hasta);

    /** Actualiza la marca existente de ese estudiante/bloque/fecha. Devuelve 1 si actualizo algo. */
    @Modifying
    @Query(value = """
            UPDATE attendance
               SET status = :status, comment = :comment, recorded_by = :recordedBy,
                   recorded_at = :recordedAt, synced_at = now()
             WHERE student_id = :studentId
               AND schedule_block_id = :blockId
               AND class_date = :classDate
               AND recorded_at <= :recordedAt
            """, nativeQuery = true)
    int updateExisting(@Param("studentId") Long studentId,
                       @Param("blockId") Long blockId,
                       @Param("classDate") LocalDate classDate,
                       @Param("status") String status,
                       @Param("comment") String comment,
                       @Param("recordedBy") Long recordedBy,
                       @Param("recordedAt") Instant recordedAt);

    /** Inserta la marca. DO NOTHING absorbe la carrera entre dos dispositivos sincronizando a la vez. */
    @Modifying
    @Query(value = """
            INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                    status, comment, recorded_by, recorded_at, synced_at)
            VALUES (:id, :studentId, :blockId, :classDate, :status, :comment,
                    :recordedBy, :recordedAt, now())
            ON CONFLICT DO NOTHING
            """, nativeQuery = true)
    int insertIfAbsent(@Param("id") UUID id,
                       @Param("studentId") Long studentId,
                       @Param("blockId") Long blockId,
                       @Param("classDate") LocalDate classDate,
                       @Param("status") String status,
                       @Param("comment") String comment,
                       @Param("recordedBy") Long recordedBy,
                       @Param("recordedAt") Instant recordedAt);
}
