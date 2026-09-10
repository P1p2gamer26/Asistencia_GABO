package co.edu.ggm.asistencia.report;

import co.edu.ggm.asistencia.AbstractIntegrationTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Prueba la funcion SQL orden_curso() usada en las consultas por curso (ver
 * ReportRepository). Usa document_id y grades propios que no toca ningun otro
 * test (HoyTest, NovedadesTest, PendientesTest, PendientesRecientesTest,
 * BootstrapTest, MiDiaTest, PortalAcudienteTest, ReportTest).
 */
class OrdenCursoTest extends AbstractIntegrationTest {

    @Autowired JdbcTemplate jdbc;

    private static final String[] DOC_IDS = {
        "9995000001", "9995000002", "9995000003", "9995000004", "9995000005", "9995000006",
        "9995000007", "9995000008", "9995000009", "9995000010", "9995000011", "9995000012"
    };

    @BeforeEach
    void datos() {
        // 0A, 9B, 10A, 11B en desorden + un paralelo B para probar estabilidad
        // A/B, mas un valor que no calza con ningun formato ('Transicion') para
        // probar que no rompe ni desaparece.
        insertar("9995000001", "9B");
        insertar("9995000002", "0A");
        insertar("9995000003", "11B");
        insertar("9995000004", "10A");
        insertar("9995000005", "Transicion");
        insertar("9995000006", "9A");
        // Los codigos reales del plano de matricula (ver V64): preescolar, el codigo
        // oficial de 1 a 11, y aceleracion.
        insertar("9995000007", "601");
        insertar("9995000008", "1001");
        insertar("9995000009", "T01");
        insertar("9995000010", "J02");
        insertar("9995000011", "PJ01");
        insertar("9995000012", "9901");
    }

    @AfterEach
    void limpiar() {
        jdbc.update("DELETE FROM students WHERE document_id = ANY (?)",
                (Object) DOC_IDS);
    }

    private void insertar(String documentId, String grade) {
        jdbc.update("""
            INSERT INTO students (document_id, first_name, last_name, grade, active)
            VALUES (?, 'PRUEBA', 'ORDEN', ?, true)
            ON CONFLICT (document_id) DO UPDATE SET grade = EXCLUDED.grade
            """, documentId, grade);
    }

    @Test
    void diez_y_once_van_despues_de_nueve_y_cero_va_primero() {
        List<String> orden = jdbc.queryForList("""
            SELECT grade FROM students WHERE document_id = ANY (?)
            ORDER BY orden_curso(grade), grade
            """, String.class, (Object) DOC_IDS);

        assertThat(orden).containsExactly(
                "PJ01", "J02", "T01", "0A", "601", "9A", "9B", "1001", "10A", "11B",
                "9901", "Transicion");
    }

    @Test
    void un_valor_que_no_calza_sigue_apareciendo_y_no_rompe_la_consulta() {
        List<String> orden = jdbc.queryForList("""
            SELECT grade FROM students WHERE document_id = ANY (?)
            ORDER BY orden_curso(grade), grade
            """, String.class, (Object) DOC_IDS);

        assertThat(orden).contains("Transicion");
        assertThat(orden).hasSize(12);
    }

    @Test
    void estable_entre_a_y_b_del_mismo_grado() {
        List<String> orden = jdbc.queryForList("""
            SELECT grade FROM students WHERE document_id = ANY (?)
            ORDER BY orden_curso(grade), grade
            """, String.class, (Object) DOC_IDS);

        int idxA = orden.indexOf("9A");
        int idxB = orden.indexOf("9B");
        assertThat(idxA).isLessThan(idxB);
    }
}
