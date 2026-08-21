package co.edu.ggm.asistencia.notify.repository;

import co.edu.ggm.asistencia.notify.model.Notification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findTop200BySentAtIsNullAndErrorIsNullOrderByIdAsc();

    /**
     * Encola avisos de evasion a coordinacion para toda asistencia 'E' que aun no lo tenga.
     * ON CONFLICT DO NOTHING mas la constraint notification_unique = nunca dos correos por lo mismo.
     */
    @Modifying
    @Query(value = """
            INSERT INTO notifications (attendance_id, kind, recipient, subject, body)
            SELECT a.id, 'EVASION', :coordination,
                   'Evasion de clase: ' || st.first_name || ' ' || st.last_name,
                   'El estudiante ' || st.first_name || ' ' || st.last_name ||
                   ' (' || st.grade || ') fue marcado como evadiendo clase el ' ||
                   to_char(a.class_date, 'DD/MM/YYYY') || ' por ' || u.full_name || '.'
            FROM attendance a
            JOIN students st ON st.id = a.student_id
            JOIN users u ON u.id = a.recorded_by
            WHERE a.status = 'E'
            ON CONFLICT ON CONSTRAINT notification_unique DO NOTHING
            """, nativeQuery = true)
    int enqueueEvasion(@Param("coordination") String coordination);

    /**
     * Un solo aviso por estudiante y dia (no uno por bloque), anclado a la asistencia
     * de menor id de ese dia para que la constraint lo deduplique.
     */
    @Modifying
    @Query(value = """
            INSERT INTO notifications (attendance_id, kind, recipient, subject, body)
            SELECT DISTINCT ON (a.student_id, a.class_date, g.guardian_id)
                   a.id, 'AUSENCIA_DIA', gu.email,
                   'Inasistencia de ' || st.first_name || ' ' || st.last_name,
                   'Le informamos que ' || st.first_name || ' ' || st.last_name ||
                   ' no asistio a clase el ' || to_char(a.class_date, 'DD/MM/YYYY') ||
                   '. Colegio Gabriel Garcia Marquez.'
            FROM attendance a
            JOIN students st ON st.id = a.student_id
            JOIN guardianships g ON g.student_id = a.student_id
            JOIN users gu ON gu.id = g.guardian_id AND gu.active
            WHERE a.status = 'F'
            ORDER BY a.student_id, a.class_date, g.guardian_id, a.id
            ON CONFLICT ON CONSTRAINT notification_unique DO NOTHING
            """, nativeQuery = true)
    int enqueueAusencias();
}
