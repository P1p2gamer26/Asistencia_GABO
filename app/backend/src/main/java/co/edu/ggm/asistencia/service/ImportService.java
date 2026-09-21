package co.edu.ggm.asistencia.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BiConsumer;

@Service
public class ImportService {

    public record Resultado(int imported, List<String> errors) {}

    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;

    public ImportService(JdbcTemplate jdbc, PasswordEncoder encoder) {
        this.jdbc = jdbc; this.encoder = encoder;
    }

    /**
     * Recorre el CSV aplicando `accion` a cada linea. Cada linea va en su propia
     * transaccion: una fila mala no puede tumbar las 1200 buenas.
     */
    private Resultado recorrer(java.io.InputStream entrada, int columnas,
                               BiConsumer<String[], Integer> accion) throws IOException {
        List<String> errores = new ArrayList<>();
        int importados = 0, numero = 0;

        try (var reader = new BufferedReader(new InputStreamReader(entrada, StandardCharsets.UTF_8))) {
            String linea, sep = ",";
            while ((linea = reader.readLine()) != null) {
                numero++;
                // Excel en espanol guarda el CSV con punto y coma: se acepta el que traiga la cabecera.
                if (numero == 1) sep = linea.contains(";") ? ";" : ",";
                if (numero == 1 || linea.isBlank()) continue;    // cabecera
                String[] c = linea.split(sep, -1);
                if (c.length < columnas) {
                    errores.add("Linea " + numero + ": se esperaban " + columnas
                            + " columnas y llegaron " + c.length);
                    continue;
                }
                try {
                    accion.accept(c, numero);
                    importados++;
                } catch (RuntimeException e) {
                    errores.add("Linea " + numero + ": " + e.getMessage());
                }
            }
        }
        return new Resultado(importados, errores);
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public Resultado importarHorario(java.io.InputStream entrada) throws IOException {
        return recorrer(entrada, 7, (c, n) -> {
            String grade = c[0].trim();
            short weekday = Short.parseShort(c[1].trim());
            if (weekday < 1 || weekday > 5) {
                throw new IllegalArgumentException("dia de ciclo (1 a 5) debe estar entre 1 y 5, llego " + weekday);
            }
            short blockNo = Short.parseShort(c[2].trim());
            LocalTime inicio = LocalTime.parse(c[3].trim());
            LocalTime fin = LocalTime.parse(c[4].trim());
            if (!fin.isAfter(inicio)) {
                throw new IllegalArgumentException("end_time debe ser posterior a start_time");
            }
            Long materiaId = idDeMateria(c[5].trim());
            Long docenteId = idDeDocente(c[6].trim().toLowerCase());
            // El aula es opcional: los archivos que el colegio ya tenga preparados
            // vienen con siete columnas y deben seguir sirviendo.
            String aula = c.length > 7 && !c[7].isBlank() ? c[7].trim() : null;

            jdbc.update("""
                    INSERT INTO schedule_blocks
                      (grade, weekday, block_no, start_time, end_time, subject_id, teacher_id, room)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (grade, weekday, block_no) DO UPDATE
                      SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
                          subject_id = EXCLUDED.subject_id, teacher_id = EXCLUDED.teacher_id,
                          room = EXCLUDED.room
                    """, grade, weekday, blockNo, inicio, fin, materiaId, docenteId, aula);
        });
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public Resultado importarAcudientes(java.io.InputStream entrada) throws IOException {
        return recorrer(entrada, 4, (c, n) -> {
            String documento = c[0].trim();
            Long estudianteId = jdbc.query(
                    "SELECT id FROM students WHERE document_id = ? AND active",
                    rs -> rs.next() ? rs.getLong(1) : null, documento);
            if (estudianteId == null) {
                throw new IllegalArgumentException("No existe el estudiante " + documento);
            }
            Long acudienteId = idDeAcudiente(c[2].trim().toLowerCase(), c[1].trim());
            jdbc.update("""
                    INSERT INTO guardianships (student_id, guardian_id, relationship)
                    VALUES (?, ?, ?)
                    ON CONFLICT (student_id, guardian_id) DO UPDATE
                      SET relationship = EXCLUDED.relationship
                    """, estudianteId, acudienteId, c[3].trim());
        });
    }

    private Long idDeMateria(String nombre) {
        jdbc.update("INSERT INTO subjects (name) VALUES (?) ON CONFLICT (name) DO NOTHING", nombre);
        return jdbc.queryForObject("SELECT id FROM subjects WHERE name = ?", Long.class, nombre);
    }

    private Long idDeDocente(String correo) {
        return idDeUsuario(correo, correo.split("@")[0], "DOCENTE");
    }

    private Long idDeAcudiente(String correo, String nombre) {
        return idDeUsuario(correo, nombre, "ACUDIENTE");
    }

    /**
     * Crea el usuario si no existe, con contrasena temporal. No la sobreescribe si ya
     * existe: reimportar el horario no puede echar de la aplicacion a un docente que
     * ya cambio su contrasena.
     */
    private Long idDeUsuario(String correo, String nombre, String rol) {
        jdbc.update("""
                INSERT INTO users (email, password_hash, full_name, role)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (email) DO NOTHING
                """, correo, encoder.encode("cambiar123"), nombre, rol);
        return jdbc.queryForObject("SELECT id FROM users WHERE email = ?", Long.class, correo);
    }
}
