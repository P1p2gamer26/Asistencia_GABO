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

    List<Attendance> findByScheduleBlockIdAndClassDateAndDeletedAtIsNull(Long scheduleBlockId, LocalDate classDate);

    long countByScheduleBlockId(Long scheduleBlockId);

    List<Attendance> findByStudentIdAndClassDateBetweenOrderByClassDateDesc(
            Long studentId, LocalDate desde, LocalDate hasta);

    interface DetalleRow {
        java.util.UUID getId(); Long getStudentId(); String getFullName(); String getDocumentId();
        String getStatus(); String getComment();
        Long getRecordedBy(); String getRecordedByName(); Instant getRecordedAt();
        Long getEditedBy(); String getEditedByName(); Instant getEditedAt();
    }

    /** Lo ya registrado para un bloque/fecha, con quien lo tomo y quien lo corrigio (NULL si nadie). */
    @Query(value = """
            SELECT a.id AS id, a.student_id AS studentId,
                   trim(regexp_replace(concat_ws(' ', st.first_name, st.middle_name, st.last_name,
                        st.second_surname), '\\s+', ' ', 'g')) AS fullName,
                   st.document_id AS documentId,
                   a.status AS status, a.comment AS comment,
                   a.recorded_by AS recordedBy, ru.full_name AS recordedByName, a.recorded_at AS recordedAt,
                   a.edited_by AS editedBy, eu.full_name AS editedByName, a.edited_at AS editedAt
              FROM attendance a
              JOIN students st ON st.id = a.student_id
              LEFT JOIN users ru ON ru.id = a.recorded_by
              LEFT JOIN users eu ON eu.id = a.edited_by
             WHERE a.schedule_block_id = :blockId AND a.class_date = :classDate AND a.deleted_at IS NULL
             ORDER BY 3
            """, nativeQuery = true)
    List<DetalleRow> detalle(@Param("blockId") Long blockId, @Param("classDate") LocalDate classDate);

    interface SesionRow {
        Long getBlockId(); String getGrade(); Short getBlockNo(); String getSubject();
        LocalDate getClassDate(); Long getTotal(); String getRecordedByName(); Instant getLastRecordedAt();
    }

    /**
     * Las ultimas tomas de asistencia (una fila por bloque+fecha) para el panel lateral.
     * teacherId NULL = sin filtro: coordinacion y administracion ven las de todos.
     */
    @Query(value = """
            SELECT a.schedule_block_id AS blockId, sb.grade AS grade, sb.block_no AS blockNo,
                   su.name AS subject, a.class_date AS classDate,
                   count(*) AS total,
                   min(ru.full_name) AS recordedByName,
                   max(a.recorded_at) AS lastRecordedAt
              FROM attendance a
              JOIN schedule_blocks sb ON sb.id = a.schedule_block_id
              LEFT JOIN subjects su ON su.id = sb.subject_id
              LEFT JOIN users ru ON ru.id = a.recorded_by
             WHERE a.deleted_at IS NULL
               AND (:teacherId IS NULL OR sb.teacher_id = :teacherId)
             GROUP BY a.schedule_block_id, sb.grade, sb.block_no, su.name, a.class_date
             ORDER BY a.class_date DESC, max(a.recorded_at) DESC
             LIMIT :limite
            """, nativeQuery = true)
    List<SesionRow> ultimasSesiones(@Param("teacherId") Long teacherId, @Param("limite") int limite);

    /** Actualiza la marca existente de ese estudiante/bloque/fecha. Devuelve 1 si actualizo algo. */
    @Modifying
    @Query(value = """
            UPDATE attendance
               SET status = :status, comment = :comment, recorded_by = :recordedBy,
                   recorded_at = :recordedAt, synced_at = now(),
                   deleted_by = NULL, deleted_at = NULL
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

    /** Corrige un registro existente y deja constancia de quien lo cambio, sin perder quien lo tomo. */
    @Modifying
    @Query(value = """
            UPDATE attendance
               SET previous_status = status, status = :status, comment = :comment,
                   edited_by = :editedBy, edited_at = now()
             WHERE id = :id AND deleted_at IS NULL
            """, nativeQuery = true)
    int editar(@Param("id") UUID id, @Param("status") String status,
              @Param("comment") String comment, @Param("editedBy") Long editedBy);

    /** Borrado logico: la fila se conserva, solo se marca como borrada y por quien. */
    @Modifying
    @Query(value = """
            UPDATE attendance SET deleted_by = :deletedBy, deleted_at = now()
             WHERE id = :id AND deleted_at IS NULL
            """, nativeQuery = true)
    int borrar(@Param("id") UUID id, @Param("deletedBy") Long deletedBy);
}
