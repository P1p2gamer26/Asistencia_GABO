package co.edu.ggm.asistencia.service;

import java.util.regex.Pattern;

/**
 * El QR del carnet trae el texto completo en una linea:
 * "Alvaro Mathias Orozco Lara 1013696566 Primero - 103".
 * Solo interesa el documento; el nombre y el curso los decide la base de datos.
 * La cola offline puede traer escaneos viejos con el texto crudo, por eso el
 * servidor tiene que saber leerlo igual que el navegador.
 */
public final class CarnetParser {

    private static final Pattern DOCUMENTO = Pattern.compile("\\b(\\d{6,12})\\b");

    private CarnetParser() {}

    /** Devuelve el documento, o null si el texto no trae ninguno. */
    public static String documento(String raw) {
        if (raw == null) return null;
        var m = DOCUMENTO.matcher(raw);
        return m.find() ? m.group(1) : null;
    }
}
