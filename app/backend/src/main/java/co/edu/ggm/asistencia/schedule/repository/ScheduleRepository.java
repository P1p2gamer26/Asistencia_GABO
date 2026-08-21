package co.edu.ggm.asistencia.schedule.repository;

import co.edu.ggm.asistencia.schedule.model.ScheduleBlock;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ScheduleRepository extends JpaRepository<ScheduleBlock, Long> {
    List<ScheduleBlock> findByTeacherIdOrderByWeekdayAscBlockNoAsc(Long teacherId);
}
