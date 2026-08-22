package co.edu.ggm.asistencia.user;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.service.LoginAttemptService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class IntentosLoginTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired LoginAttemptService intentos;

    private void intento(String correo, String clave, int esperado) throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"%s"}
                                """.formatted(correo, clave)))
           .andExpect(status().is(esperado));
    }

    @AfterEach
    void limpiar() {
        intentos.success("objetivo@intentostest.co");
        intentos.success("limpia@intentostest.co");
        intentos.success("aislado@intentostest.co");
        intentos.success("fpalacios@ggm.edu.co");
    }

    @Test
    void tras_cinco_fallos_el_correo_queda_bloqueado() throws Exception {
        String correo = "objetivo@intentostest.co";
        mvc.perform(post("/api/admin/users").header("Authorization", tokenDe("admin@ggm.edu.co", "ADMIN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","fullName":"Objetivo","role":"DOCENTE"}
                        """.formatted(correo))).andExpect(status().isOk());

        for (int i = 0; i < 5; i++) intento(correo, "incorrecta", 401);

        // El sexto ya no es 401 sino 429, y ni siquiera con la clave correcta entra.
        intento(correo, "incorrecta", 429);
        intento(correo, "cambiar123", 429);
    }

    @Test
    void un_acceso_correcto_limpia_el_contador() throws Exception {
        String correo = "limpia@intentostest.co";
        mvc.perform(post("/api/admin/users").header("Authorization", tokenDe("admin@ggm.edu.co", "ADMIN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","fullName":"Limpia","role":"DOCENTE"}
                        """.formatted(correo))).andExpect(status().isOk());

        for (int i = 0; i < 4; i++) intento(correo, "incorrecta", 401);
        intento(correo, "cambiar123", 200);
        // Tras entrar bien, vuelve a tener los cinco intentos completos.
        for (int i = 0; i < 5; i++) intento(correo, "incorrecta", 401);
    }

    @Test
    void bloquear_un_correo_no_bloquea_a_los_demas() throws Exception {
        String correo = "aislado@intentostest.co";
        for (int i = 0; i < 6; i++) intento(correo, "incorrecta", i < 5 ? 401 : 429);
        // Un docente distinto sigue pudiendo entrar: el bloqueo es por correo, no global.
        intento("fpalacios@ggm.edu.co", "cambiar123", 200);
    }
}
