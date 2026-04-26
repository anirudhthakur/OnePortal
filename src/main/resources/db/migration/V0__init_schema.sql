-- users
CREATE TABLE users (
    id         BIGSERIAL    PRIMARY KEY,
    username   VARCHAR(50)  NOT NULL,
    email      VARCHAR(150) NOT NULL,
    password   VARCHAR(255) NOT NULL,
    role       VARCHAR(20)  NOT NULL,
    enabled    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT uq_users_email    UNIQUE (email)
);

-- projects
CREATE TABLE projects (
    id          BIGSERIAL    PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    created_at  TIMESTAMP,
    updated_at  TIMESTAMP
);

-- project_members
CREATE TABLE project_members (
    id         BIGSERIAL   PRIMARY KEY,
    project_id BIGINT      NOT NULL REFERENCES projects(id),
    user_id    BIGINT      NOT NULL REFERENCES users(id),
    role       VARCHAR(20) NOT NULL,
    joined_at  TIMESTAMP,
    CONSTRAINT uq_project_members UNIQUE (project_id, user_id)
);

-- test_cases
CREATE TABLE test_cases (
    id              BIGSERIAL    PRIMARY KEY,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    steps           TEXT,
    expected_result TEXT,
    priority        VARCHAR(20)  NOT NULL,
    status          VARCHAR(20)  NOT NULL,
    module          VARCHAR(100),
    tag             VARCHAR(100),
    created_by_id   BIGINT REFERENCES users(id),
    project_id      BIGINT REFERENCES projects(id),
    assigned_to_id  BIGINT REFERENCES users(id),
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP
);

-- test_executions
CREATE TABLE test_executions (
    id               BIGSERIAL   PRIMARY KEY,
    test_case_id     BIGINT      NOT NULL REFERENCES test_cases(id),
    executed_by_id   BIGINT      NOT NULL REFERENCES users(id),
    execution_status VARCHAR(20) NOT NULL,
    actual_result    TEXT,
    comments         TEXT,
    build_version    VARCHAR(100),
    environment      VARCHAR(50),
    duration_ms      BIGINT,
    started_at       TIMESTAMP,
    finished_at      TIMESTAMP,
    created_at       TIMESTAMP,
    updated_at       TIMESTAMP
);

-- test_design_sheets
CREATE TABLE test_design_sheets (
    id             BIGSERIAL    PRIMARY KEY,
    file_name      VARCHAR(255) NOT NULL,
    sheet_name     VARCHAR(255) NOT NULL,
    uploaded_by_id BIGINT REFERENCES users(id),
    project_id     BIGINT REFERENCES projects(id),
    created_at     TIMESTAMP
);

-- test_design_rows
-- NOTE: updated_at and updated_by_id are intentionally omitted here;
--       V3__row_audit_trail.sql adds them via ALTER TABLE.
CREATE TABLE test_design_rows (
    id             BIGSERIAL   PRIMARY KEY,
    sheet_id       BIGINT      NOT NULL REFERENCES test_design_sheets(id),
    row_index      INTEGER     NOT NULL,
    row_data       TEXT        NOT NULL,
    assigned_to_id BIGINT REFERENCES users(id),
    row_status     VARCHAR(20)
);
