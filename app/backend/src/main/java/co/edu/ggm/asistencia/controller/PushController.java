package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.service.JwtService;
import co.edu.ggm.asistencia.service.PushService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/push")
public class PushController {

    private final PushService push;

    public PushController(PushService push) { this.push = push; }

    public record Keys(@NotBlank String p256dh, @NotBlank String auth) {}
    public record SubscripcionRequest(@NotBlank String endpoint, @NotNull Keys keys) {}

    @GetMapping("/vapid-public-key")
    public Map<String, String> clave() {
        if (!push.activo()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Avisos no configurados");
        return Map.of("key", push.clavePublica());
    }

    @PostMapping("/subscriptions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void suscribir(@Valid @RequestBody SubscripcionRequest r) {
        push.guardar(JwtService.currentUserId(), r.endpoint(), r.keys().p256dh(), r.keys().auth());
    }

    @DeleteMapping("/subscriptions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void borrar(@RequestParam String endpoint) {
        push.borrar(JwtService.currentUserId(), endpoint);
    }
}
