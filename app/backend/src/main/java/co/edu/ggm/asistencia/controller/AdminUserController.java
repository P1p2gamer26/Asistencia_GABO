package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.model.Role;
import co.edu.ggm.asistencia.model.User;
import co.edu.ggm.asistencia.service.AdminUserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserController {

    private final AdminUserService service;
    private final co.edu.ggm.asistencia.service.AccesoCursoService acceso;

    public AdminUserController(AdminUserService service, co.edu.ggm.asistencia.service.AccesoCursoService acceso) {
        this.service = service; this.acceso = acceso;
    }

    public record AssignmentsDto(List<String> grades) {}

    @GetMapping("/{id}/assignments")
    public AssignmentsDto assignments(@PathVariable Long id) {
        return new AssignmentsDto(acceso.asignados(id));
    }

    @PutMapping("/{id}/assignments")
    public AssignmentsDto setAssignments(@PathVariable Long id, @Valid @RequestBody AssignmentsDto body) {
        return new AssignmentsDto(acceso.reemplazar(id, body.grades() == null ? List.of() : body.grades()));
    }

    public record UserDto(Long id, String email, String fullName, String role, boolean active) {
        static UserDto de(User u) {
            return new UserDto(u.getId(), u.getEmail(), u.getFullName(), u.getRole().name(), u.isActive());
        }
    }
    public record CreateRequest(@Email @NotBlank String email, @NotBlank String fullName,
                                @NotNull Role role) {}
    // email opcional: los docentes nacen con un correo provisional hasta que el colegio da el real.
    public record UpdateRequest(@Email String email, @NotBlank String fullName, @NotNull Role role, boolean active) {}
    public record ResetResponse(String temporaryPassword) {}

    @GetMapping
    public List<UserDto> list(@RequestParam(required = false) Role role,
                              @RequestParam(required = false) String query) {
        return service.list(role, query).stream().map(UserDto::de).toList();
    }

    @PostMapping
    public UserDto create(@Valid @RequestBody CreateRequest req) {
        return UserDto.de(service.create(req.email(), req.fullName(), req.role()));
    }

    @PutMapping("/{id}")
    public UserDto update(@PathVariable Long id, @Valid @RequestBody UpdateRequest req) {
        return UserDto.de(service.update(id, req.email(), req.fullName(), req.role(), req.active()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.delete(id, co.edu.ggm.asistencia.service.JwtService.currentUserId());
    }

    @PostMapping("/{id}/reset-password")
    public ResetResponse reset(@PathVariable Long id) {
        return new ResetResponse(service.resetPassword(id));
    }
}
