package co.edu.ggm.asistencia.service;

import co.edu.ggm.asistencia.model.Role;
import co.edu.ggm.asistencia.model.User;
import co.edu.ggm.asistencia.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class AdminUserService {

    /** Contrasena con la que nace un usuario y a la que vuelve tras un reseteo. */
    public static final String TEMPORAL = "cambiar123";

    private final UserRepository users;
    private final PasswordEncoder encoder;

    public AdminUserService(UserRepository users, PasswordEncoder encoder) {
        this.users = users; this.encoder = encoder;
    }

    public List<User> list(Role role, String query) {
        List<User> base = role == null ? users.findAllByOrderByFullName()
                                       : users.findByRoleOrderByFullName(role);
        if (query == null || query.isBlank()) return base;
        String q = query.trim().toLowerCase();
        return base.stream()
                .filter(u -> u.getFullName().toLowerCase().contains(q)
                          || u.getEmail().toLowerCase().contains(q))
                .toList();
    }

    @Transactional
    public User create(String email, String fullName, Role role) {
        String correo = email.trim().toLowerCase();
        if (users.existsByEmail(correo)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe un usuario con ese correo");
        }
        User u = new User();
        u.setEmail(correo);
        u.setFullName(fullName.trim());
        u.setRole(role);
        u.setActive(true);
        u.setPasswordHash(encoder.encode(TEMPORAL));
        return users.save(u);
    }

    @Transactional
    public User update(Long id, String fullName, Role role, boolean active) {
        User u = users.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No existe ese usuario"));
        u.setFullName(fullName.trim());
        u.setRole(role);
        u.setActive(active);
        return users.save(u);
    }

    @Transactional
    public String resetPassword(Long id) {
        User u = users.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No existe ese usuario"));
        u.setPasswordHash(encoder.encode(TEMPORAL));
        users.save(u);
        return TEMPORAL;
    }
}
