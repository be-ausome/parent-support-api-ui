// lib/router.ts
import type { Tone } from "./overlays";

export type Mode = "text" | "support_plan" | "social_story" | "routine_plan";

export function inferMode(message: string, fallback: Mode = "text"): Mode {
  const s = message.toLowerCase();
  // You can make this smarter later; keep it simple now.
  if (/(social story|social-story|write a story)/.test(s)) return "social_story";
  if (/(plan|support plan|strategy)/.test(s)) return "support_plan";
  if (/(routine|steps|schedule)/.test(s)) return "routine_plan";
  return fallback;
}

export function inferTone(message: string, uiTone?: Tone): Tone {
  if (uiTone) return uiTone; // respect user choice
  const s = message.toLowerCase();
  if (/(overwhelmed|hard|tired|exhausted|cry|stuck)/.test(s)) return "gentle";
  if (/(list|steps|how to|exactly|具体)/.test(s)) return "structured";
  if (/(fun|play|game|make it fun)/.test(s)) return "playful";
  return undefined;
}
