ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- Todos los usuarios existentes tienen la contrasena temporal conocida, que esta
-- ademas escrita en el repositorio. Se les obliga a cambiarla en el proximo acceso.
UPDATE users SET must_change_password = TRUE;

COMMENT ON COLUMN users.must_change_password IS
  'TRUE cuando la contrasena es la temporal: la aplicacion obliga a cambiarla antes de dejar trabajar.';
