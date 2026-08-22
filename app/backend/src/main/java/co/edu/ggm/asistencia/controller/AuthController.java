package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.service.AuthService;
import co.edu.ggm.asistencia.service.JwtService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) { this.auth = auth; }

    public record LoginRequest(@NotBlank String email, @NotBlank String password) {}
    public record RefreshRequest(@NotBlank String refreshToken) {}
    public record ChangePasswordRequest(@NotBlank String currentPassword, @NotBlank String newPassword) {}

    @PostMapping("/login")
    public AuthService.Session login(@Valid @RequestBody LoginRequest req) {
        return auth.login(req.email(), req.password());
    }

    @PostMapping("/refresh")
    public AuthService.Session refresh(@Valid @RequestBody RefreshRequest req) {
        return auth.refresh(req.refreshToken());
    }

    @PostMapping("/change-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@Valid @RequestBody ChangePasswordRequest req) {
        auth.changePassword(JwtService.currentUserId(), req.currentPassword(), req.newPassword());
    }
}
