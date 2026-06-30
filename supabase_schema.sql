-- Triggers Table
CREATE TABLE triggers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword TEXT NOT NULL,
  response TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  jitter_min INTEGER DEFAULT 5,
  jitter_max INTEGER DEFAULT 45,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Logs Table
CREATE TABLE logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trigger_id UUID REFERENCES triggers(id),
  sender_id TEXT NOT NULL,
  message TEXT NOT NULL,
  response TEXT NOT NULL,
  delay_seconds INTEGER NOT NULL,
  status TEXT CHECK (status IN ('sent', 'pending', 'failed')) DEFAULT 'sent',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Real-time for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE triggers;
ALTER PUBLICATION supabase_realtime ADD TABLE logs;
