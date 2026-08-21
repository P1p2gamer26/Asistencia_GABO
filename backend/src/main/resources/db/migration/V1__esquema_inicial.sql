CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    email         VARCHAR(160) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    full_name     VARCHAR(160) NOT NULL,
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('ADMIN','COORDINADOR','DOCENTE','ACUDIENTE')),
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE students (
    id             BIGSERIAL PRIMARY KEY,
    document_id    VARCHAR(32)  NOT NULL UNIQUE,
    first_name     VARCHAR(60)  NOT NULL,
    middle_name    VARCHAR(60),
    last_name      VARCHAR(60)  NOT NULL,
    second_surname VARCHAR(60),
    grade          VARCHAR(10)  NOT NULL,
    eps            VARCHAR(80),
    address        VARCHAR(160),
    phone          VARCHAR(30),
    active         BOOLEAN      NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_students_grade ON students (grade) WHERE active;

CREATE TABLE guardianships (
    student_id   BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    guardian_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    relationship VARCHAR(40),
    PRIMARY KEY (student_id, guardian_id)
);

CREATE TABLE subjects (
    id   BIGSERIAL PRIMARY KEY,
    name VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE schedule_blocks (
    id          BIGSERIAL PRIMARY KEY,
    grade       VARCHAR(10) NOT NULL,
    weekday     SMALLINT    NOT NULL CHECK (weekday BETWEEN 1 AND 5),
    block_no    SMALLINT    NOT NULL CHECK (block_no BETWEEN 1 AND 8),
    start_time  TIME        NOT NULL,
    end_time    TIME        NOT NULL,
    subject_id  BIGINT      NOT NULL REFERENCES subjects(id),
    teacher_id  BIGINT      NOT NULL REFERENCES users(id),
    UNIQUE (grade, weekday, block_no)
);
CREATE INDEX idx_schedule_teacher ON schedule_blocks (teacher_id, weekday);

CREATE TABLE attendance (
    id                UUID        PRIMARY KEY,
    student_id        BIGINT      NOT NULL REFERENCES students(id),
    schedule_block_id BIGINT      NOT NULL REFERENCES schedule_blocks(id),
    class_date        DATE        NOT NULL,
    status            CHAR(1)     NOT NULL CHECK (status IN ('P','T','F','E')),
    comment           VARCHAR(280),
    recorded_by       BIGINT      NOT NULL REFERENCES users(id),
    recorded_at       TIMESTAMPTZ NOT NULL,
    synced_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT attendance_unique_slot UNIQUE (student_id, schedule_block_id, class_date)
);
CREATE INDEX idx_attendance_student_date ON attendance (student_id, class_date DESC);
CREATE INDEX idx_attendance_date_status  ON attendance (class_date, status);

CREATE TABLE entry_log (
    id          UUID        PRIMARY KEY,
    student_id  BIGINT      NOT NULL REFERENCES students(id),
    entry_date  DATE        NOT NULL,
    scanned_at  TIMESTAMPTZ NOT NULL,
    recorded_by BIGINT      NOT NULL REFERENCES users(id),
    CONSTRAINT entry_unique_day UNIQUE (student_id, entry_date)
);
