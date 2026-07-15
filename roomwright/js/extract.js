// Rule-based spatial statement extractor for imported prose.
// Finds sentences that carry spatial meaning, categorizes them, and proposes
// constraint candidates the user can accept into the database.
// Deliberately conservative: it proposes, the user confirms; nothing silently
// becomes canon.

const RULES = [
  { category: 'door', re: /\b(door|doorway|hatch|airlock|hatchway|threshold|door[- ]?frame|jamb|palm[- ]?plate)\b/i },
  { category: 'seating', re: /\b(chair|seat|cradle|bench|stool|sat down|slid into|dropped into|jump seat)\b/i },
  { category: 'console', re: /\b(console|panel|display|screen|throttle|controls?|interface|keyboard|station\b)\b/i },
  { category: 'railing', re: /\b(rail|railing|handhold|grab bar|banister)\b/i },
  { category: 'window', re: /\b(viewport|window|glass|canopy|porthole|dome)\b/i },
  { category: 'dimension', re: /\b(\d+(\.\d+)?\s*(m|meters?|metres?|feet|foot|ft|cm|paces?|steps?)|narrow|cramped|wide|shallow|deep|low[- ]ceiling|tiny|small room|crowded)\b/i },
  { category: 'adjacency', re: /\b(beside|next to|adjacent|behind|in front of|across from|between|aft of|forward of|port|starboard|above|below|opposite|corner|down the corridor|through the)\b/i },
  { category: 'movement', re: /\b(crossed|walked|stepped|paced|strode|climbed|ducked|squeezed|leaned|reached|crawled|padded|shoved through)\b/i },
  { category: 'sightline', re: /\b(saw|watch(ed|ing)?|visible|in view|caught sight|glanced|profile|reflection|line of sight|see the)\b/i },
  { category: 'furniture', re: /\b(table|shelf|locker|rack|crate|storage|cabinet|drawer|bunk|cot|bin|workbench)\b/i },
  { category: 'floor', re: /\b(deck|floor|plating|grate|sill|lip|underfoot|cross-?legged)\b/i },
  { category: 'lighting', re: /\b(light|lamp|dim|dark|glow|bright|shadow|emergency lighting)\b/i },
  { category: 'object', re: /\b(bolt|washer|mug|cup|datapad|slate|tool|coin|blanket|pencil)\b/i },
];

const ROOM_WORDS = /\b(bridge|helm|nav|cockpit|galley|medbay|cabin|quarters|corridor|hold|bay|airlock|storage|spine|dome|engineering|chamber)\b/i;

export function splitSentences(text) {
  return (text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(?:["’”']?)/g) || [])
    .map(s => s.trim()).filter(s => s.length > 12);
}

// Extract constraint candidates from raw text.
// Returns [{quote, category, categories, subject, score}]
export function extractCandidates(text) {
  const out = [];
  for (const s of splitSentences(text)) {
    const cats = [];
    for (const r of RULES) if (r.re.test(s)) cats.push(r.category);
    if (!cats.length) continue;
    const roomMatch = s.match(ROOM_WORDS);
    // score: category richness + presence of a room anchor + concreteness
    let score = cats.length + (roomMatch ? 2 : 0);
    if (/\d/.test(s)) score += 2;
    if (score < 3) continue;   // too weak to propose
    const subjWords = [];
    if (roomMatch) subjWords.push(roomMatch[0].toLowerCase());
    const m2 = s.match(/\b(door|hatch|chair|cradle|console|rail|bench|viewport|glass|table|shelf|locker|deck|floor|bunk|cot)\b/i);
    if (m2) subjWords.push(m2[0].toLowerCase());
    out.push({
      quote: s,
      category: cats[0],
      categories: cats,
      subject: subjWords.join(' — ') || cats[0],
      score,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
