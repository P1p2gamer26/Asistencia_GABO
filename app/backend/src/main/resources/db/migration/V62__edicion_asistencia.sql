-- Editar y borrar asistencia desde la pantalla de toma de lista, con rastro de quien
-- corrigio (distinto de quien registro) y borrado logico: una falta borrada pudo ya
-- haberse notificado al acudiente, asi que desaparecer sin dejar constancia no es opcion.
ALTER TABLE attendance
    ADD COLUMN edited_by BIGINT REFERENCES users(id),
    ADD COLUMN edited_at TIMESTAMP,
    ADD COLUMN previous_status CHAR(1),
    ADD COLUMN deleted_by BIGINT REFERENCES users(id),
    ADD COLUMN deleted_at TIMESTAMP;

-- Las consultas del panel filtran por deleted_at IS NULL en cada carga de bloque/fecha.
CREATE INDEX idx_attendance_deleted_at ON attendance(deleted_at);
