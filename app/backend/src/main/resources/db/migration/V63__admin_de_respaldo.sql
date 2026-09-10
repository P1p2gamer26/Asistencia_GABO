-- La clave del admin original se cambio en produccion y se perdio. Este es un segundo
-- ADMIN de respaldo con la clave temporal conocida (cambiar123), para no quedarse
-- nunca sin acceso de administracion. must_change_password queda en FALSE a proposito:
-- es una cuenta de rescate, no una cuenta de uso diario. Cambiarle la clave a mano
-- cuando el colegio entre en produccion de verdad.
INSERT INTO users (email, password_hash, full_name, role, must_change_password)
VALUES ('admin2@ggm.edu.co',
        '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
        'Administrador de respaldo', 'ADMIN', FALSE)
ON CONFLICT (email) DO NOTHING;
