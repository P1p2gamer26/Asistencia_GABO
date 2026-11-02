package co.edu.ggm.asistencia.controller;

import co.edu.ggm.asistencia.repository.ReportRepository;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AgruparDiaTest {

    private record Fila(String grade, short blockNo, String subject, String teacher, long marcas, String quien)
            implements ReportRepository.BloqueDiaRow {
        public String getGrade() { return grade; }
        public Short getBlockNo() { return blockNo; }
        public String getSubject() { return subject; }
        public String getTeacherName() { return teacher; }
        public Long getMarcas() { return marcas; }
        public String getQuienTomo() { return quien; }
    }

    @Test
    void cuenta_bloques_y_los_tomados_del_dia_por_curso() {
        List<ReportRepository.BloqueDiaRow> filas = List.of(
                new Fila("601", (short) 1, "Informatica", "Yamile", 30, "Yamile"),
                new Fila("601", (short) 2, "Ciencias", "Alejandro", 0, null),
                new Fila("602", (short) 1, "Mates", "Francisco", 28, "Francisco"));

        var cursos = ReportController.agruparDia(filas, List.of("601", "602", "9901"));

        // Salen todos los cursos con estudiantes, tambien el que no tiene horario.
        assertEquals(3, cursos.size());
        assertEquals("601", cursos.get(0).grade());
        assertEquals(2, cursos.get(0).bloques());
        assertEquals(1, cursos.get(0).tomados());
        assertEquals("Yamile", cursos.get(0).detalle().get(0).quienTomo());
        assertEquals(0, cursos.get(0).detalle().get(1).marcas());
        assertEquals("9901", cursos.get(2).grade());
        assertEquals(0, cursos.get(2).bloques());
    }
}
