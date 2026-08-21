-- Consulta inversa (los hijos de un acudiente): hoy hace recorrido completo de tabla.
CREATE INDEX IF NOT EXISTS idx_guardianships_guardian ON guardianships (guardian_id);

-- El importador de horario busca docentes por correo en cada linea del CSV.
CREATE INDEX IF NOT EXISTS idx_users_email_activo ON users (email) WHERE active;
