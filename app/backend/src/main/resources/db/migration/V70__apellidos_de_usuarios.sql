-- Apellidos separados para ordenar docentes y acudientes. Opcionales: full_name se conserva
-- y es el respaldo cuando estas columnas estan vacias. El llenado inicial se propone con
-- tools/separar_apellidos.py (CSV para revisar) y no lo hace esta migracion.
ALTER TABLE users
    ADD COLUMN last_name      VARCHAR(80),
    ADD COLUMN second_surname VARCHAR(80),
    ADD COLUMN first_names    VARCHAR(120);
