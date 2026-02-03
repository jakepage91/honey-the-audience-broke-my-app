CREATE TABLE IF NOT EXISTS votes (
    id SERIAL PRIMARY KEY,
    choice VARCHAR(100) NOT NULL,
    referral_code VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_partners (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_votes_created_at ON votes(created_at);
