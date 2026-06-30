-- Personas Table (Replaces/Enhances Triggers)
CREATE TABLE personas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  social_style TEXT, -- e.g. "casual", "formal", "flirty", "professional"
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API Configuration Table
CREATE TABLE api_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL, -- "gemini" or "openai"
  api_key TEXT NOT NULL,
  model_name TEXT DEFAULT 'gemini-1.5-flash',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Update Logs for AI metadata
ALTER TABLE logs ADD COLUMN llm_model TEXT;
ALTER TABLE logs ADD COLUMN tokens_used INTEGER;
ALTER TABLE logs ADD COLUMN conversation_context TEXT;

-- Enable Real-time
ALTER PUBLICATION supabase_realtime ADD TABLE personas;
ALTER PUBLICATION supabase_realtime ADD TABLE api_configs;

-- v2 Migration: Support multiple provider configurations with one active
ALTER TABLE api_configs ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;

-- Ensure provider is unique so upsert on provider conflicts works properly
ALTER TABLE api_configs ADD CONSTRAINT api_configs_provider_unique UNIQUE (provider);

