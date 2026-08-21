package co.edu.ggm.asistencia.admin;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.service.JwtService;
import co.edu.ggm.asistencia.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class ImportTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;

    private String tokenAdmin() {
        var u = users.findByEmailAndActiveTrue("admin@ggm.edu.co").orElseThrow();
        return "Bearer " + jwt.issueAccess(u.getId(), "ADMIN");
    }

    private MockMultipartFile csv(String contenido) {
        return new MockMultipartFile("file", "estudiantes.csv", "text/csv",
                contenido.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void importa_estudiantes_nuevos_y_actualiza_los_existentes_sin_duplicar() throws Exception {
        String contenido = """
                document_id,first_name,middle_name,last_name,second_surname,grade
                2020202020,MARIA,JOSE,GOMEZ,PEREZ,701
                2020202021,CARLOS,ANDRES,MORA,DIAZ,702
                """;
        mvc.perform(multipart("/api/admin/import/students").file(csv(contenido))
                        .header("Authorization", tokenAdmin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.imported").value(2))
           .andExpect(jsonPath("$.errors.length()").value(0));

        // Reimportar actualiza en vez de duplicar. Se usan documentos propios del test
        // y NO los de la semilla: mutar la semilla rompia a SchemaTest y ReportTest
        // segun el orden en que Surefire ejecutara las clases.
        mvc.perform(multipart("/api/admin/import/students").file(csv(contenido))
                        .header("Authorization", tokenAdmin()))
           .andExpect(jsonPath("$.imported").value(2));
    }

    @Test
    void una_linea_mal_formada_se_reporta_sin_abortar_la_importacion() throws Exception {
        String contenido = """
                document_id,first_name,middle_name,last_name,second_surname,grade
                3030303030,PEDRO,,RUIZ,,801
                esto,no,sirve
                """;
        mvc.perform(multipart("/api/admin/import/students").file(csv(contenido))
                        .header("Authorization", tokenAdmin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.imported").value(1))
           .andExpect(jsonPath("$.errors.length()").value(1));
    }

    @Test
    void un_docente_no_puede_importar() throws Exception {
        mvc.perform(multipart("/api/admin/import/students").file(csv("document_id\n1"))
                        .header("Authorization", "Bearer " + jwt.issueAccess(1L, "DOCENTE")))
           .andExpect(status().isForbidden());
    }
}
