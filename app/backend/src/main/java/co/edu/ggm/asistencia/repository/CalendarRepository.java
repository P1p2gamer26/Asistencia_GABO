package co.edu.ggm.asistencia.repository;

import co.edu.ggm.asistencia.model.DayType;
import co.edu.ggm.asistencia.model.SchoolDay;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface CalendarRepository extends JpaRepository<SchoolDay, LocalDate> {

    interface DayWithCycle {
        LocalDate getCalendarDate();
        DayType getDayType();
        String getDescription();
        Integer getCycleDay();
        Integer getCycleDayFixed();
    }

    List<SchoolDay> findByCalendarDateBetweenOrderByCalendarDate(LocalDate from, LocalDate to);

    List<SchoolDay> findByDayType(DayType dayType);

    List<SchoolDay> findByDayTypeAndCalendarDateBetweenOrderByCalendarDate(
            DayType dayType, LocalDate from, LocalDate to);

    @Query(value = "SELECT cycle_day FROM calendario_ciclo WHERE calendar_date = :date", nativeQuery = true)
    Integer cycleDayOf(@Param("date") LocalDate date);

    @Query(value = """
            SELECT calendar_date FROM school_calendar
            WHERE day_type = 'LECTIVO' AND calendar_date > :date
              AND EXTRACT(YEAR FROM calendar_date) = EXTRACT(YEAR FROM CAST(:date AS date))
            ORDER BY calendar_date LIMIT 1
            """, nativeQuery = true)
    LocalDate siguienteLectivo(@Param("date") LocalDate date);

    @Query(value = """
            SELECT c.calendar_date AS calendarDate, c.day_type AS dayType,
                   c.description AS description, cc.cycle_day AS cycleDay,
                   c.cycle_day_fixed AS cycleDayFixed
            FROM school_calendar c
            LEFT JOIN calendario_ciclo cc ON cc.calendar_date = c.calendar_date
            WHERE c.calendar_date BETWEEN :from AND :to
            ORDER BY c.calendar_date
            """, nativeQuery = true)
    List<DayWithCycle> findRangeWithCycle(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
