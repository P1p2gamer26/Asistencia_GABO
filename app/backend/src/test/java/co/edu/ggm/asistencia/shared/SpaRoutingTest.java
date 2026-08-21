package co.edu.ggm.asistencia.shared;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class SpaRoutingTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void una_ruta_de_la_spa_reenvia_al_index() throws Exception {
        mvc.perform(get("/asistencia")).andExpect(forwardedUrl("/index.html"));
    }

    @Test
    void otra_ruta_de_la_spa_tambien() throws Exception {
        mvc.perform(get("/dashboard")).andExpect(forwardedUrl("/index.html"));
    }

    @Test
    void las_rutas_de_api_no_se_reenvian() throws Exception {
        // Sin token debe seguir dando 401, no el index de la SPA.
        mvc.perform(get("/api/schedule/mine")).andExpect(status().isUnauthorized());
    }

    @Test
    void los_ficheros_con_extension_no_se_reenvian() throws Exception {
        // Un .js inexistente debe dar 404, no devolver el index disfrazado de script.
        mvc.perform(get("/assets/no-existe.js")).andExpect(status().isNotFound());
    }
}
