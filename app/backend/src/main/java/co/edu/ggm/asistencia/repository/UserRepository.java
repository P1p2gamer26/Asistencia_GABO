package co.edu.ggm.asistencia.repository;

import co.edu.ggm.asistencia.model.Role;
import co.edu.ggm.asistencia.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmailAndActiveTrue(String email);

    java.util.List<User> findByRoleOrderByFullName(Role role);

    java.util.List<User> findAllByOrderByFullName();

    boolean existsByEmail(String email);
}
