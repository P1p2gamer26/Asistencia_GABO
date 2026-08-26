package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.model.Student;
import co.edu.ggm.asistencia.service.AdminStudentService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/students")
@PreAuthorize("hasRole('ADMIN')")
public class AdminStudentController {

    private final AdminStudentService service;

    public AdminStudentController(AdminStudentService service) { this.service = service; }

    public record StudentAdminDto(Long id, String documentId, String fullName,
                                  String firstName, String middleName,
                                  String lastName, String secondSurname,
                                  String grade, boolean active) {
        static StudentAdminDto de(Student s) {
            return new StudentAdminDto(s.getId(), s.getDocumentId(), s.fullName(),
                    s.getFirstName(), s.getMiddleName(), s.getLastName(), s.getSecondSurname(),
                    s.getGrade(), s.isActive());
        }
    }

    public record CreateRequest(@NotBlank String documentId, @NotBlank String firstName,
                                String middleName, @NotBlank String lastName,
                                String secondSurname, @NotBlank String grade) {}

    public record UpdateRequest(@NotBlank String firstName, String middleName,
                                @NotBlank String lastName, String secondSurname,
                                @NotBlank String grade, boolean active) {}

    /** borradoDefinitivo=false significa que se desactivo para conservar su historial. */
    public record DeleteResponse(boolean borradoDefinitivo) {}

    @GetMapping
    public List<StudentAdminDto> list(@RequestParam(required = false) String grade,
                                      @RequestParam(required = false) String query) {
        return service.list(grade, query).stream().map(StudentAdminDto::de).toList();
    }

    @PostMapping
    public StudentAdminDto create(@Valid @RequestBody CreateRequest req) {
        return StudentAdminDto.de(service.create(req.documentId(), req.firstName(),
                req.middleName(), req.lastName(), req.secondSurname(), req.grade()));
    }

    @PutMapping("/{id}")
    public StudentAdminDto update(@PathVariable Long id, @Valid @RequestBody UpdateRequest req) {
        return StudentAdminDto.de(service.update(id, req.firstName(), req.middleName(),
                req.lastName(), req.secondSurname(), req.grade(), req.active()));
    }

    @DeleteMapping("/{id}")
    public DeleteResponse delete(@PathVariable Long id) {
        return new DeleteResponse(service.delete(id));
    }
}
