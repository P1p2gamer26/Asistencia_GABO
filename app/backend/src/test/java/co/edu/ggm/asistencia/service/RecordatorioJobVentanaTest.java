package co.edu.ggm.asistencia.service;

import org.junit.jupiter.api.Test;

import java.time.LocalTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class RecordatorioJobVentanaTest {

    private static final LocalTime INI = LocalTime.of(6, 30);
    private static final LocalTime FIN = LocalTime.of(7, 35);

    private static LocalTime min(int m) { return INI.plusMinutes(m); }

    @Test
    void avisaAntesDeEmpezarEntre15Y5Minutos() {
        assertEquals("ANTES", RecordatorioJob.ventana(min(-15), INI, FIN));
        assertEquals("ANTES", RecordatorioJob.ventana(min(-6), INI, FIN));
        assertNull(RecordatorioJob.ventana(min(-16), INI, FIN));
        assertNull(RecordatorioJob.ventana(min(-5), INI, FIN));
    }

    @Test
    void avisaSinTomaA15MinutosYMientrasDuraElBloque() {
        assertNull(RecordatorioJob.ventana(min(14), INI, FIN));
        assertEquals("SIN_TOMA", RecordatorioJob.ventana(min(15), INI, FIN));
        assertEquals("SIN_TOMA", RecordatorioJob.ventana(min(64), INI, FIN));
        assertNull(RecordatorioJob.ventana(FIN, INI, FIN));
    }

    @Test
    void ultimoBloqueDeSecundariaTerminaA1330() {
        LocalTime ini = LocalTime.of(12, 15);
        LocalTime fin = LocalTime.of(13, 30);
        assertEquals("SIN_TOMA", RecordatorioJob.ventana(LocalTime.of(12, 30), ini, fin));
        assertNull(RecordatorioJob.ventana(LocalTime.of(13, 30), ini, fin));
    }
}
