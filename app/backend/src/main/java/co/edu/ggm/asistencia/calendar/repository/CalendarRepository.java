package co.edu.ggm.asistencia.calendar.repository;

import co.edu.ggm.asistencia.calendar.model.DayType;
import co.edu.ggm.asistencia.calendar.model.SchoolDay;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface CalendarRepository extends JpaRepository<SchoolDay, LocalDate> {

    List<SchoolDay> findByCalendarDateBetweenOrderByCalendarDate(LocalDate from, LocalDate to);

    List<SchoolDay> findByDayType(DayType dayType);
}
