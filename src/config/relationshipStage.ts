import type { HistoryMessage } from '../lib/aiEngine';

export type RelationshipStageId = 'new' | 'warming' | 'comfortable' | 'close' | 'bonded';

export type RelationshipStage = {
  id: RelationshipStageId;
  week: number;
  label: string;
};

const MESSAGES_PER_WEEK = parseInt(process.env.RELATIONSHIP_MESSAGES_PER_WEEK || '50', 10);
const USE_CALENDAR_WEEKS = process.env.RELATIONSHIP_USE_CALENDAR !== 'false';

const STAGE_BY_WEEK: Array<{ minWeek: number; stage: RelationshipStageId; label: string }> = [
  { minWeek: 5, stage: 'bonded', label: 'deep trust & feelings' },
  { minWeek: 4, stage: 'close', label: 'close connection' },
  { minWeek: 3, stage: 'comfortable', label: 'comfortable & trusting' },
  { minWeek: 2, stage: 'warming', label: 'getting closer' },
  { minWeek: 1, stage: 'new', label: 'just met' },
];

export function getRelationshipWeek(messageCount: number, daysSinceFirstContact?: number): number {
  if (USE_CALENDAR_WEEKS && daysSinceFirstContact !== undefined && daysSinceFirstContact >= 0) {
    return Math.floor(daysSinceFirstContact / 7) + 1;
  }

  if (messageCount <= 0) return 1;
  return Math.floor(messageCount / MESSAGES_PER_WEEK) + 1;
}

export function getRelationshipStage(messageCount: number, daysSinceFirstContact?: number): RelationshipStage {
  const week = getRelationshipWeek(messageCount, daysSinceFirstContact);
  const match = STAGE_BY_WEEK.find((entry) => week >= entry.minWeek) || STAGE_BY_WEEK[STAGE_BY_WEEK.length - 1];
  return { id: match.stage, week, label: match.label };
}

export function isEarlyRelationship(stage: RelationshipStage): boolean {
  return stage.id === 'new' || stage.id === 'warming';
}

function extractHistoryText(msg: HistoryMessage): string {
  const parts = msg.parts;
  if (!parts?.length) return '';
  const first = parts[0];
  return typeof first === 'string' ? first : first?.text || '';
}

function isCasualSmallTalk(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 80) return false;
  return /^(hi|hey|hello|yo|sup|wassup|what'?s up|how are you|how r u|how are u|how u doing|how you doing|hows it going|how's it going|good morning|good night|gm|gn|hru|wyd|what are you doing|whats up)[\s?!.,]*$/i.test(trimmed)
    || /\b(how are you|how r u|how are u|how you doing|how u doing|what'?s up|whats up|wyd|hows it going)\b/i.test(trimmed);
}

const POSITIVE_VIBE_PATTERN =
  /\b(lol|lmao|haha|😂|funny|cute|pretty|hot|beautiful|gorgeous|love talking|enjoy|good chat|nice talking|miss you|thinking about you|you're amazing|youre amazing|you're the best|youre the best|i like you|like u|flirt|sexy|attractive|crush|vibe|fun chat|this is fun|you make me|can't stop|cant stop)\b/i;

const FLIRTY_USER_PATTERN =
  /\b(cute|pretty|hot|sexy|beautiful|gorgeous|fine|attractive|flirt|kiss|miss you|thinking about you|want you|turned on|horny|nudes?|bed|touch)\b/i;

export function detectPositiveChatVibe(userText: string, history: HistoryMessage[] = []): boolean {
  if (POSITIVE_VIBE_PATTERN.test(userText) || FLIRTY_USER_PATTERN.test(userText)) return true;

  const recentUserTexts = history
    .filter((msg) => msg.role === 'user')
    .slice(-6)
    .map(extractHistoryText)
    .filter(Boolean);

  let positiveHits = 0;
  for (const line of recentUserTexts) {
    if (POSITIVE_VIBE_PATTERN.test(line) || FLIRTY_USER_PATTERN.test(line)) positiveHits++;
  }

  return positiveHits >= 2 || (recentUserTexts.length >= 4 && positiveHits >= 1);
}

export function canNaturallyEscalate(
  messageCount: number,
  mood: string,
  userText: string,
  history: HistoryMessage[] = [],
  daysSinceFirstContact?: number
): boolean {
  if (mood === 'cold') return false;
  if (isCasualSmallTalk(userText)) return false;

  const stage = getRelationshipStage(messageCount, daysSinceFirstContact);
  if (stage.id === 'new' || stage.id === 'warming') return false;
  if (!detectPositiveChatVibe(userText, history)) return false;

  return stage.id === 'comfortable' || stage.id === 'close' || stage.id === 'bonded';
}

export function buildNaturalEscalationContext(
  messageCount: number,
  mood: string,
  userText: string,
  history: HistoryMessage[] = [],
  daysSinceFirstContact?: number
): string {
  if (!canNaturallyEscalate(messageCount, mood, userText, history, daysSinceFirstContact)) return '';

  const stage = getRelationshipStage(messageCount, daysSinceFirstContact);
  const lines = ['CHAT VIBE (going well — you may escalate naturally):'];

  if (stage.id === 'comfortable') {
    lines.push(
      '- Drop a light playful flirty line if it fits — teasing, compliments, "u know u like me" energy.',
      '- Keep it subtle. No explicit sexual talk yet unless they already went there.',
    );
  } else if (stage.id === 'close') {
    lines.push(
      '- You can start flirting naturally — warm, teasing, a little bold.',
      '- Hint at attraction or tension. Can get suggestive if the moment feels right.',
      '- Still one step at a time — don\'t jump to full sext out of nowhere.',
    );
  } else {
    lines.push(
      '- Deep trust + good vibe — you can start light sexual chat naturally if it fits.',
      '- Playful, hot, witty — not porn-script. Match how close you are.',
      '- You can initiate desire or tease them. If they pull back, chill out.',
    );
  }

  lines.push('- Do NOT force it every message. Maybe 1 in 4-5 replies when the convo is flowing.');
  lines.push('- Never on boring small talk like "how are you" or "hey".');

  if (mood === 'freaky') {
    lines.push('- Freaky mood: you can be bolder and more sexual when initiating.');
  }

  return lines.join('\n');
}

export function buildRelationshipContext(
  messageCount: number,
  mood: string,
  daysSinceFirstContact?: number
): string {
  const stage = getRelationshipStage(messageCount, daysSinceFirstContact);

  const timeLabel = USE_CALENDAR_WEEKS && daysSinceFirstContact !== undefined
    ? `${daysSinceFirstContact} day(s) texting`
    : `~${messageCount} messages`;

  const lines: string[] = [
    `RELATIONSHIP (${stage.label.toUpperCase()} — week ${stage.week}, ${timeLabel}):`,
  ];

  switch (stage.id) {
    case 'new':
      lines.push(
        '- You JUST started texting. Normal getting-to-know-you energy like real DMs.',
        '- Friendly, curious, light. Ask about them sometimes (work, day, hobbies).',
        '- NO flirting, NO pet names, NO "miss you", NO sexual talk, minimal emojis.',
        '- Keep it simple: "hey", "im good wbu", small talk, little jokes.',
      );
      break;
    case 'warming':
      lines.push(
        '- Week 2 vibe — warming up. Remember things they told you.',
        '- More open, inside jokes starting, slightly warmer tone.',
        '- Still not thirsty. Light teasing ok. Flirt only if they clearly flirt first.',
      );
      break;
    case 'comfortable':
      lines.push(
        '- Week 3+ — trust is building. More personal, more playful.',
        '- Tease more, share little things about your day/feelings.',
        '- If chat is going well, you can start light flirting naturally — not every message.',
      );
      break;
    case 'close':
      lines.push(
        '- You know each other well now. Real connection and care.',
        '- Check in on them, remember details, show you care about their life.',
        '- When vibe is good, you can flirt or get suggestive first — naturally, not thirsty.',
        '- Deeper talks feel normal. Still human texting, not a romance novel.',
      );
      break;
    case 'bonded':
      lines.push(
        '- Deep trust and feelings. You genuinely care about this person.',
        '- Communication is more intense — emotional, personal, sometimes vulnerable.',
        '- When chat is going well, you can start light sexual/flirty talk naturally — witty and human.',
        '- You can miss them, be jealous-playful, be real about feelings. Still text like a human.',
      );
      break;
  }

  if (mood === 'cold') {
    lines.push('- COLD MOOD overrides warmth — stay dry and dismissive regardless of stage.');
  }

  return lines.join('\n');
}
