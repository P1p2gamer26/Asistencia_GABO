package co.edu.ggm.asistencia.user;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class AuthTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void login_correcto_devuelve_token_y_rol() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json("fpalacios@ggm.edu.co", "cambiar123")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.token").isNotEmpty())
           .andExpect(jsonPath("$.role").value("DOCENTE"))
           .andExpect(jsonPath("$.fullName").value("Francisco Palacios"));
    }

    @Test
    void login_con_password_incorrecta_devuelve_401() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json("fpalacios@ggm.edu.co", "nope")))
           .andExpect(status().isUnauthorized());
    }

    @Test
    void una_ruta_protegida_sin_token_devuelve_401() throws Exception {
        mvc.perform(get("/api/schedule/mine")).andExpect(status().isUnauthorized());
    }

    private static String json(String email, String password) {
        return "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}";
    }
}
