package co.edu.ggm.asistencia.entry.repository;

import co.edu.ggm.asistencia.entry.model.EntryLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public interface EntryRepository extends JpaRepository<EntryLog, UUID> {

    @Modifying
    @Query(value = """
            INSERT INTO entry_log (id, student_id, entry_date, scanned_at, recorded_by)
            VALUES (:id, :studentId, :entryDate, :scannedAt, :recordedBy)
            ON CONFLICT ON CONSTRAINT entry_unique_day DO NOTHING
            """, nativeQuery = true)
    void upsert(@Param("id") UUID id,
                @Param("studentId") Long studentId,
                @Param("entryDate") LocalDate entryDate,
                @Param("scannedAt") Instant scannedAt,
                @Param("recordedBy") Long recordedBy);
}
