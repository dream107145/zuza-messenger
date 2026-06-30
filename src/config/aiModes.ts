import { normal } from './prompts/normal';
import { freaky } from './prompts/freaky';
import { cold } from './prompts/cold';

export const AI_MOODS: Record<string, string> = {
  normal,
  freaky,
  cold,
};

export function getFullPrompt(moodId: string): string {
  return AI_MOODS[moodId] || AI_MOODS['normal'];
}
