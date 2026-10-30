package co.edu.ggm.asistencia.repository;

import co.edu.ggm.asistencia.model.Role;
import co.edu.ggm.asistencia.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmailAndActiveTrue(String email);

    // Primer apellido, segundo apellido, nombres; con las columnas vacias cae a full_name.
    String ORDEN = " order by lower(coalesce(nullif(u.lastName, ''), u.fullName)),"
            + " lower(coalesce(u.secondSurname, '')), lower(coalesce(u.firstNames, '')), u.id";

    @Query("select u from User u where u.role = :role" + ORDEN)
    java.util.List<User> findByRoleOrderByApellidos(@Param("role") Role role);

    @Query("select u from User u" + ORDEN)
    java.util.List<User> findAllOrderByApellidos();

    boolean existsByEmail(String email);

    long countByRoleAndActiveTrue(Role role);

    @Query(value = "select count(*) from schedule_blocks where teacher_id = :id", nativeQuery = true)
    long contarBloques(@Param("id") Long id);
}
