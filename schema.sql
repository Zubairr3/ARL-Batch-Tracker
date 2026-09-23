CREATE TABLE IF NOT EXISTS trays (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    zone VARCHAR(50) NOT NULL,
    capacity_units INTEGER NOT NULL CHECK (capacity_units > 0),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS batches (
    id SERIAL PRIMARY KEY,
    tray_id INTEGER NOT NULL REFERENCES trays(id),
    crop VARCHAR(100) NOT NULL,
    seeded_on TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    stage VARCHAR(30) NOT NULL DEFAULT 'SEEDED' 
        CHECK (stage IN ('SEEDED', 'GERMINATION', 'GROWING', 'HARVEST_READY', 'HARVESTED')),
    expected_harvest_on TIMESTAMPTZ NOT NULL
);

-- THIS SOLVES PART 3a (CONCURRENCY) AND RULE 1
-- It forces the database to only allow ONE batch per tray_id unless the stage is HARVESTED.
CREATE UNIQUE INDEX unique_active_batch_per_tray 
ON batches (tray_id) 
WHERE stage != 'HARVESTED';

CREATE TABLE IF NOT EXISTS harvests (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER UNIQUE NOT NULL REFERENCES batches(id),
    harvested_on TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    weight_grams NUMERIC(10, 2) NOT NULL CHECK (weight_grams > 0),
    grade CHAR(1) NOT NULL CHECK (grade IN ('A', 'B', 'C'))
);