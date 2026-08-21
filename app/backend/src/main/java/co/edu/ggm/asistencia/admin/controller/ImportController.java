package co.edu.ggm.asistencia.admin.controller;

import co.edu.ggm.asistencia.student.repository.StudentRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/admin/import")
@PreAuthorize("hasRole('ADMIN')")
public class ImportController {

    private final StudentRepository students;

    public ImportController(StudentRepository students) { this.students = students; }

    public record ImportResult(int imported, List<String> errors) {}

    @PostMapping("/students")
    @Transactional
    public ImportResult students(@RequestParam("file") MultipartFile file) throws IOException {
        List<String> errores = new ArrayList<>();
        int importados = 0;
        int numero = 0;

        try (var reader = new BufferedReader(
                new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String linea;
            while ((linea = reader.readLine()) != null) {
                numero++;
                if (numero == 1 || linea.isBlank()) continue;   // cabecera
                String[] c = linea.split(",", -1);
                if (c.length < 6) {
                    errores.add("Linea " + numero + ": se esperaban 6 columnas y llegaron " + c.length);
                    continue;
                }
                String documento = c[0].trim();
                if (documento.isEmpty() || c[1].isBlank() || c[3].isBlank()) {
                    errores.add("Linea " + numero + ": documento, primer nombre y primer apellido son obligatorios");
                    continue;
                }
                students.upsert(documento, c[1].trim(), vacioANull(c[2]), c[3].trim(),
                        vacioANull(c[4]), c[5].trim());
                importados++;
            }
        }
        return new ImportResult(importados, errores);
    }

    private static String vacioANull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
