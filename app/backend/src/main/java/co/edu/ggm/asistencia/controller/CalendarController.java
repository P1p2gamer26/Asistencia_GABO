package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.model.DayType;
import co.edu.ggm.asistencia.service.CalendarService;
import co.edu.ggm.asistencia.service.JwtService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/calendar")
public class CalendarController {

    private final CalendarService service;

    public CalendarController(CalendarService service) { this.service = service; }

    public record DayDto(LocalDate calendarDate, DayType dayType, String description, Integer cycleDay,
                         Integer cycleDayFixed) {}
    public record CycleRequest(Integer cycleDay, boolean cascada) {}
    public record UpdateRequest(@NotNull DayType dayType, String description) {}
    public record RangeRequest(@NotNull LocalDate from, @NotNull LocalDate to,
                               @NotNull DayType dayType, String description,
                               boolean soloHabiles) {}

    @GetMapping("/school-days")
    public List<DayDto> range(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.range(from, to).stream()
                .map(d -> new DayDto(d.getCalendarDate(), d.getDayType(), d.getDescription(), d.getCycleDay(),
                        d.getCycleDayFixed()))
                .toList();
    }

    @PutMapping("/school-days/{date}")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    public DayDto update(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                         @Valid @RequestBody UpdateRequest req) {
        var d = service.update(date, req.dayType(), req.description(), JwtService.currentUserId());
        return new DayDto(d.getCalendarDate(), d.getDayType(), d.getDescription(), service.cycleDay(date),
                d.getCycleDayFixed() == null ? null : (int) d.getCycleDayFixed());
    }

    @PutMapping("/school-days/{date}/cycle-day")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    public DayDto fijarCiclo(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                             @RequestBody CycleRequest req) {
        service.fijarDiaCiclo(date, req.cycleDay(), req.cascada(), JwtService.currentUserId());
        return range(date, date).get(0);
    }

    @PutMapping("/school-days")
    @PreAuthorize("hasAnyRole('ADMIN','COORDINADOR')")
    public Map<String, Integer> updateRange(@Valid @RequestBody RangeRequest req) {
        if (req.to().isBefore(req.from())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El rango esta al reves");
        }
        if (req.from().plusDays(400).isBefore(req.to())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El rango no puede pasar de un ano");
        }
        int n = service.updateRange(req.from(), req.to(), req.dayType(), req.description(),
                req.soloHabiles(), JwtService.currentUserId());
        return Map.of("cambiados", n);
    }
}
