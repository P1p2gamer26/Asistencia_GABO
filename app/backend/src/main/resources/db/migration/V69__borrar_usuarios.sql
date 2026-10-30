-- Borrar una cuenta no debe llevarse la asistencia ni lo que esa persona creo.
-- Cada FK a users se maneja asi:
--   guardianships.guardian_id  CASCADE (ya estaba): solo se pierde el vinculo acudiente-hijo.
--   attendance.recorded_by / edited_by   SET NULL + nombre conservado en recorded_by_name / edited_by_name.
--   entry_log.recorded_by                SET NULL + nombre conservado.
--   attendance.deleted_by, school_calendar.updated_by, schedule_blocks.created_by/updated_by
--                                        SET NULL (solo autoria, sin nombre).
--   schedule_blocks.teacher_id           se mantiene NOT NULL y sin cascada: el servicio rechaza
--                                        borrar a un docente con bloques en el horario.
ALTER TABLE attendance ADD COLUMN recorded_by_name VARCHAR(160), ADD COLUMN edited_by_name VARCHAR(160);
ALTER TABLE entry_log  ADD COLUMN recorded_by_name VARCHAR(160);

ALTER TABLE attendance ALTER COLUMN recorded_by DROP NOT NULL;
ALTER TABLE entry_log  ALTER COLUMN recorded_by DROP NOT NULL;

ALTER TABLE attendance
    DROP CONSTRAINT attendance_recorded_by_fkey,
    ADD  CONSTRAINT attendance_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
    DROP CONSTRAINT attendance_edited_by_fkey,
    ADD  CONSTRAINT attendance_edited_by_fkey   FOREIGN KEY (edited_by)   REFERENCES users(id) ON DELETE SET NULL,
    DROP CONSTRAINT attendance_deleted_by_fkey,
    ADD  CONSTRAINT attendance_deleted_by_fkey  FOREIGN KEY (deleted_by)  REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE entry_log
    DROP CONSTRAINT entry_log_recorded_by_fkey,
    ADD  CONSTRAINT entry_log_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE schedule_blocks
    DROP CONSTRAINT schedule_blocks_created_by_fkey,
    ADD  CONSTRAINT schedule_blocks_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    DROP CONSTRAINT schedule_blocks_updated_by_fkey,
    ADD  CONSTRAINT schedule_blocks_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

-- El nombre se copia justo antes de borrar, para que los reportes sigan diciendo quien registro.
CREATE FUNCTION conservar_nombre_de_usuario() RETURNS trigger AS $$
BEGIN
    UPDATE attendance SET recorded_by_name = OLD.full_name WHERE recorded_by = OLD.id;
    UPDATE attendance SET edited_by_name   = OLD.full_name WHERE edited_by   = OLD.id;
    UPDATE entry_log  SET recorded_by_name = OLD.full_name WHERE recorded_by = OLD.id;
    RETURN OLD;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER users_conservar_nombre BEFORE DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION conservar_nombre_de_usuario();

ALTER TABLE school_calendar
    DROP CONSTRAINT school_calendar_updated_by_fkey,
    ADD  CONSTRAINT school_calendar_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
