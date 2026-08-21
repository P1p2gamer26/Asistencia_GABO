package co.edu.ggm.asistencia.config;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Con el frontend en Vercel y la API en Fly.io las peticiones son de origen cruzado.
 * Los origenes permitidos son configuracion, no codigo: el dominio de Vercel no se
 * sabe hasta que se despliega.
 */
@AutoConfigureMockMvc
class CorsTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void acepta_el_origen_configurado() throws Exception {
        mvc.perform(options("/api/auth/login")
                        .header("Origin", "https://asistencia-ggm.vercel.app")
                        .header("Access-Control-Request-Method", "POST"))
           .andExpect(status().isOk())
           .andExpect(header().string("Access-Control-Allow-Origin",
                   "https://asistencia-ggm.vercel.app"));
    }

    @Test
    void sigue_aceptando_el_servidor_de_desarrollo() throws Exception {
        mvc.perform(options("/api/auth/login")
                        .header("Origin", "http://localhost:5173")
                        .header("Access-Control-Request-Method", "POST"))
           .andExpect(status().isOk());
    }

    @Test
    void rechaza_un_origen_que_no_esta() throws Exception {
        mvc.perform(options("/api/auth/login")
                        .header("Origin", "https://sitio-de-otro.com")
                        .header("Access-Control-Request-Method", "POST"))
           .andExpect(status().isForbidden());
    }
}
