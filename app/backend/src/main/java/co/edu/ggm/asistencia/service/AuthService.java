package co.edu.ggm.asistencia.service;

import co.edu.ggm.asistencia.service.JwtService;
import co.edu.ggm.asistencia.model.User;
import co.edu.ggm.asistencia.repository.UserRepository;
import io.jsonwebtoken.JwtException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {

    public record Session(String token, String refreshToken, String role, String fullName, Long userId,
                          boolean mustChangePassword) {}

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;

    public AuthService(UserRepository users, PasswordEncoder encoder, JwtService jwt) {
        this.users = users;
        this.encoder = encoder;
        this.jwt = jwt;
    }

    public Session login(String email, String password) {
        User user = users.findByEmailAndActiveTrue(email.trim().toLowerCase())
                .filter(u -> encoder.matches(password, u.getPasswordHash()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credenciales invalidas"));
        return sessionFor(user);
    }

    public void changePassword(Long userId, String currentPassword, String newPassword) {
        User user = users.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));

        if (!encoder.matches(currentPassword, user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "La contrasena actual no coincide");
        }
        if (newPassword.length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La contrasena nueva debe tener al menos 8 caracteres");
        }
        if (encoder.matches(newPassword, user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La contrasena nueva debe ser distinta de la actual");
        }

        user.setPasswordHash(encoder.encode(newPassword));
        user.setMustChangePassword(false);
        users.save(user);
    }

    public Session refresh(String refreshToken) {
        try {
            var claims = jwt.parse(refreshToken);
            if (!"refresh".equals(claims.get("typ", String.class))) throw new JwtException("tipo invalido");
            User user = users.findById(Long.valueOf(claims.getSubject()))
                    .filter(User::isActive)
                    .orElseThrow(() -> new JwtException("usuario inactivo"));
            return sessionFor(user);
        } catch (JwtException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesion expirada");
        }
    }

    private Session sessionFor(User user) {
        String role = user.getRole().name();
        return new Session(jwt.issueAccess(user.getId(), role), jwt.issueRefresh(user.getId(), role),
                role, user.getFullName(), user.getId(), user.isMustChangePassword());
    }
}
