// lib/overlays.ts
export type Tone = "gentle" | "structured" | "playful" | undefined;

export const toneOverlays: Record<Exclude<Tone, undefined>, string> = {
  gentle:
    "TONE=gentle.\n- Soft, validating sentences first.\n- Avoid commands; offer choices.\n- Warm, non-clinical language.\n- Keep ≤ 180 words.",
  structured:
    "TONE=structured.\n- Brisk, numbered steps when useful.\n- Concrete actions; minimal adjectives.\n- Keep ≤ 150–200 words.",
  playful:
    "TONE=playful.\n- Light, encouraging. One friendly metaphor max.\n- No sarcasm. Concrete before clever."
};

// Scenario/tag overlays — keep them SHORT to protect tokens.
const tagTexts: Record<string, string> = {
  transitions:
    "TAG=transitions.\n- Use Markdown sections per kernel.\n- Pre-cue (2–5 min), last-thing choice, bridge item (fidget/photo/water), visual timer, brief movement/quiet reset.",
  lunch:
    "TAG=lunch.\n- Cafeteria stimuli linger. Add 2-min quiet reset, sip water/chew, predictable path back to class.",
  dentist:
    "TAG=dentist.\n- Preview steps, noise reduction, hand fidget, break signal, early-day slot if possible.",
  bedtime:
    "TAG=bedtime.\n- Dim lights, predictable order, one calming anchor, screens off buffer, choice of last small step.",
  public_event:
    "TAG=public_event.\n- Map quiet space, arrive early, headphones, short visit permission, exit plan & signal.",
  school:
    "TAG=school.\n- Clear visual cues, short instructions, predictable routines, co-regulation before demands."
};

export function inferTags(input: string): string[] {
  const s = input.toLowerCase();
  const out: string[] = [];
  if (/(transition|switch|leave|leaving|back to class|pack up)/.test(s)) out.push("transitions");
  if (/(lunch|cafeteria)/.test(s)) out.push("lunch");
  if (/(dentist|dental|tooth|teeth)/.test(s)) out.push("dentist");
  if (/(bedtime|sleep|lights off)/.test(s)) out.push("bedtime");
  if (/(festival|park|fair|public|crowd|event)/.test(s)) out.push("public_event");
  if (/(school|teacher|classroom|class)/.test(s)) out.push("school");
  return Array.from(new Set(out));
}

export function buildOverlay(tone: Tone, tags: string[]): string {
  const bits: string[] = [];
  if (tone && toneOverlays[tone]) bits.push(toneOverlays[tone]);
  for (const t of tags) {
    const txt = tagTexts[t];
    if (txt) bits.push(txt);
  }
  // Cap overlay length defensively (keeps tokens tight)
  const maxChars = 900; // ~150 tokens
  const joined = bits.join("\n\n").slice(0, maxChars);
  return joined;
}
