package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.model.DayType;
import co.edu.ggm.asistencia.service.CalendarService;
import co.edu.ggm.asistencia.service.JwtService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/calendar")
public class CalendarController {

    private final CalendarService service;

    public CalendarController(CalendarService service) { this.service = service; }

    public record DayDto(LocalDate calendarDate, DayType dayType, String description) {}
    public record UpdateRequest(@NotNull DayType dayType, String description) {}

    @GetMapping("/school-days")
    public List<DayDto> range(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.range(from, to).stream()
                .map(d -> new DayDto(d.getCalendarDate(), d.getDayType(), d.getDescription()))
                .toList();
    }

    @PutMapping("/school-days/{date}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    public DayDto update(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                         @Valid @RequestBody UpdateRequest req) {
        var d = service.update(date, req.dayType(), req.description(), JwtService.currentUserId());
        return new DayDto(d.getCalendarDate(), d.getDayType(), d.getDescription());
    }
}
