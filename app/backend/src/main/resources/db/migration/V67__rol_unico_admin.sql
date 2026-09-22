-- Rol unico: ADMIN. COORDINADOR y ADMIN hacian exactamente lo mismo, asi que se
-- elimina COORDINADOR del sistema; quien era coordinador queda como ADMIN.
UPDATE users SET role = 'ADMIN' WHERE role = 'COORDINADOR';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN','DOCENTE','ACUDIENTE'));