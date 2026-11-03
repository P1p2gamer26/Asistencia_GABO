-- Avisos push a docentes: suscripciones por dispositivo y registro de avisos enviados
-- (el registro hace que cada aviso se envie una sola vez por docente, bloque y dia).
CREATE TABLE push_subscriptions (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint    TEXT        NOT NULL UNIQUE,
    p256dh      TEXT        NOT NULL,
    auth        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_push_user ON push_subscriptions (user_id);

CREATE TABLE reminder_log (
    id                BIGSERIAL PRIMARY KEY,
    teacher_id        BIGINT      NOT NULL REFERENCES users(id),
    schedule_block_id BIGINT      NOT NULL REFERENCES schedule_blocks(id),
    class_date        DATE        NOT NULL,
    tipo              VARCHAR(20) NOT NULL CHECK (tipo IN ('ANTES','SIN_TOMA')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reminder_log_unico UNIQUE (teacher_id, schedule_block_id, class_date, tipo)
);
