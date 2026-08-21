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

    public AdminUserController(AdminUserService service) { this.service = service; }

    public record UserDto(Long id, String email, String fullName, String role, boolean active) {
        static UserDto de(User u) {
            return new UserDto(u.getId(), u.getEmail(), u.getFullName(), u.getRole().name(), u.isActive());
        }
    }
    public record CreateRequest(@Email @NotBlank String email, @NotBlank String fullName,
                                @NotNull Role role) {}
    public record UpdateRequest(@NotBlank String fullName, @NotNull Role role, boolean active) {}
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
        return UserDto.de(service.update(id, req.fullName(), req.role(), req.active()));
    }

    @PostMapping("/{id}/reset-password")
    public ResetResponse reset(@PathVariable Long id) {
        return new ResetResponse(service.resetPassword(id));
    }
}
