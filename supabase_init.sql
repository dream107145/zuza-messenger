-- Run this in Supabase → SQL Editor (one shot setup)
-- https://supabase.com/dashboard → your project → SQL → New query

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Personas
CREATE TABLE IF NOT EXISTS personas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  system_prompt TEXT DEFAULT '',
  social_style TEXT DEFAULT 'normal',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API configs
CREATE TABLE IF NOT EXISTS api_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL UNIQUE,
  api_key TEXT NOT NULL DEFAULT '',
  model_name TEXT DEFAULT 'gemini-1.5-flash',
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Logs
CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message TEXT NOT NULL,
  response TEXT NOT NULL,
  persona_id UUID REFERENCES personas(id),
  llm_model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default Zuza persona
INSERT INTO personas (name, system_prompt, social_style, enabled)
SELECT 'Zuza', '', 'normal', true
WHERE NOT EXISTS (SELECT 1 FROM personas LIMIT 1);

-- RLS: allow dashboard (anon key) full access
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_personas" ON personas;
CREATE POLICY "anon_all_personas" ON personas FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_api_configs" ON api_configs;
CREATE POLICY "anon_all_api_configs" ON api_configs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_logs" ON logs;
CREATE POLICY "anon_all_logs" ON logs FOR ALL USING (true) WITH CHECK (true);

-- Realtime (optional — skip if this line errors, dashboard still works)
ALTER PUBLICATION supabase_realtime ADD TABLE logs;
ALTER PUBLICATION supabase_realtime ADD TABLE personas;
ALTER PUBLICATION supabase_realtime ADD TABLE api_configs;
