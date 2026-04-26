ALTER TABLE test_design_rows ADD COLUMN updated_at TIMESTAMP;
ALTER TABLE test_design_rows ADD COLUMN updated_by_id BIGINT REFERENCES users(id);

ALTER TABLE defect_rows ADD COLUMN updated_at TIMESTAMP;
ALTER TABLE defect_rows ADD COLUMN updated_by_id BIGINT REFERENCES users(id);
