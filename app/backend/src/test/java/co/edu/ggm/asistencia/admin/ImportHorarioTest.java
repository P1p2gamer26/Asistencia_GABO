package co.edu.ggm.asistencia.admin;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Regla de estos tests: NUNCA mutar los datos de la semilla (V3__datos_semilla.sql).
 * El contexto de Spring se comparte entre clases y la base se limpia una sola vez por
 * corrida, asi que un test que le cambia el curso a un estudiante de la semilla o le
 * anade bloques a su docente rompe a BootstrapTest, SchemaTest o ReportTest segun el
 * orden en que Surefire ejecute las clases. Cada test usa sus propios documentos y
 * correos; el importador crea docentes y materias que no existen, asi que no cuesta nada.
 */
@AutoConfigureMockMvc
class ImportHorarioTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private String admin() { return tokenDe("admin@ggm.edu.co", "ADMIN"); }

    private MockMultipartFile csv(String contenido) {
        return new MockMultipartFile("file", "datos.csv", "text/csv",
                contenido.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void importa_horario_creando_materia_y_docente_que_no_existian() throws Exception {
        String contenido = """
                grade,weekday,block_no,start_time,end_time,subject,teacher_email
                701,2,3,08:00,08:50,Biologia,nuevo.docente@ggm.edu.co
                """;
        mvc.perform(multipart("/api/admin/import/schedule").file(csv(contenido))
                        .header("Authorization", admin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.imported").value(1))
           .andExpect(jsonPath("$.errors.length()").value(0));

        assertThat(jdbcBase.queryForObject(
                "SELECT count(*) FROM subjects WHERE name = 'Biologia'", Integer.class)).isEqualTo(1);
        assertThat(jdbcBase.queryForObject(
                "SELECT role FROM users WHERE email = 'nuevo.docente@ggm.edu.co'",
                String.class)).isEqualTo("DOCENTE");
        assertThat(jdbcBase.queryForObject(
                "SELECT start_time::text FROM schedule_blocks WHERE grade='701' AND block_no=3",
                String.class)).isEqualTo("08:00:00");
    }

    @Test
    void reimportar_el_mismo_horario_actualiza_y_no_duplica() throws Exception {
        String contenido = """
                grade,weekday,block_no,start_time,end_time,subject,teacher_email
                702,1,1,06:30,07:20,Fisica,docente.import@ggm.edu.co
                """;
        mvc.perform(multipart("/api/admin/import/schedule").file(csv(contenido))
                .header("Authorization", admin())).andExpect(status().isOk());
        mvc.perform(multipart("/api/admin/import/schedule").file(csv(contenido))
                .header("Authorization", admin())).andExpect(status().isOk());

        assertThat(jdbcBase.queryForObject(
                "SELECT count(*) FROM schedule_blocks WHERE grade='702'", Integer.class)).isEqualTo(1);
    }

    @Test
    void una_linea_de_horario_mal_formada_se_reporta_sin_abortar_el_resto() throws Exception {
        String contenido = """
                grade,weekday,block_no,start_time,end_time,subject,teacher_email
                703,1,1,06:30,07:20,Quimica,docente.import@ggm.edu.co
                703,9,1,06:30,07:20,Quimica,docente.import@ggm.edu.co
                """;
        mvc.perform(multipart("/api/admin/import/schedule").file(csv(contenido))
                        .header("Authorization", admin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.imported").value(1))
           .andExpect(jsonPath("$.errors.length()").value(1));
    }

    @Test
    void el_csv_de_horario_acepta_el_aula() throws Exception {
        String contenido = """
                grade,weekday,block_no,start_time,end_time,subject,teacher_email,room
                704,3,2,07:20,08:10,Sociales,aula.import@ggm.edu.co,Laboratorio 2
                """;
        mvc.perform(multipart("/api/admin/import/schedule").file(csv(contenido))
                        .header("Authorization", admin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.imported").value(1));

        assertThat(jdbcBase.queryForObject(
                "SELECT room FROM schedule_blocks WHERE grade='704' AND block_no=2",
                String.class)).isEqualTo("Laboratorio 2");
    }

    @Test
    void un_csv_de_horario_sin_columna_de_aula_sigue_funcionando() throws Exception {
        // Los archivos que el colegio ya haya preparado no deben dejar de servir.
        String contenido = """
                grade,weekday,block_no,start_time,end_time,subject,teacher_email
                705,3,2,07:20,08:10,Sociales,aula.import@ggm.edu.co
                """;
        mvc.perform(multipart("/api/admin/import/schedule").file(csv(contenido))
                        .header("Authorization", admin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.imported").value(1));

        assertThat(jdbcBase.queryForObject(
                "SELECT room FROM schedule_blocks WHERE grade='705' AND block_no=2",
                String.class)).isNull();
    }

    @Test
    void importa_acudientes_y_los_vincula_con_su_hijo() throws Exception {
        String contenido = """
                document_id,guardian_name,guardian_email,relationship
                1010101010,Maria Figueroa,maria.figueroa@correo.com,Madre
                """;
        mvc.perform(multipart("/api/admin/import/guardians").file(csv(contenido))
                        .header("Authorization", admin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.imported").value(1));

        assertThat(jdbcBase.queryForObject("""
                SELECT count(*) FROM guardianships g
                JOIN users u ON u.id = g.guardian_id
                JOIN students s ON s.id = g.student_id
                WHERE u.email='maria.figueroa@correo.com' AND s.document_id='1010101010'
                """, Integer.class)).isEqualTo(1);
    }

    @Test
    void un_acudiente_de_un_estudiante_inexistente_se_reporta() throws Exception {
        String contenido = """
                document_id,guardian_name,guardian_email,relationship
                0000000000,Nadie,nadie@correo.com,Padre
                """;
        mvc.perform(multipart("/api/admin/import/guardians").file(csv(contenido))
                        .header("Authorization", admin()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.imported").value(0))
           .andExpect(jsonPath("$.errors.length()").value(1));
    }
}
