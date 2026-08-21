package co.edu.ggm.asistencia.admin;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Estos tests crean sus propios usuarios (sufijo .admintest) y NO tocan los de la
 * semilla: mutarlos rompe a otras clases segun el orden de ejecucion.
 */
@AutoConfigureMockMvc
class AdminUserTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private String admin() { return tokenDe("admin@ggm.edu.co", "ADMIN"); }

    private String crear(String email, String rol) {
        return """
               {"email":"%s","fullName":"Persona De Prueba","role":"%s"}
               """.formatted(email, rol);
    }

    @Test
    void crea_un_docente_con_contrasena_temporal_y_puede_entrar_con_ella() throws Exception {
        mvc.perform(post("/api/admin/users").header("Authorization", admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(crear("nuevo.docente@admintest.co", "DOCENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.email").value("nuevo.docente@admintest.co"))
           .andExpect(jsonPath("$.role").value("DOCENTE"))
           .andExpect(jsonPath("$.active").value(true));

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nuevo.docente@admintest.co\",\"password\":\"cambiar123\"}"))
           .andExpect(status().isOk());
    }

    @Test
    void no_permite_dos_usuarios_con_el_mismo_correo() throws Exception {
        mvc.perform(post("/api/admin/users").header("Authorization", admin())
                .contentType(MediaType.APPLICATION_JSON)
                .content(crear("repetido@admintest.co", "DOCENTE"))).andExpect(status().isOk());

        mvc.perform(post("/api/admin/users").header("Authorization", admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(crear("repetido@admintest.co", "DOCENTE")))
           .andExpect(status().isConflict());
    }

    @Test
    void desactivar_a_alguien_le_impide_entrar_pero_no_lo_borra() throws Exception {
        String cuerpo = mvc.perform(post("/api/admin/users").header("Authorization", admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(crear("baja@admintest.co", "DOCENTE")))
                .andReturn().getResponse().getContentAsString();
        long id = Long.parseLong(cuerpo.replaceAll(".*\"id\":(\\d+).*", "$1"));

        mvc.perform(put("/api/admin/users/" + id).header("Authorization", admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fullName\":\"Persona De Prueba\",\"role\":\"DOCENTE\",\"active\":false}"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.active").value(false));

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"baja@admintest.co\",\"password\":\"cambiar123\"}"))
           .andExpect(status().isUnauthorized());

        // Sigue existiendo: la baja es logica, para no romper la trazabilidad.
        assertThat(jdbcBase.queryForObject(
                "SELECT count(*) FROM users WHERE email = 'baja@admintest.co'",
                Integer.class)).isEqualTo(1);
    }

    @Test
    void el_listado_filtra_por_rol() throws Exception {
        mvc.perform(post("/api/admin/users").header("Authorization", admin())
                .contentType(MediaType.APPLICATION_JSON)
                .content(crear("coordi@admintest.co", "COORDINADOR"))).andExpect(status().isOk());

        mvc.perform(get("/api/admin/users").param("role", "COORDINADOR")
                        .header("Authorization", admin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[?(@.email=='coordi@admintest.co')]").exists())
           .andExpect(jsonPath("$[?(@.role=='DOCENTE')]").doesNotExist());
    }

    @Test
    void reset_de_contrasena_deja_entrar_con_la_temporal() throws Exception {
        String cuerpo = mvc.perform(post("/api/admin/users").header("Authorization", admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(crear("olvidadiza@admintest.co", "DOCENTE")))
                .andReturn().getResponse().getContentAsString();
        long id = Long.parseLong(cuerpo.replaceAll(".*\"id\":(\\d+).*", "$1"));

        mvc.perform(post("/api/admin/users/" + id + "/reset-password")
                        .header("Authorization", admin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.temporaryPassword").value("cambiar123"));

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"olvidadiza@admintest.co\",\"password\":\"cambiar123\"}"))
           .andExpect(status().isOk());
    }

    @Test
    void un_coordinador_no_puede_administrar_usuarios() throws Exception {
        mvc.perform(get("/api/admin/users")
                        .header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR")))
           .andExpect(status().isForbidden());
    }
}
