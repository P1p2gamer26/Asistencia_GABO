package co.edu.ggm.asistencia.calendar;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.service.CalendarService;
import co.edu.ggm.asistencia.service.JwtService;
import co.edu.ggm.asistencia.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class CalendarTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;
    @Autowired CalendarService service;

    private String token(String email, String rol) {
        var u = users.findByEmailAndActiveTrue(email).orElseThrow();
        return "Bearer " + jwt.issueAccess(u.getId(), rol);
    }

    @Test
    void devuelve_el_rango_pedido_con_su_tipo_de_dia() throws Exception {
        mvc.perform(get("/api/calendar/school-days")
                        .param("from", "2026-07-20").param("to", "2026-07-21")
                        .header("Authorization", token("fpalacios@ggm.edu.co", "DOCENTE")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.length()").value(2))
           .andExpect(jsonPath("$[0].calendarDate").value("2026-07-20"))
           .andExpect(jsonPath("$[0].dayType").value("FESTIVO"));
    }

    @Test
    void isSchoolDay_distingue_lectivo_de_festivo() {
        assertThat(service.isSchoolDay(LocalDate.parse("2026-07-20"))).isFalse();  // Independencia
        assertThat(service.isSchoolDay(LocalDate.parse("2026-07-21"))).isTrue();   // martes normal
        assertThat(service.isSchoolDay(LocalDate.parse("2026-07-19"))).isFalse();  // domingo, no existe
    }

    @Test
    void coordinacion_puede_suspender_un_dia_y_la_cache_se_entera() throws Exception {
        LocalDate dia = LocalDate.parse("2026-09-15");
        assertThat(service.isSchoolDay(dia)).isTrue();

        mvc.perform(put("/api/calendar/school-days/2026-09-15")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dayType\":\"SUSPENDIDO\",\"description\":\"Paro de transporte\"}")
                        .header("Authorization", token("coord@ggm.edu.co", "COORDINADOR")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.dayType").value("SUSPENDIDO"));

        assertThat(service.isSchoolDay(dia)).isFalse();
    }

    @Test
    void un_docente_no_puede_modificar_el_calendario() throws Exception {
        mvc.perform(put("/api/calendar/school-days/2026-09-16")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dayType\":\"SUSPENDIDO\"}")
                        .header("Authorization", token("fpalacios@ggm.edu.co", "DOCENTE")))
           .andExpect(status().isForbidden());
    }
}
