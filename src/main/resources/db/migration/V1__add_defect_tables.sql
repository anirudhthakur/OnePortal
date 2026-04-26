-- Defect sheets: one per project, stores QC defect extract metadata
CREATE TABLE defect_sheets (
    id               BIGSERIAL PRIMARY KEY,
    file_name        VARCHAR(255) NOT NULL,
    sheet_name       VARCHAR(255) NOT NULL,
    project_id       BIGINT NOT NULL REFERENCES projects(id),
    uploaded_by_id   BIGINT REFERENCES users(id),
    id_column_name   VARCHAR(255) NOT NULL,
    summary_column_name VARCHAR(255) NOT NULL,
    created_at       TIMESTAMP
);

-- Defect rows: one per row in the uploaded QC extract
CREATE TABLE defect_rows (
    id         BIGSERIAL PRIMARY KEY,
    sheet_id   BIGINT NOT NULL REFERENCES defect_sheets(id),
    row_index  INTEGER NOT NULL,
    defect_id  VARCHAR(255) NOT NULL,
    summary    TEXT,
    row_data   TEXT NOT NULL
);

-- Join table linking test design rows to one or more defect rows
CREATE TABLE test_design_row_linked_defects (
    row_id        BIGINT NOT NULL REFERENCES test_design_rows(id),
    defect_row_id BIGINT NOT NULL,
    PRIMARY KEY (row_id, defect_row_id)
);
