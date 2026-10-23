-- ip_blocks table for persistent IP blocklist
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS ip_blocks (
  ip TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ip_blocks_expires_at ON ip_blocks(expires_at);

-- RLS is enabled by default on new tables
ALTER TABLE ip_blocks ENABLE ROW LEVEL SECURITY;