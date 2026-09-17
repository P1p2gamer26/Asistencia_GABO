package co.edu.ggm.asistencia.service;

import co.edu.ggm.asistencia.model.DayType;
import co.edu.ggm.asistencia.model.SchoolDay;
import co.edu.ggm.asistencia.repository.CalendarRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class CalendarService {

    private final CalendarRepository repo;

    /**
     * Cache de dias lectivos. Son ~190 fechas al ano y se consultan una vez por cada
     * registro de un lote de 40 estudiantes: ir a la base cada vez seria absurdo.
     * ponytail: Set en memoria; si algun dia hay varias instancias del backend,
     * cambiar a cache distribuida o TTL corto.
     */
    private volatile Set<LocalDate> lectivos = ConcurrentHashMap.newKeySet();

    public CalendarService(CalendarRepository repo) { this.repo = repo; }

    @PostConstruct
    void cargar() {
        lectivos = repo.findByDayType(DayType.LECTIVO).stream()
                .map(SchoolDay::getCalendarDate)
                .collect(Collectors.toCollection(ConcurrentHashMap::newKeySet));
    }

    public boolean isSchoolDay(LocalDate date) {
        return lectivos.contains(date);
    }

    /** Dia de ciclo 1..5, o 0 cuando la fecha no es lectiva. */
    public int cycleDay(LocalDate date) {
        Integer day = repo.cycleDayOf(date);
        return day == null ? 0 : day;
    }

    /** Los ultimos n dias lectivos anteriores a una fecha, del mas reciente al mas antiguo. */
    public List<LocalDate> ultimosLectivosAntesDe(LocalDate antesDe, int n) {
        return lectivos.stream()
                .filter(d -> d.isBefore(antesDe))
                .sorted(java.util.Comparator.reverseOrder())
                .limit(n)
                .toList();
    }

    public List<CalendarRepository.DayWithCycle> range(LocalDate from, LocalDate to) {
        return repo.findRangeWithCycle(from, to);
    }

    @Transactional
    public SchoolDay update(LocalDate date, DayType type, String description, Long userId) {
        SchoolDay dia = repo.findById(date).orElseGet(() -> {
            var nuevo = new SchoolDay();
            nuevo.setCalendarDate(date);
            return nuevo;
        });
        dia.setDayType(type);
        dia.setDescription(description);
        dia.setUpdatedBy(userId);
        dia.setUpdatedAt(Instant.now());
        SchoolDay guardado = repo.save(dia);

        if (type == DayType.LECTIVO) lectivos.add(date); else lectivos.remove(date);
        return guardado;
    }

    /**
     * Un paro o un receso movido son rangos, no dias sueltos: hacerlo dia por dia es
     * donde la gente se equivoca. Con soloHabiles se saltan sabados y domingos,
     * porque nadie quiere marcar el fin de semana como jornada pedagogica.
     * Devuelve cuantos dias cambio.
     */
    @Transactional
    public int updateRange(LocalDate from, LocalDate to, DayType type,
                           String description, boolean soloHabiles, Long userId) {
        int n = 0;
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            if (soloHabiles && d.getDayOfWeek().getValue() > 5) continue;
            update(d, type, description, userId);
            n++;
        }
        return n;
    }
}
