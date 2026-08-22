package co.edu.ggm.asistencia.user;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Estos tests crean su propio usuario (dominio @clavetest.co) y NO tocan la semilla:
 * cambiarle la contrasena a un usuario semilla rompe a las demas clases de test.
 */
@AutoConfigureMockMvc
class CambioClaveTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private static final String CORREO = "prueba@clavetest.co";

    // Todas las pruebas de esta clase reutilizan el mismo correo: sin limpiarlo antes
    // de cada una, la segunda choca con un 409 contra la que dejo la anterior.
    @BeforeEach
    void limpiar() {
        jdbcBase.update("DELETE FROM users WHERE email = ?", CORREO);
    }

    private String crearYEntrar() throws Exception {
        mvc.perform(post("/api/admin/users").header("Authorization", tokenDe("admin@ggm.edu.co", "ADMIN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","fullName":"Persona De Prueba","role":"DOCENTE"}
                        """.formatted(CORREO)))
           .andExpect(status().isOk());
        return login(CORREO, "cambiar123");
    }

    private String login(String correo, String clave) throws Exception {
        String cuerpo = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"%s"}
                                """.formatted(correo, clave)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + cuerpo.replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
    }

    private String cambio(String actual, String nueva) {
        return """
               {"currentPassword":"%s","newPassword":"%s"}
               """.formatted(actual, nueva);
    }

    @Test
    void un_usuario_nuevo_llega_obligado_a_cambiar_la_clave() throws Exception {
        crearYEntrar();
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"cambiar123"}
                                """.formatted(CORREO)))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.mustChangePassword").value(true));
    }

    @Test
    void cambiar_la_clave_funciona_y_quita_la_obligacion() throws Exception {
        String token = crearYEntrar();

        mvc.perform(post("/api/auth/change-password").header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cambio("cambiar123", "unaClaveNueva")))
           .andExpect(status().isNoContent());

        // La vieja ya no sirve
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"cambiar123"}
                                """.formatted(CORREO)))
           .andExpect(status().isUnauthorized());

        // La nueva si, y ya no obliga a cambiarla
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"unaClaveNueva"}
                                """.formatted(CORREO)))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.mustChangePassword").value(false));
    }

    @Test
    void no_se_puede_cambiar_sin_saber_la_actual() throws Exception {
        String token = crearYEntrar();
        mvc.perform(post("/api/auth/change-password").header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cambio("noEsLaActual", "unaClaveNueva")))
           .andExpect(status().isUnauthorized());
    }

    @Test
    void la_clave_nueva_debe_tener_al_menos_ocho_caracteres() throws Exception {
        String token = crearYEntrar();
        mvc.perform(post("/api/auth/change-password").header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cambio("cambiar123", "corta")))
           .andExpect(status().isBadRequest());
    }

    @Test
    void la_clave_nueva_no_puede_ser_igual_a_la_actual() throws Exception {
        String token = crearYEntrar();
        mvc.perform(post("/api/auth/change-password").header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cambio("cambiar123", "cambiar123")))
           .andExpect(status().isBadRequest());
    }

    @Test
    void sin_token_no_se_puede_cambiar_la_clave_de_nadie() throws Exception {
        mvc.perform(post("/api/auth/change-password").contentType(MediaType.APPLICATION_JSON)
                        .content(cambio("cambiar123", "unaClaveNueva")))
           .andExpect(status().isUnauthorized());
    }

    @Test
    void restablecer_desde_administracion_vuelve_a_obligar_el_cambio() throws Exception {
        String token = crearYEntrar();
        mvc.perform(post("/api/auth/change-password").header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(cambio("cambiar123", "unaClaveNueva"))).andExpect(status().isNoContent());

        Long id = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, CORREO);
        mvc.perform(post("/api/admin/users/" + id + "/reset-password")
                .header("Authorization", tokenDe("admin@ggm.edu.co", "ADMIN")))
           .andExpect(status().isOk());

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"cambiar123"}
                                """.formatted(CORREO)))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.mustChangePassword").value(true));
    }
}
