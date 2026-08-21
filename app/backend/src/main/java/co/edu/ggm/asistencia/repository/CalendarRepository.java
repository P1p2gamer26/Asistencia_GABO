package co.edu.ggm.asistencia.repository;

import co.edu.ggm.asistencia.model.DayType;
import co.edu.ggm.asistencia.model.SchoolDay;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface CalendarRepository extends JpaRepository<SchoolDay, LocalDate> {

    List<SchoolDay> findByCalendarDateBetweenOrderByCalendarDate(LocalDate from, LocalDate to);

    List<SchoolDay> findByDayType(DayType dayType);
}
