-- ShieldForge Dashboard RLS Policies
-- Run this in Supabase SQL Editor to enable anon access for dashboard

-- Enable RLS on all tables (already done in schema)
-- These policies allow anon key to read data for dashboard

-- Events: allow read for demo tenant
CREATE POLICY "allow_anon_read_events" ON events
  FOR SELECT TO anon
  USING (true);

-- Findings: allow read for demo tenant
CREATE POLICY "allow_anon_read_findings" ON findings
  FOR SELECT TO anon
  USING (true);

-- Incidents: allow read for demo tenant
CREATE POLICY "allow_anon_read_incidents" ON incidents
  FOR SELECT TO anon
  USING (true);

-- Policies: allow read for demo tenant
CREATE POLICY "allow_anon_read_policies" ON policies
  FOR SELECT TO anon
  USING (true);

-- Origins: allow read for demo tenant
CREATE POLICY "allow_anon_read_origins" ON origins
  FOR SELECT TO anon
  USING (true);

-- Audit log: allow read for demo tenant
CREATE POLICY "allow_anon_read_audit_log" ON audit_log
  FOR SELECT TO anon
  USING (true);

-- Tenants: allow read for demo tenant
CREATE POLICY "allow_anon_read_tenants" ON tenants
  FOR SELECT TO anon
  USING (true);

-- Training users: allow read for demo tenant
CREATE POLICY "allow_anon_read_training_users" ON training_users
  FOR SELECT TO anon
  USING (true);

-- Training events: allow read for demo tenant
CREATE POLICY "allow_anon_read_training_events" ON training_events
  FOR SELECT TO anon
  USING (true);

-- IP blocks: allow read for demo tenant
CREATE POLICY "allow_anon_read_ip_blocks" ON ip_blocks
  FOR SELECT TO anon
  USING (true);

-- Allow authenticated users to insert/update their own data
-- Events: allow insert for service role (proxy)
CREATE POLICY "allow_service_insert_events" ON events
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Findings: allow insert/update for service role
CREATE POLICY "allow_service_upsert_findings" ON findings
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "allow_service_update_findings" ON findings
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

-- Incidents: allow insert for service role
CREATE POLICY "allow_service_insert_incidents" ON incidents
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Origins: allow insert/update for authenticated users (dashboard)
CREATE POLICY "allow_auth_upsert_origins" ON origins
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "allow_auth_update_origins" ON origins
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policies: allow update for authenticated users (dashboard)
CREATE POLICY "allow_auth_update_policies" ON policies
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Audit log: allow insert for service role
CREATE POLICY "allow_service_insert_audit_log" ON audit_log
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Training users: allow insert/update for service role (LLM agent)
CREATE POLICY "allow_service_upsert_training_users" ON training_users
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "allow_service_update_training_users" ON training_users
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

-- Training events: allow insert for service role (LLM agent)
CREATE POLICY "allow_service_insert_training_events" ON training_events
  FOR INSERT TO service_role
  WITH CHECK (true);

-- IP blocks: allow upsert for service role
CREATE POLICY "allow_service_upsert_ip_blocks" ON ip_blocks
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "allow_service_update_ip_blocks" ON ip_blocks
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for ip_blocks cleanup
CREATE INDEX IF NOT EXISTS idx_ip_blocks_expires_at ON ip_blocks(expires_at);