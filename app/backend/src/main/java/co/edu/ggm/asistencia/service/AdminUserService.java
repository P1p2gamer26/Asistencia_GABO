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
        List<User> base = role == null ? users.findAllOrderByApellidos()
                                       : users.findByRoleOrderByApellidos(role);
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
        u.setMustChangePassword(true);
        u.setPasswordHash(encoder.encode(TEMPORAL));
        return users.save(u);
    }

    @Transactional
    public User update(Long id, String email, String fullName, Role role, boolean active) {
        User u = users.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No existe ese usuario"));
        if (email != null && !email.isBlank()) {
            String correo = email.trim().toLowerCase();
            if (!correo.equals(u.getEmail()) && users.existsByEmail(correo)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe un usuario con ese correo");
            }
            u.setEmail(correo);
        }
        u.setFullName(fullName.trim());
        u.setRole(role);
        u.setActive(active);
        return users.save(u);
    }

    /**
     * Borra solo la cuenta. La asistencia y lo que esa persona creo se conservan (V69: la
     * autoria pasa a NULL y el nombre queda en el registro). Un docente con bloques en el
     * horario no se borra: el bloque necesita docente, hay que reasignarlo antes.
     */
    @Transactional
    public void delete(Long id, Long actorId) {
        User u = users.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No existe ese usuario"));
        if (id.equals(actorId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No puedes borrar tu propia cuenta");
        }
        if (u.getRole() == Role.ADMIN && u.isActive() && users.countByRoleAndActiveTrue(Role.ADMIN) <= 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No se puede borrar al unico administrador activo");
        }
        long bloques = users.contarBloques(id);
        if (bloques > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Tiene " + bloques
                    + " bloques en el horario. Reasignalos a otro docente antes de borrar la cuenta, "
                    + "o desactivala si solo quieres que no entre.");
        }
        users.delete(u);
        users.flush();
    }

    @Transactional
    public String resetPassword(Long id) {
        User u = users.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No existe ese usuario"));
        u.setPasswordHash(encoder.encode(TEMPORAL));
        u.setMustChangePassword(true);
        users.save(u);
        return TEMPORAL;
    }
}
