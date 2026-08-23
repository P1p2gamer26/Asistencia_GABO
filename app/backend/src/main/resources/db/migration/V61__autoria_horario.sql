-- Autoria de los bloques de horario: quien lo creo/modifico y cuando.
-- Los 900+ bloques ya sembrados quedan con estas columnas en NULL: no se les
-- inventa un autor. NULL se interpreta en la interfaz como "sin registro".
ALTER TABLE schedule_blocks
    ADD COLUMN created_by BIGINT REFERENCES users(id),
    ADD COLUMN created_at TIMESTAMP,
    ADD COLUMN updated_by BIGINT REFERENCES users(id),
    ADD COLUMN updated_at TIMESTAMP;
