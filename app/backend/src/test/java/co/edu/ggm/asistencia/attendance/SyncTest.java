package co.edu.ggm.asistencia.attendance;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import co.edu.ggm.asistencia.service.JwtService;
import co.edu.ggm.asistencia.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class SyncTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;

    private String token() {
        var u = users.findByEmailAndActiveTrue("fpalacios@ggm.edu.co").orElseThrow();
        return "Bearer " + jwt.issueAccess(u.getId(), "DOCENTE");
    }

    private Long studentId(String doc) {
        return jdbc.queryForObject("SELECT id FROM students WHERE document_id = ?", Long.class, doc);
    }

    private Long blockId() {
        return jdbc.queryForObject("""
                SELECT b.id
                FROM schedule_blocks b
                WHERE b.grade = '601' AND b.weekday = 1 AND b.block_no = 1
                """, Long.class);
    }

    @AfterEach
    void limpiarDatosDelTest() {
        // Estas fechas y UUID son exclusivos de esta clase. No dejar marcas en la
        // semilla evita que el orden de la suite cambie el resultado de otros tests.
        jdbc.update("""
                DELETE FROM attendance
                WHERE schedule_block_id = ?
                  AND class_date IN (DATE '2026-04-06', DATE '2026-04-07', DATE '2026-04-08',
                                     DATE '2026-04-09', DATE '2026-04-13', DATE '2026-04-14',
                                     DATE '2026-04-15', DATE '2026-07-19', DATE '2026-07-20')
                """, blockId());
        jdbc.update("""
                UPDATE schedule_blocks SET teacher_id =
                    (SELECT id FROM users WHERE email = 'fpalacios@ggm.edu.co')
                WHERE id = ?
                """, blockId());
    }

    private String lote(String uuid, Long student, String status, String fecha) {
        return """
               {"records":[{"id":"%s","studentId":%d,"scheduleBlockId":%d,
                "classDate":"%s","status":"%s","recordedAt":"%sT11:30:00Z"}]}
               """.formatted(uuid, student, blockId(), fecha, status, fecha);
    }

    private void enviar(String cuerpo, int aceptados) throws Exception {
        mvc.perform(post("/api/attendance/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(aceptados));
    }

    @Test
    void reenviar_el_mismo_lote_no_duplica_registros() throws Exception {
        String cuerpo = lote("11111111-1111-4111-8111-111111111111",
                             studentId("1010101010"), "P", "2026-04-06");
        enviar(cuerpo, 1);
        enviar(cuerpo, 1);   // reintento tras recuperar la senal
        Integer total = jdbc.queryForObject(
                "SELECT count(*) FROM attendance WHERE class_date = DATE '2026-04-06'", Integer.class);
        assertThat(total).isEqualTo(1);
    }

    @Test
    void otro_uuid_para_el_mismo_estudiante_bloque_y_fecha_actualiza_en_vez_de_fallar() throws Exception {
        Long student = studentId("1010101011");
        enviar(lote("22222222-2222-4222-8222-222222222222", student, "F", "2026-04-08"), 1);
        enviar(lote("33333333-3333-4333-8333-333333333333", student, "T", "2026-04-08"), 1);
        String estado = jdbc.queryForObject(
                "SELECT status FROM attendance WHERE student_id = ? AND class_date = DATE '2026-04-08'",
                String.class, student);
        assertThat(estado).isEqualTo("T");
    }

    @Test
    void reintento_despues_de_edicion_administrativa_no_la_pisa() throws Exception {
        Long student = studentId("1010101010");
        enviar(lote("12121212-1212-4121-8121-121212121212", student, "P", "2026-04-13"), 1);
        jdbc.update("UPDATE attendance SET status = 'E', edited_at = now() WHERE student_id = ? AND class_date = DATE '2026-04-13'", student);
        enviar(lote("13131313-1313-4131-8131-131313131313", student, "F", "2026-04-13"), 1);
        assertThat(jdbc.queryForObject("SELECT status FROM attendance WHERE student_id = ? AND class_date = DATE '2026-04-13'", String.class, student)).isEqualTo("E");
    }

    @Test
    void reintento_despues_de_borrado_no_lo_revive() throws Exception {
        Long student = studentId("1010101010");
        enviar(lote("14141414-1414-4141-8141-141414141414", student, "P", "2026-04-14"), 1);
        jdbc.update("UPDATE attendance SET deleted_at = now() WHERE student_id = ? AND class_date = DATE '2026-04-14'", student);
        enviar(lote("15151515-1515-4151-8151-151515151515", student, "F", "2026-04-14"), 1);
        assertThat(jdbc.queryForObject("SELECT deleted_at IS NOT NULL FROM attendance WHERE student_id = ? AND class_date = DATE '2026-04-14'", Boolean.class, student)).isTrue();
    }

    @Test
    void bloque_ajeno_se_rechaza_por_elemento() throws Exception {
        Long block = blockId();
        Long admin = jdbc.queryForObject("SELECT id FROM users WHERE email = 'admin@ggm.edu.co'", Long.class);
        jdbc.update("UPDATE schedule_blocks SET teacher_id = ? WHERE id = ?", admin, block);
        mvc.perform(post("/api/attendance/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(lote("16161616-1616-4161-8161-161616161616", studentId("1010101010"), "P", "2026-04-15")))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(0))
           .andExpect(jsonPath("$.rejected[0].reason").value("El bloque no es suyo"));
    }

    @Test
    void un_registro_invalido_no_tumba_el_resto_del_lote() throws Exception {
        String cuerpo = """
              {"records":[
                {"id":"44444444-4444-4444-8444-444444444444","studentId":%d,"scheduleBlockId":%d,
                 "classDate":"2026-04-07","status":"P","recordedAt":"2026-04-07T11:30:00Z"},
                {"id":"55555555-5555-4555-8555-555555555555","studentId":999999,"scheduleBlockId":%d,
                 "classDate":"2026-04-07","status":"P","recordedAt":"2026-04-07T11:30:00Z"}]}
              """.formatted(studentId("1010101010"), blockId(), blockId());
        mvc.perform(post("/api/attendance/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(1))
           .andExpect(jsonPath("$.rejected.length()").value(1));
    }

    @Test
    void una_asistencia_en_festivo_se_rechaza_con_motivo_claro() throws Exception {
        // 2026-07-20 es festivo nacional (Independencia)
        String cuerpo = lote("99999999-9999-4999-8999-999999999999",
                             studentId("1010101010"), "P", "2026-07-20");
        mvc.perform(post("/api/attendance/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(0))
           .andExpect(jsonPath("$.rejected[0].reason").value("La fecha no es un dia lectivo"));
    }

    @Test
    void una_asistencia_en_domingo_se_rechaza() throws Exception {
        String cuerpo = lote("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                             studentId("1010101010"), "P", "2026-07-19");
        mvc.perform(post("/api/attendance/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.accepted").value(0));
    }

    @Test
    void un_lote_desmesurado_se_rechaza_en_vez_de_intentar_procesarlo() throws Exception {
        Long student = studentId("1010101010");
        Long block = blockId();
        StringBuilder registros = new StringBuilder();
        for (int i = 0; i < 501; i++) {
            if (i > 0) registros.append(',');
            registros.append("""
                {"id":"%s","studentId":%d,"scheduleBlockId":%d,"classDate":"2026-04-06",
                 "status":"P","recordedAt":"2026-04-06T11:30:00Z"}
                """.formatted(new java.util.UUID(0L, i).toString(), student, block));
        }
        mvc.perform(post("/api/attendance/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"records\":[" + registros + "]}"))
           .andExpect(status().isBadRequest());
    }

    @Test
    void un_lote_grande_pero_razonable_se_acepta() throws Exception {
        Long student = studentId("1010101010");
        Long block = blockId();
        StringBuilder registros = new StringBuilder();
        for (int i = 0; i < 40; i++) {
            if (i > 0) registros.append(',');
            registros.append("""
                {"id":"%s","studentId":%d,"scheduleBlockId":%d,"classDate":"2026-04-09",
                 "status":"P","recordedAt":"2026-04-09T11:30:00Z"}
                """.formatted(new java.util.UUID(7L, i).toString(), student, block));
        }
        mvc.perform(post("/api/attendance/sync").header("Authorization", token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"records\":[" + registros + "]}"))
           .andExpect(status().isOk());
    }
}
