package co.edu.ggm.asistencia.user.service;

import co.edu.ggm.asistencia.shared.service.JwtService;
import co.edu.ggm.asistencia.user.model.User;
import co.edu.ggm.asistencia.user.repository.UserRepository;
import io.jsonwebtoken.JwtException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {

    public record Session(String token, String refreshToken, String role, String fullName, Long userId) {}

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
                role, user.getFullName(), user.getId());
    }
}
