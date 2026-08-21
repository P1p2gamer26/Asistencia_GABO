CREATE TABLE notifications (
    id            BIGSERIAL PRIMARY KEY,
    attendance_id UUID        NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
    kind          VARCHAR(20) NOT NULL CHECK (kind IN ('EVASION','AUSENCIA_DIA','LLEGADA_TARDE')),
    recipient     VARCHAR(160) NOT NULL,
    subject       VARCHAR(200) NOT NULL,
    body          TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at       TIMESTAMPTZ,
    error         VARCHAR(300),
    CONSTRAINT notification_unique UNIQUE (attendance_id, kind, recipient)
);
CREATE INDEX idx_notifications_pendientes ON notifications (created_at) WHERE sent_at IS NULL;
