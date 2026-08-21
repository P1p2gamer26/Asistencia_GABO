package co.edu.ggm.asistencia.repository;

import co.edu.ggm.asistencia.model.ScheduleBlock;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ScheduleRepository extends JpaRepository<ScheduleBlock, Long> {
    List<ScheduleBlock> findByTeacherIdOrderByWeekdayAscBlockNoAsc(Long teacherId);
}
