package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Las listas que el docente no alcanzo a tomar en dias lectivos pasados: lo unico
 * accionable que le queda cuando hoy no hay clase.
 *
 * La respuesta se agrupa por dia+curso (no por bloque): un curso al que nunca se le
 * toma asistencia mete varias filas casi identicas por dia y entierra los pendientes
 * reales de otros cursos, que es exactamente lo que paso con el curso 607 en la base
 * sembrada (42 filas, todas suyas).
 *
 * Semana propia (2026-04-20 al 2026-04-27, curso 995), lectiva de lunes a viernes sin
 * festivos ni vacaciones de por medio, y "hoy" fijo a proposito: nada aqui consulta el
 * reloj del servidor, igual que en MiDiaTest.
 */
@AutoConfigureMockMvc
class PendientesRecientesTest extends AbstractIntegrationTest {

    // dias=5 antes de "hoy" (2026-04-28, martes lectivo):
    // 04-27(lun), 04-24(vie), 04-23(jue), 04-22(mie), 04-21(mar).
    // Con 5 no entra el lunes anterior (04-20), asi que solo hay un lunes en la
    // ventana y el grupo semanal no aparece duplicado.
    private static final String QS = "?hoy=2026-04-28&dias=5";
    private static final String LUNES_PREVIO = "2026-04-27";
    private static final String MARTES_PREVIO = "2026-04-21";

    private Long docenteId;
    private Long bloqueLunesId;

    @BeforeEach
    void datos() {
        jdbcBase.update("""
                INSERT INTO users (email, password_hash, full_name, role, active)
                VALUES ('pendrec@pendrectest.co', 'x', 'Docente Pendientes Recientes', 'DOCENTE', TRUE)
                ON CONFLICT (email) DO NOTHING
                """);
        docenteId = jdbcBase.queryForObject(
                "SELECT id FROM users WHERE email = 'pendrec@pendrectest.co'", Long.class);

        jdbcBase.update("""
                INSERT INTO students (document_id, first_name, last_name, grade, active)
                VALUES ('9950000001','UNO','PENDREC','995',TRUE),
                       ('9950000002','DOS','PENDREC','995',TRUE)
                ON CONFLICT (document_id) DO NOTHING
                """);

        jdbcBase.update(
                "INSERT INTO subjects (name) VALUES ('MateriaPendRec') ON CONFLICT (name) DO NOTHING");

        // Bloque del lunes (weekday=1): sin tomar en ninguno de los tests salvo que se
        // marque explicitamente.
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id, room)
                VALUES ('995', 1, 8, '15:00', '15:50',
                        (SELECT id FROM subjects WHERE name = 'MateriaPendRec'), ?, 'Aula PR')
                ON CONFLICT (grade, weekday, block_no) DO UPDATE
                  SET teacher_id = EXCLUDED.teacher_id
                """, docenteId);
        bloqueLunesId = jdbcBase.queryForObject(
                "SELECT id FROM schedule_blocks WHERE grade = '995' AND weekday = 1 AND block_no = 8",
                Long.class);
        jdbcBase.update("DELETE FROM attendance WHERE schedule_block_id = ?", bloqueLunesId);

        // Varios tests de esta clase agregan bloques propios (995ahoga, 995poco,
        // 995vacio, y bloques extra del propio 995). Sin limpiarlos aqui, quedan de
        // un metodo a otro dentro de la MISMA clase (el contexto de Spring no se
        // resetea entre @Test) y el resultado de un test depende de cual corrio
        // antes: justo lo que no se puede permitir.
        jdbcBase.update("DELETE FROM schedule_blocks WHERE grade IN ('995ahoga','995poco','995vacio')");
        jdbcBase.update("DELETE FROM schedule_blocks WHERE grade = '995' AND block_no <> 8");
    }

    @AfterEach
    void limpieza() {
        // countBlocksOfWeekday (usado por HoyTest con weekday=3, esperando cero) es
        // global, sin filtrar por grado: si un bloque de 995ahoga (weekday 1..5,
        // incluido el 3) queda vivo despues de esta clase, infla ese conteo en
        // cualquier otra clase que corra despues, segun el orden. Se limpia todo lo
        // que esta clase pudo haber sembrado, no solo lo que necesita el proximo
        // @BeforeEach.
        jdbcBase.update("DELETE FROM schedule_blocks WHERE grade IN ('995ahoga','995poco','995vacio')");
        jdbcBase.update("DELETE FROM schedule_blocks WHERE grade = '995' AND block_no <> 8");
        jdbcBase.update("DELETE FROM students WHERE grade IN ('995ahoga','995poco')");
    }

    @Autowired MockMvc mvc;

    private String tokenDocente() {
        return tokenDe("pendrec@pendrectest.co", "DOCENTE");
    }

    private void bloque(String grade, int weekday, int blockNo) {
        jdbcBase.update("""
                INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                                             subject_id, teacher_id, room)
                VALUES (?, ?, ?, '15:00', '15:50',
                        (SELECT id FROM subjects WHERE name = 'MateriaPendRec'), ?, 'Aula PR')
                ON CONFLICT (grade, weekday, block_no) DO UPDATE
                  SET teacher_id = EXCLUDED.teacher_id
                """, grade, weekday, blockNo, docenteId);
    }

    @Test
    void un_bloque_pasado_sin_tomar_aparece_como_pendiente() throws Exception {
        mvc.perform(get("/api/reports/pending-recent" + QS)
                .header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.grupos[?(@.grade=='995')].fecha").value(LUNES_PREVIO))
           .andExpect(jsonPath("$.grupos[?(@.grade=='995')].listas").value(1));
    }

    @Test
    void un_bloque_ya_tomado_por_completo_no_aparece() throws Exception {
        for (String doc : new String[] {"9950000001", "9950000002"}) {
            jdbcBase.update("""
                    INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                                            status, recorded_by, recorded_at)
                    VALUES (gen_random_uuid(), (SELECT id FROM students WHERE document_id = ?),
                            ?, ?, 'P', ?, now())
                    ON CONFLICT ON CONSTRAINT attendance_unique_slot DO NOTHING
                    """, doc, bloqueLunesId, LocalDate.parse(LUNES_PREVIO), docenteId);
        }
        mvc.perform(get("/api/reports/pending-recent" + QS)
                .header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.grupos[?(@.grade=='995')]").isEmpty());
    }

    @Test
    void un_curso_sin_estudiantes_activos_no_es_una_lista_pendiente() throws Exception {
        // Bloque del martes previo, curso propio sin ningun estudiante activo: nadie
        // puede tomar esa lista, asi que no debe figurar como pendiente.
        bloque("995vacio", 2, 8);

        mvc.perform(get("/api/reports/pending-recent" + QS)
                .header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.grupos[?(@.grade=='995vacio')]").isEmpty());
    }

    @Test
    void ordena_del_mas_reciente_al_mas_antiguo() throws Exception {
        bloque("995", 2, 7);

        mvc.perform(get("/api/reports/pending-recent" + QS)
                .header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.grupos[0].fecha").value(LUNES_PREVIO))
           .andExpect(jsonPath("$.grupos[1].fecha").value(MARTES_PREVIO));
    }

    @Test
    void agrupa_por_dia_y_curso_en_vez_de_una_fila_por_bloque() throws Exception {
        // Dos bloques del mismo curso el mismo lunes: debe salir UNA fila con
        // listas=2, no dos filas casi identicas (el patron del curso 607 real: seis
        // bloques por dia enterrando a los demas cursos).
        bloque("995", 1, 7);

        mvc.perform(get("/api/reports/pending-recent" + QS)
                .header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.grupos.length()").value(1))
           .andExpect(jsonPath("$.grupos[0].grade").value("995"))
           .andExpect(jsonPath("$.grupos[0].fecha").value(LUNES_PREVIO))
           .andExpect(jsonPath("$.grupos[0].listas").value(2))
           .andExpect(jsonPath("$.totalGrupos").value(1));
    }

    @Test
    void un_curso_con_muchisimos_pendientes_no_entierra_a_los_demas() throws Exception {
        // Un bloque sin estudiantes activos no cuenta como pendiente (ver el test de
        // arriba), asi que ambos cursos necesitan alumnos activos propios.
        jdbcBase.update("""
                INSERT INTO students (document_id, first_name, last_name, grade, active)
                VALUES ('9951000001','UNO','AHOGA','995ahoga',TRUE),
                       ('9952000001','UNO','POCO','995poco',TRUE)
                ON CONFLICT (document_id) DO NOTHING
                """);

        // El curso ahogador: pendiente los 5 dias lectivos de la ventana (una fila
        // por dia). Sin reparto por curso, estas 5 filas llenarian solas un limite
        // bajo y dejarian afuera al otro curso, exactamente como paso con el 607.
        for (int weekday = 1; weekday <= 5; weekday++) {
            bloque("995ahoga", weekday, 8);
        }
        // Un curso con un solo pendiente, el martes previo.
        bloque("995poco", 2, 8);

        mvc.perform(get("/api/reports/pending-recent" + QS + "&limite=3")
                .header("Authorization", tokenDocente()))
           .andExpect(status().isOk())
           // El curso con pocos pendientes SI debe aparecer, aunque el limite sea
           // menor que el total de grupos del curso ahogador.
           .andExpect(jsonPath("$.grupos[?(@.grade=='995poco')]").isNotEmpty())
           .andExpect(jsonPath("$.grupos.length()").value(3))
           // 5 del ahogador + 1 del otro + 1 del 995 de siempre (lunes) = 7 grupos en
           // total, aunque solo se muestren 3: nunca se recorta en silencio.
           .andExpect(jsonPath("$.totalGrupos").value(7));
    }
}
