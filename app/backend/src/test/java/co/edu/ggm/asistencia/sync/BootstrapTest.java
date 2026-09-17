package co.edu.ggm.asistencia.sync;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.service.JwtService;
import co.edu.ggm.asistencia.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class BootstrapTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;

    private String tokenDocente() {
        var u = users.findByEmailAndActiveTrue("fpalacios@ggm.edu.co").orElseThrow();
        return "Bearer " + jwt.issueAccess(u.getId(), "DOCENTE");
    }

    /** Crea un segundo docente con un bloque en 602 (la semilla base solo trae
     * a fpalacios con un bloque en 601), y devuelve el id del nuevo docente. */
    private Long sembrarSegundoDocenteConOtroCurso() {
        jdbcBase.update("INSERT INTO users (email, password_hash, full_name, role) " +
                "VALUES ('otrodocente@ggm.edu.co', 'x', 'Otro Docente', 'DOCENTE') " +
                "ON CONFLICT (email) DO NOTHING");
        Long otroId = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = 'otrodocente@ggm.edu.co'", Long.class);
        jdbcBase.update(
                "INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time, subject_id, teacher_id) " +
                "SELECT '602', 1, 2, '07:20', '08:10', s.id, ? FROM subjects s WHERE s.name = 'Espanol' " +
                "AND NOT EXISTS (SELECT 1 FROM schedule_blocks WHERE teacher_id = ?)",
                otroId, otroId);
        return otroId;
    }

    @Test
    void el_admin_recibe_bloques_de_mas_de_un_curso() throws Exception {
        // admin@ggm.edu.co no tiene bloques propios (cero); como ADMIN debe ver
        // los de todo el colegio (aqui, 601 y 602), no los suyos.
        sembrarSegundoDocenteConOtroCurso();

        String json = mvc.perform(get("/api/sync/bootstrap").header("Authorization", tokenDe("admin@ggm.edu.co", "ADMIN")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var blocks = mapper.readTree(json).get("blocks");
        assertThat(blocks.size()).isGreaterThan(1);
        java.util.Set<String> grados = new java.util.HashSet<>();
        blocks.forEach(b -> grados.add(b.get("grade").asText()));
        assertThat(grados.size()).isGreaterThan(1);
    }

    @Test
    void el_coordinador_recibe_bloques_de_mas_de_un_curso() throws Exception {
        sembrarSegundoDocenteConOtroCurso();

        String json = mvc.perform(get("/api/sync/bootstrap").header("Authorization", tokenDe("coord@ggm.edu.co", "COORDINADOR")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var blocks = mapper.readTree(json).get("blocks");
        assertThat(blocks.size()).isGreaterThan(1);
        java.util.Set<String> grados = new java.util.HashSet<>();
        blocks.forEach(b -> grados.add(b.get("grade").asText()));
        assertThat(grados.size()).isGreaterThan(1);
    }

    @Test
    void un_docente_no_ve_los_bloques_de_otro_docente() throws Exception {
        // Dos docentes con cursos distintos: fpalacios dicta 601, el sembrado
        // dicta 602. Cada uno debe ver solo el suyo: esto es lo que impide que
        // el arreglo del bug se pase de largo y filtre datos entre docentes.
        Long otroId = sembrarSegundoDocenteConOtroCurso();
        String tokenOtro = "Bearer " + jwt.issueAccess(otroId, "DOCENTE");

        String jsonUno = mvc.perform(get("/api/sync/bootstrap").header("Authorization", tokenDocente()))
                .andReturn().getResponse().getContentAsString();
        String jsonOtro = mvc.perform(get("/api/sync/bootstrap").header("Authorization", tokenOtro))
                .andReturn().getResponse().getContentAsString();

        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var gradosUno = new java.util.HashSet<String>();
        mapper.readTree(jsonUno).get("blocks").forEach(b -> gradosUno.add(b.get("grade").asText()));
        var gradosOtro = new java.util.HashSet<String>();
        mapper.readTree(jsonOtro).get("blocks").forEach(b -> gradosOtro.add(b.get("grade").asText()));

        assertThat(gradosUno).containsExactly("601");
        assertThat(gradosOtro).containsExactly("602");
        assertThat(java.util.Collections.disjoint(gradosUno, gradosOtro)).isTrue();
    }

    @Test
    void el_docente_recibe_solo_sus_bloques_y_los_estudiantes_de_esos_grados() throws Exception {
        mvc.perform(get("/api/sync/bootstrap").header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.blocks.length()").value(1))
           .andExpect(jsonPath("$.blocks[0].grade").value("601"))
           .andExpect(jsonPath("$.blocks[0].subject").value("Matematicas"))
           // el estudiante de 602 NO debe venir: ese docente no dicta ese grado
           .andExpect(jsonPath("$.students.length()").value(2))
           .andExpect(jsonPath("$.students[0].fullName").value("LINDA ISABELLA AREVALO FIGUEROA"));
    }

    @Test
    void la_respuesta_cumple_el_contrato_del_fixture() throws Exception {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        String json = mvc.perform(get("/api/sync/bootstrap").header("Authorization", tokenDocente()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        var real = mapper.readTree(json);
        var fixture = mapper.readTree(new java.io.File("../contracts/fixtures/bootstrap.json"));

        assertThat(campos(real)).containsExactlyInAnyOrderElementsOf(campos(fixture));
        assertThat(campos(real.get("blocks").get(0)))
                .containsExactlyInAnyOrderElementsOf(campos(fixture.get("blocks").get(0)));
        assertThat(campos(real.get("students").get(0)))
                .containsExactlyInAnyOrderElementsOf(campos(fixture.get("students").get(0)));
        // cycleDay solo viaja en los dias LECTIVO (non_null): se busca uno de esos.
        var lectivo = java.util.stream.StreamSupport.stream(real.get("schoolDays").spliterator(), false)
                .filter(d -> "LECTIVO".equals(d.get("dayType").asText())).findFirst().orElseThrow();
        assertThat(campos(lectivo)).contains("calendarDate", "dayType", "cycleDay");
    }

    private static java.util.List<String> campos(com.fasterxml.jackson.databind.JsonNode nodo) {
        var nombres = new java.util.ArrayList<String>();
        nodo.fieldNames().forEachRemaining(nombres::add);
        return nombres;
    }

    @Test
    void la_hora_del_bloque_no_se_desplaza_por_zona_horaria() throws Exception {
        // La semilla tiene 06:30. Una hora de clase no tiene zona horaria: si
        // aparece 01:30 es que alguien volvio a poner hibernate.jdbc.time_zone.
        mvc.perform(get("/api/sync/bootstrap").header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.blocks[0].startTime").value("06:30"));
    }

    @Test
    void el_bloque_dice_en_que_aula_es() throws Exception {
        jdbcBase.update("UPDATE schedule_blocks SET room = 'Aula 201' WHERE id = 1");
        mvc.perform(get("/api/sync/bootstrap").header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.blocks[0].room").value("Aula 201"));
    }

    @Test
    void un_bloque_sin_aula_no_rompe_nada() throws Exception {
        jdbcBase.update("UPDATE schedule_blocks SET room = NULL WHERE id = 1");
        mvc.perform(get("/api/sync/bootstrap").header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.blocks[0].grade").value("601"));
    }
}
