// gameMaster.js — v6: Narrative-first, theme-driven generation

const API_KEY = process.env.CLAUDE_API_KEY || '';

async function claudeCall(sys, user, maxTok = 4000) {
  if (!API_KEY) throw new Error('CLAUDE_API_KEY not set');
  console.log(`  [Claude] Calling (max_tokens=${maxTok})...`);
  const t0 = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTok, system: sys, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) { const e = await res.text(); throw new Error(`API ${res.status}: ${e.substring(0, 200)}`); }
  const d = await res.json();
  console.log(`  [Claude] ${((Date.now()-t0)/1000).toFixed(1)}s (stop: ${d.stop_reason}, tokens: ${d.usage?.output_tokens})`);
  if (d.stop_reason === 'max_tokens') console.warn('  [Claude] WARNING: truncated!');
  let raw = (d.content?.filter(b => b.type === 'text')?.map(b => b.text)?.join('') || '');
  return raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
}

function extractJSON(raw) {
  try { return JSON.parse(raw); } catch {}
  let s = -1, e = -1, d = 0, op = null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (s === -1 && (c === '{' || c === '[')) { s = i; op = c; d = 1; continue; }
    if (s !== -1) { if (c === op) d++; else if (c === (op === '{' ? '}' : ']')) { d--; if (d === 0) { e = i; break; } } }
  }
  if (s !== -1 && e !== -1) { try { return JSON.parse(raw.substring(s, e + 1)); } catch (err) { throw new Error(`JSON parse failed: ${err.message}`); } }
  throw new Error('No JSON found in response');
}

// ══════════════════════════════════════════════════════════
// HARDCODED WIZARD TOWER THEME — the polished showcase
// ══════════════════════════════════════════════════════════

const WIZARD_TOWER = {
  theme: {
    name: "The Archmage's Tower",
    tagline: "A spell went wrong. The tower is collapsing. Reverse it or become part of the rubble.",
    icon: "🧙",
    palette: { bg: "#0a0812", wall: "#1a1428", floor: "#0d0a16", accent: "#7b68ee", accent2: "#4a3a8a", fog: "rgba(123,104,238,0.08)", text: "#c8bfe0" },
    atmosphere: "mystical"
  },
  narrative: {
    premise: "You are an apprentice wizard — D- student, to be specific — who just touched the one thing in the Archmage's study that was labelled 'ABSOLUTELY DO NOT TOUCH'. The tower's self-destruct ward is now active. The building is folding in on itself like angry origami. You have minutes to find the counter-spell, assuming you can read. The Archmage's cat is judging you.",
    objective: "Find and cast the counter-spell before you become a permanent architectural feature.",
  },
  game_master_personality: "A weary, ancient magical tome that has seen fourteen apprentices fail this exact scenario. Speaks in dramatic whispers, drops devastatingly sarcastic commentary about your intelligence, and occasionally mentions that the last apprentice who failed is now 'part of the south wall'. Provides hints wrapped in insults.",
  rooms: [
    {
      id: "room_1", name: "The Archmage's Study",
      description: "Bookshelves line every wall, their contents trembling as the tower shudders. A massive desk dominates the center, covered in star charts and half-finished letters. Purple light pulses from cracks forming in the stone walls.",
      visual: {
        lighting: "flickering", particles: "sparks",
        wallStyle: "ancient_stone", floorStyle: "dark_wood",
        ambientColor: "#2a1a3a", accentLightColor: "#7b68ee",
        decorElements: ["floating dust motes that glow purple", "cracks in the walls leaking arcane light", "a window showing stars spinning unnaturally fast"]
      },
      objective: "Find the spellbook and the password to unlock the Archmage's desk.",
      hotspots: [
        {
          id: "bookshelf", label: "Ancient Bookshelf", x: 5, y: 15, w: 16, h: 35,
          description: "Floor-to-ceiling shelves packed with tomes. One book glows faintly — 'A Beginner's Guide to Not Destroying Everything'. A note is tucked inside: 'Desk password: the name of the first star. ARCTURUS.'",
          visual: { emoji: "📚", shape: "rect", primaryColor: "#3a2520", secondaryColor: "#1a1008", glowColor: "rgba(123,104,238,0.25)", scale: 1.3, objectType: "bookshelf" },
          interaction: { type: "container", item: "spellbook_note", requires: null, grants_flag: "note_found", success_message: "You pull out the glowing book. A note falls out — it reads: 'Desk password: ARCTURUS — the name of the first star.'", locked_message: null }
        },
        {
          id: "desk", label: "Archmage's Desk", x: 35, y: 35, w: 22, h: 22,
          description: "A massive oak desk with arcane symbols carved into its surface. A locked drawer pulses with contained energy. There's a runic keypad embedded in the wood — it needs a word.",
          visual: { emoji: "🪑", shape: "rect", primaryColor: "#2a1a10", secondaryColor: "#0d0804", glowColor: "rgba(200,170,100,0.2)", scale: 1.1, objectType: "desk" },
          interaction: { type: "puzzle_gate", item: null, requires: null, grants_flag: "desk_unlocked", success_message: "The runic keypad glows. Type the password to unlock the drawer.", locked_message: null }
        },
        {
          id: "crystal_ball", label: "Crystal Ball", x: 58, y: 20, w: 10, h: 15,
          description: "A cloudy crystal ball sits on a silver stand. As you peer inside, you see a vision: the Archmage casting the ward, muttering about three components needed to reverse it — a flame crystal, moonwater, and the counter-incantation.",
          visual: { emoji: "🔮", shape: "circle", primaryColor: "#4a3a6a", secondaryColor: "#1a0a2a", glowColor: "rgba(180,150,255,0.4)", scale: 0.8, objectType: "orb" },
          interaction: { type: "examine", item: null, requires: null, grants_flag: "vision_seen", success_message: "The crystal shows a vision: to reverse the collapse, you need THREE things — a flame crystal, moonwater, and the counter-incantation scroll. The scroll is locked in the desk.", locked_message: null }
        },
        {
          id: "wall_crack", label: "Glowing Wall Crack", x: 75, y: 10, w: 10, h: 20,
          description: "A deep crack in the wall leaks purple energy. Something glints inside — wedged between the stones, a small flame crystal pulses with inner fire.",
          visual: { emoji: "💎", shape: "diamond", primaryColor: "#8a3030", secondaryColor: "#3a0808", glowColor: "rgba(255,100,50,0.35)", scale: 0.7, objectType: "crystal" },
          interaction: { type: "pickup", item: "flame_crystal", requires: null, grants_flag: "has_flame_crystal", success_message: "You carefully extract the flame crystal. It's warm in your hand, pulsing like a heartbeat.", locked_message: null }
        },
        {
          id: "scattered_notes", label: "Scattered Papers", x: 20, y: 60, w: 12, h: 10,
          description: "Papers scattered across the floor by the tremors. Most are mundane — supply orders, student grades (yours: D-). But one is a letter from a colleague mentioning 'the moonwater fountain in the alchemy lab next door.'",
          visual: { emoji: "📜", shape: "rect", primaryColor: "#c4a872", secondaryColor: "#8a7040", glowColor: "rgba(200,180,120,0.15)", scale: 0.6, objectType: "papers" },
          interaction: { type: "email", item: null, requires: null, grants_flag: "letter_read", success_message: null, locked_message: null }
        },
        {
          id: "door_r1", label: "Laboratory Door", x: 85, y: 15, w: 12, h: 45,
          description: "A heavy iron-bound door leads to the alchemy laboratory. The lock mechanism requires the counter-incantation scroll to be in your possession — it's warded.",
          visual: { emoji: "🚪", shape: "arch", primaryColor: "#2a2a3a", secondaryColor: "#0a0a12", glowColor: "rgba(123,104,238,0.2)", scale: 1.3, objectType: "door" },
          interaction: { type: "door", item: null, requires: "counter_scroll", grants_flag: null, success_message: "The ward recognizes the scroll. The door groans open, revealing the alchemy lab.", locked_message: "The door's ward pulses — it won't open without the counter-incantation scroll from the desk." }
        }
      ],
      email: { from: "Archmage Veldris", subject: "RE: That Ward", body: "Apprentice — if you're reading this, I'm either dead or at the tavern. The self-destruct ward requires three components to reverse: a flame crystal (check the walls, they crack under stress), moonwater (the fountain in the lab still works), and the incantation scroll (in my desk, password is the first star I taught you). Hurry. The tower has perhaps ten minutes. — V" }
    },
    {
      id: "room_2", name: "The Alchemy Laboratory",
      description: "Bubbling apparatus and hanging herbs fill this circular room. A moonwater fountain gurgles in the corner, its liquid glowing silver. Strange symbols are etched into the central workbench — they look like a cipher.",
      visual: {
        lighting: "colored", particles: "spores",
        wallStyle: "ancient_stone", floorStyle: "stone_tile",
        ambientColor: "#0a1a1a", accentLightColor: "#00cc88",
        decorElements: ["bubbling flasks on shelves", "hanging dried herbs", "steam rising from cauldrons", "rune-etched stones embedded in walls"]
      },
      objective: "Collect moonwater and decode the rune cipher to unlock the ritual chamber.",
      hotspots: [
        {
          id: "fountain", label: "Moonwater Fountain", x: 8, y: 25, w: 16, h: 30,
          description: "A stone fountain carved with lunar phases. Silver-white water flows endlessly, defying the tower's trembling. You can collect some in an empty vial on the rim.",
          visual: { emoji: "⛲", shape: "arch", primaryColor: "#2a3a4a", secondaryColor: "#0a1218", glowColor: "rgba(180,200,255,0.3)", scale: 1.1, objectType: "fountain" },
          interaction: { type: "pickup", item: "moonwater", requires: null, grants_flag: "has_moonwater", success_message: "You fill the vial with moonwater. It glows with a cold, steady light.", locked_message: null }
        },
        {
          id: "rune_wall", label: "Rune Cipher Wall", x: 30, y: 10, w: 22, h: 30,
          description: "A section of wall covered in shifting runes. They seem to be encoded — a cipher of some kind. The central workbench has a decoder device.",
          visual: { emoji: "🔣", shape: "rect", primaryColor: "#1a2a2a", secondaryColor: "#0a1212", glowColor: "rgba(0,204,136,0.25)", scale: 1.2, objectType: "rune_wall" },
          interaction: { type: "examine", item: null, requires: null, grants_flag: "runes_seen", success_message: "The runes read (encoded): 'Wkh frgh lv 4812'. This is a letter-shift cipher — use the decoder on the workbench.", locked_message: null }
        },
        {
          id: "workbench", label: "Alchemist's Workbench", x: 50, y: 30, w: 18, h: 25,
          description: "A heavy stone workbench with a brass cipher decoder bolted to its surface. Rotate the rings to decode messages. Below it, a locked cabinet has a rune-lock requiring a numeric code.",
          visual: { emoji: "⚗️", shape: "rect", primaryColor: "#3a3a2a", secondaryColor: "#1a1a08", glowColor: "rgba(200,180,100,0.2)", scale: 1.0, objectType: "workbench" },
          interaction: { type: "puzzle_gate", item: null, requires: null, grants_flag: null, success_message: "The cipher decoder is ready. Use it to decode the rune wall message.", locked_message: null }
        },
        {
          id: "herb_shelf", label: "Herb Collection", x: 72, y: 15, w: 12, h: 25,
          description: "Shelves of dried herbs and exotic ingredients. A label catches your eye: 'Starbloom — warning: causes vivid hallucinations and uncontrollable honesty.' Below it, a tiny drawer contains a strange key shaped like a crescent moon.",
          visual: { emoji: "🌿", shape: "rect", primaryColor: "#2a3a20", secondaryColor: "#0a1a08", glowColor: "rgba(100,200,80,0.2)", scale: 0.9, objectType: "shelf" },
          interaction: { type: "container", item: "crescent_key", requires: null, grants_flag: "has_crescent_key", success_message: "Among the herbs, you find a crescent-shaped key. This might open something.", locked_message: null }
        },
        {
          id: "bubbling_cauldron", label: "Bubbling Cauldron", x: 35, y: 55, w: 14, h: 12,
          description: "A large iron cauldron that's been simmering for who-knows-how-long. The contents glow green. A sign reads: 'DO NOT DRINK. (This means you, apprentice.)'",
          visual: { emoji: "🫕", shape: "circle", primaryColor: "#1a3a1a", secondaryColor: "#0a1a0a", glowColor: "rgba(50,200,50,0.3)", scale: 0.8, objectType: "cauldron" },
          interaction: { type: "flavor", item: null, requires: null, grants_flag: null, success_message: "You peer into the cauldron. It bubbles menacingly. The sign says not to drink it. You have a brief, ill-advised thought.", locked_message: null }
        },
        {
          id: "door_r2", label: "Ritual Chamber Door", x: 85, y: 15, w: 12, h: 45,
          description: "A door covered in protective wards. A crescent-shaped keyhole is visible. The door hums with magical energy.",
          visual: { emoji: "🚪", shape: "arch", primaryColor: "#2a2040", secondaryColor: "#0a0818", glowColor: "rgba(123,104,238,0.3)", scale: 1.3, objectType: "door" },
          interaction: { type: "door", item: null, requires: "has_crescent_key", grants_flag: null, success_message: "The crescent key fits. The wards dissolve and the door swings open. The ritual chamber awaits.", locked_message: "A crescent-shaped keyhole. You need the right key." }
        }
      ],
      email: { from: "Lab Notes — Apprentice Thalia", subject: "Cipher Reference", body: "For anyone who forgot: the rune cipher on the wall uses a ROT-3 shift. Shift each letter back by 3 to decode. The Archmage thinks this is 'security'. I think it's laziness. Also — don't drink from the cauldron. I know you're thinking about it. Don't. — Thalia (former apprentice, currently a frog)" }
    },
    {
      id: "room_3", name: "The Ritual Chamber",
      description: "A vast circular room with a ritual circle etched into the floor, glowing faintly. Three pedestals surround it — one for fire, one for water, one for incantation. The ceiling is cracking, stars visible through the gaps. Time is running out.",
      visual: {
        lighting: "firelit", particles: "embers",
        wallStyle: "ancient_stone", floorStyle: "ritual_circle",
        ambientColor: "#1a0a0a", accentLightColor: "#ff6b35",
        decorElements: ["ritual circle glowing on floor", "three stone pedestals", "cracks in ceiling showing starfield", "floating debris from collapsing tower"]
      },
      objective: "Place the components on the pedestals and enter the final code to cast the counter-spell.",
      hotspots: [
        {
          id: "fire_pedestal", label: "Fire Pedestal", x: 15, y: 30, w: 14, h: 20,
          description: "A stone pedestal carved with flame motifs. An indentation at the top is shaped exactly like the flame crystal. When placed, it will ignite the first part of the counter-spell.",
          visual: { emoji: "🔥", shape: "hexagon", primaryColor: "#5a2010", secondaryColor: "#2a0808", glowColor: "rgba(255,100,30,0.35)", scale: 1.0, objectType: "pedestal" },
          interaction: { type: "puzzle_gate", item: null, requires: "has_flame_crystal", grants_flag: "fire_placed", consumes_item: "flame_crystal", success_message: "You place the flame crystal on the pedestal. It ignites with a roar — the ritual circle's first segment blazes to life!", locked_message: "The pedestal has an indentation for something... a crystal, perhaps. You need the flame crystal." }
        },
        {
          id: "water_pedestal", label: "Water Pedestal", x: 55, y: 30, w: 14, h: 20,
          description: "A pedestal of blue-veined marble, shaped to hold a vial. Lunar symbols orbit its base. When the moonwater is placed, it will activate the second segment of the ritual.",
          visual: { emoji: "💧", shape: "hexagon", primaryColor: "#1a2a4a", secondaryColor: "#0a1020", glowColor: "rgba(100,150,255,0.35)", scale: 1.0, objectType: "pedestal" },
          interaction: { type: "puzzle_gate", item: null, requires: "has_moonwater", grants_flag: "water_placed", consumes_item: "moonwater", success_message: "The moonwater vial clicks into place. Silver light floods the second segment of the ritual circle!", locked_message: "A vial-shaped indentation. You need moonwater." }
        },
        {
          id: "incantation_stand", label: "Incantation Stand", x: 35, y: 15, w: 14, h: 20,
          description: "A lectern at the head of the ritual circle. Place the counter-incantation scroll here and speak the final code to complete the spell. The whiteboard behind it has the Archmage's notes — three circled numbers: 3, 7, 1.",
          visual: { emoji: "📖", shape: "arch", primaryColor: "#3a2a1a", secondaryColor: "#1a1008", glowColor: "rgba(255,215,0,0.3)", scale: 1.0, objectType: "lectern" },
          interaction: { type: "examine", item: null, requires: null, grants_flag: "notes_seen", success_message: "The Archmage's notes behind the lectern show three circled numbers: 3, 7, 1. These must be the combination for the final lock.", locked_message: null }
        },
        {
          id: "combination_lock", label: "Arcane Lock", x: 35, y: 45, w: 14, h: 16,
          description: "A three-dial magical lock sealing the final component of the ritual. Set the correct combination to unlock it. The Archmage's notes nearby might help.",
          visual: { emoji: "🔒", shape: "circle", primaryColor: "#3a3a4a", secondaryColor: "#1a1a20", glowColor: "rgba(200,200,255,0.25)", scale: 0.9, objectType: "lock" },
          interaction: { type: "puzzle_gate", item: null, requires: null, grants_flag: null, success_message: "The arcane lock is ready. Set the dials to the correct combination.", locked_message: null }
        },
        {
          id: "final_keypad", label: "Ritual Keystone", x: 35, y: 62, w: 14, h: 10,
          description: "The keystone of the ritual circle — a glowing panel that requires a four-digit code to activate the final counter-spell. The scroll mentions the code is hidden in the first letters of each room name.",
          visual: { emoji: "⭐", shape: "diamond", primaryColor: "#4a3a0a", secondaryColor: "#2a1a04", glowColor: "rgba(255,215,0,0.4)", scale: 0.8, objectType: "keystone" },
          interaction: { type: "puzzle_gate", item: null, requires: "dial_solved", grants_flag: null, success_message: "The keystone awaits the final four-digit code. The scroll hints: 'The code is 7349 — the year of the First Convergence.'", locked_message: "The keystone is behind the arcane lock. Solve the combination first." }
        },
        {
          id: "exit_door", label: "Tower Exit", x: 85, y: 15, w: 12, h: 45,
          description: "The tower's main exit. Sealed by the self-destruct ward. Only completing the counter-spell ritual will open it. Beyond — freedom, fresh air, and a very awkward conversation with the Archmage.",
          visual: { emoji: "✨", shape: "arch", primaryColor: "#3a3050", secondaryColor: "#1a1028", glowColor: "rgba(255,215,0,0.3)", scale: 1.4, objectType: "door" },
          interaction: { type: "door", item: null, requires: "keypad_solved", grants_flag: null, success_message: "The counter-spell ACTIVATES! The cracks seal, the shaking stops, and the exit door flies open. Sunlight. Actual sunlight. You're free.", locked_message: "The exit is sealed by the self-destruct ward. Complete the ritual to break it." }
        }
      ],
      email: { from: "Counter-Spell Scroll", subject: "Final Instructions", body: "To complete the ritual: place flame crystal on fire pedestal, moonwater on water pedestal, scroll on incantation stand. Then enter the code of the First Convergence (7349) into the ritual keystone. WARNING: All three pedestals must be activated before the keystone will accept input. If the tower collapses before you finish... well, you won't be around to regret it." }
    }
  ],
  items: {
    spellbook_note: { name: "Apprentice's Note", description: "Reads: 'Desk password: ARCTURUS'", type: "clue", emoji: "📝" },
    counter_scroll: { name: "Counter-Incantation Scroll", description: "The scroll needed to reverse the self-destruct ward.", type: "key_item", emoji: "📜" },
    flame_crystal: { name: "Flame Crystal", description: "A pulsing crystal of living fire. Warm to the touch.", type: "key_item", emoji: "💎" },
    moonwater: { name: "Moonwater Vial", description: "Silver liquid that glows with cold lunar light.", type: "key_item", emoji: "🧪" },
    crescent_key: { name: "Crescent Key", description: "A key shaped like a crescent moon. Opens warded doors.", type: "key_item", emoji: "🌙" },
  },
  puzzles: {
    password: { room: "room_1", target_hotspot: "desk", answer: "ARCTURUS", hint_item: "spellbook_note", clue_text: "ARCTURUS — the name of the first star", unlock_item: "counter_scroll", unlock_message: "The drawer slides open. Inside: the Counter-Incantation Scroll! This is what you need." },
    cipher: { room: "room_2", type: "rot3", encoded_text: "Wkh frgh lv 4812", decoded_text: "The code is 4812", answer: "4812", target_hotspot: "workbench" },
    combination: { room: "room_3", combo: [3, 7, 1], clue_location: "Archmage's notes behind the lectern", clue_description: "Three circled numbers: 3, 7, 1" },
    keypad: { room: "room_3", code: "7349", clue_method: "Written in the counter-spell scroll — the year of the First Convergence" }
  },
  wild_card: {
    name: "Orb of Displacement", description: "A sphere of pure spatial magic. Using it will teleport you through the next barrier — but magic this volatile attracts attention from other planes.", emoji: "🌀",
    hidden_in: "room_2", hidden_hotspot: "bubbling_cauldron",
    use_message: "You crush the orb. Space folds around you and you're THROUGH the door — but the air shimmers with planar energy.",
    consequence_name: "The Void Librarian", consequence_description: "A being of ink and starlight materializes, demanding you return its displaced spatial energy. It's filling out interdimensional paperwork.",
    timer_seconds: 90, appease_item_name: "Signed Spatial Waiver", appease_item_description: "A form from the Bureau of Interdimensional Affairs. Sign it to appease the Void Librarian."
  },
  npc: {
    name: "The Familiar", description: "The Archmage's cat familiar — still sentient, deeply unimpressed.",
    emoji: "🐱",
    dialogues: [
      "The Archmage would be so disappointed. Actually, the Archmage IS so disappointed. I can feel it. Through the astral plane.",
      "You know the counter-spell requires three components, right? I'm not going to tell you which ones. I'm a cat. I'm choosing chaos.",
      "I could help you, but watching you fumble is genuinely the most entertainment I've had in three centuries.",
      "Have you tried reading? There are several thousand books in here. At least ONE of them isn't about you failing.",
      "The tower is collapsing and you're standing there. Classic D- energy. The Archmage predicted this EXACT scenario.",
      "I've seen fourteen apprentices attempt this. The south wall? That's Derek. Nice kid. Terrible at magic."
    ],
    bribe_item: "moonwater", bribe_message: "The cat sniffs the moonwater, takes a delicate sip, and saunters away. 'Fine. I'll stop blocking this. But only because moonwater is delicious.'"
  },
  endings: {
    standard: { title: "THE TOWER STANDS", text: "The counter-spell ignites. Cracks seal, stones reset, the ward dissolves. You stumble out into daylight, covered in dust and existential dread. The Archmage will be furious. But alive-furious beats dead, which is a low bar you've now successfully cleared. Your grade remains D-." },
    speedrun: { title: "PRODIGAL APPRENTICE", text: "You reversed a self-destruct ward in under two minutes. The Archmage is genuinely speechless. The cat is grudgingly impressed. Your grade has been upgraded from D- to D. Don't let it go to your head." },
    wild_card: { title: "SPATIALLY COMPROMISED", text: "You escaped, but you used forbidden spatial magic. The Void Librarian has filed seventeen forms against you in triplicate. Your mailbox will never be normal again. On the bright side, you're alive. On the not-bright side, interdimensional postage is expensive." },
    burnout: { title: "ABSORBED INTO THE STONES", text: "The tower collapsed. You are now architecturally part of a very nice pile of magical rubble. Derek from the south wall says hi. The cat survived, obviously. Cats always survive." }
  },
  // ── PROGRESSION: dependency graph for puzzles ──
  // Each step: what to do, what it needs, what it gives, and 3 escalating hints
  progression: [
    // Room 1
    { id: 'find_note', room: 'room_1', hotspot: 'bookshelf', action: 'interact',
      requires: [], grants: ['note_found'], flag: 'o_bookshelf',
      objective: 'Search the study for clues about the Archmage\'s desk password.',
      hints: [
        'The study is full of books. One of them might be useful.',
        'Check the bookshelf — one book seems to glow differently.',
        'Click the Ancient Bookshelf to search it. A note inside has the desk password.'
      ]},
    { id: 'examine_crystal', room: 'room_1', hotspot: 'crystal_ball', action: 'interact',
      requires: [], grants: ['vision_seen'], flag: 'vision_seen',
      objective: 'Examine the crystal ball to understand what you need.',
      hints: [
        'There\'s a crystal ball in the room. It might show you something.',
        'The crystal ball can reveal what components you need to escape.',
        'Click the Crystal Ball — it shows you need 3 things: flame crystal, moonwater, and the scroll.'
      ]},
    { id: 'get_crystal', room: 'room_1', hotspot: 'wall_crack', action: 'interact',
      requires: [], grants: ['has_flame_crystal'], flag: 'p_wall_crack',
      objective: 'Find the flame crystal hidden somewhere in the study.',
      hints: [
        'The walls are cracking from the ward\'s energy. Something might be lodged in one.',
        'Look at the glowing crack in the wall — something is wedged inside.',
        'Click the Glowing Wall Crack to extract the flame crystal.'
      ]},
    { id: 'solve_desk', room: 'room_1', hotspot: 'desk', action: 'submit',
      requires: ['note_found'], grants: ['password_solved','has_scroll'], flag: 'password_solved',
      objective: 'Use the password from the note to unlock the Archmage\'s desk.',
      hints: [
        'You found a note with a password. The desk has a runic keypad.',
        'The note says the password is ARCTURUS. Click the desk, then type it.',
        'Click the Archmage\'s Desk → INTERACT → type ARCTURUS in the chat box and press Enter.'
      ]},
    { id: 'open_door_1', room: 'room_1', hotspot: 'door_r1', action: 'interact',
      requires: ['password_solved'], grants: ['room_2_open'], flag: null,
      objective: 'Proceed to the Alchemy Laboratory.',
      hints: [
        'You have the scroll. The door should let you through now.',
        'The Laboratory Door\'s ward recognizes the scroll. Click it.',
        'Click the Laboratory Door to move to Room 2.'
      ]},
    // Room 2
    { id: 'examine_runes', room: 'room_2', hotspot: 'rune_wall', action: 'interact',
      requires: [], grants: ['runes_seen'], flag: 'runes_seen',
      objective: 'Find and examine the encoded runes in the lab.',
      hints: [
        'There are strange symbols in this room. Look for encoded text.',
        'The wall has runes on it. Examine them to see the encoded message.',
        'Click the Rune Cipher Wall to see the encoded text.'
      ]},
    { id: 'solve_cipher', room: 'room_2', hotspot: 'workbench', action: 'cipher_wheel',
      requires: ['runes_seen'], grants: ['cipher_solved'], flag: 'cipher_solved',
      objective: 'Use the cipher device to decode the rune message.',
      hints: [
        'You\'ve seen the encoded runes. The workbench has a decoder.',
        'Click the workbench, use the cipher device. It\'s a ROT-3 shift — rotate 3 times.',
        'Open the cipher: rotate right 3 times until you see "The code is 4812". Click DECODE.'
      ]},
    { id: 'get_moonwater', room: 'room_2', hotspot: 'fountain', action: 'interact',
      requires: [], grants: ['has_moonwater'], flag: 'p_fountain',
      objective: 'Collect moonwater from the fountain.',
      hints: [
        'You need moonwater. Is there a water source in this room?',
        'The fountain in the corner has glowing moonwater. Click it.',
        'Click the Moonwater Fountain to collect a vial.'
      ]},
    { id: 'get_key', room: 'room_2', hotspot: 'herb_shelf', action: 'interact',
      requires: [], grants: ['has_crescent_key'], flag: 'o_herb_shelf',
      objective: 'Find the crescent key to open the next door.',
      hints: [
        'The door to the next room has a crescent-shaped keyhole. Find the key.',
        'Search the shelves — there might be a key hidden among the herbs.',
        'Click the Herb Collection — a crescent key is in a tiny drawer.'
      ]},
    { id: 'open_door_2', room: 'room_2', hotspot: 'door_r2', action: 'interact',
      requires: ['has_crescent_key'], grants: ['room_3_open'], flag: null,
      objective: 'Use the crescent key to enter the Ritual Chamber.',
      hints: [
        'You have the crescent key. The door has a matching keyhole.',
        'Click the Ritual Chamber Door to use the key.',
        'Click the Ritual Chamber Door — the crescent key fits.'
      ]},
    // Room 3
    { id: 'place_fire', room: 'room_3', hotspot: 'fire_pedestal', action: 'interact',
      requires: ['has_flame_crystal'], grants: ['fire_placed'], flag: 'fire_placed',
      objective: 'Place the flame crystal on the fire pedestal.',
      hints: [
        'The ritual circle needs three components. Place them on the pedestals.',
        'The fire pedestal is shaped for the flame crystal you found.',
        'Click the Fire Pedestal — it needs the flame crystal from Room 1.'
      ]},
    { id: 'place_water', room: 'room_3', hotspot: 'water_pedestal', action: 'interact',
      requires: ['has_moonwater'], grants: ['water_placed'], flag: 'water_placed',
      objective: 'Place the moonwater on the water pedestal.',
      hints: [
        'Another pedestal needs moonwater.',
        'Click the Water Pedestal to place the moonwater vial.',
        'Click the Water Pedestal — it needs the moonwater from Room 2.'
      ]},
    { id: 'read_notes', room: 'room_3', hotspot: 'incantation_stand', action: 'interact',
      requires: [], grants: ['notes_seen'], flag: 'notes_seen',
      objective: 'Read the Archmage\'s notes to find the combination.',
      hints: [
        'There are notes near the lectern. They might have useful numbers.',
        'The Archmage left notes with circled numbers behind the lectern.',
        'Click the Incantation Stand — the notes show the combination: 3, 7, 1.'
      ]},
    { id: 'solve_combo', room: 'room_3', hotspot: 'combination_lock', action: 'puzzle_dial',
      requires: ['notes_seen'], grants: ['dial_solved'], flag: 'dial_solved',
      objective: 'Enter the combination to unlock the ritual keystone.',
      hints: [
        'You\'ve seen numbers in the room. The lock needs a 3-digit combination.',
        'The Archmage\'s notes showed 3, 7, 1. Enter that on the lock.',
        'Click the Arcane Lock → set dials to 3, 7, 1 → click TRY.'
      ]},
    { id: 'enter_code', room: 'room_3', hotspot: 'final_keypad', action: 'submit',
      requires: ['dial_solved'], grants: ['keypad_solved'], flag: 'keypad_solved',
      objective: 'Enter the final code to activate the counter-spell.',
      hints: [
        'The keystone is unlocked. It needs a 4-digit code.',
        'The scroll mentions the code 7349 — the year of the First Convergence.',
        'Click the Ritual Keystone → type 7349 in the chat box and press Enter.'
      ]},
    { id: 'escape', room: 'room_3', hotspot: 'exit_door', action: 'interact',
      requires: ['keypad_solved'], grants: ['escaped'], flag: null,
      objective: 'The exit is open. Escape the tower!',
      hints: [
        'The counter-spell is active! The exit is open!',
        'Click the Tower Exit to escape!',
        'Click the EXIT door. You\'re free!'
      ]},
  ],
};

// ═══ AI THEME GENERATION ═══
async function generateThemes() {
  const wizardOption = { id: 'wizard_tower', name: "The Archmage's Tower", tagline: WIZARD_TOWER.theme.tagline, icon: "🧙", palette: WIZARD_TOWER.theme.palette, atmosphere: "mystical" };

  if (!API_KEY) {
    return [
      wizardOption,
      { ...wizardOption, id: 'wizard_tower_2', tagline: "(Set CLAUDE_API_KEY for AI-generated themes)" },
      { ...wizardOption, id: 'wizard_tower_3', tagline: "(Every playthrough will be unique with an API key)" },
    ];
  }

  try {
    const raw = await claudeCall(
      'Generate escape room themes. ONLY valid JSON array. No markdown.',
      `Generate 2 wildly different escape room themes. Make them unique, vivid, and immediately evocative.

Return JSON array of exactly 2:
[{
  "id": "snake_case",
  "name": "2-4 Word Name",
  "tagline": "One vivid sentence that sets the scene",
  "icon": "emoji",
  "palette": { "bg": "#hex dark", "wall": "#hex", "floor": "#hex", "accent": "#hex bright", "accent2": "#hex secondary", "fog": "rgba(r,g,b,0.08)", "text": "#hex light" },
  "atmosphere": "eerie|warm|cold|neon|organic|mystical|industrial|chaotic"
}]

Make palettes moody. Each theme must feel COMPLETELY different.`,
      2000
    );
    const aiThemes = extractJSON(raw);
    // Wizard tower always first, AI themes after
    return [wizardOption, ...aiThemes.slice(0, 2)];
  } catch (e) {
    console.warn('  [Themes] AI generation failed, using wizard tower only:', e.message);
    return [
      wizardOption,
      { ...wizardOption, id: 'wizard_tower_2', tagline: "(AI theme generation failed — try again)" },
      { ...wizardOption, id: 'wizard_tower_3', tagline: "(Click any to play the Wizard Tower)" },
    ];
  }
}

async function generateWorld(theme) {
  // Use hardcoded wizard tower for wizard themes OR as fallback
  if (!API_KEY || theme.id?.startsWith('wizard_tower')) {
    console.log('  [World] Using polished Wizard Tower theme');
    return JSON.parse(JSON.stringify(WIZARD_TOWER));
  }

  try {
  const raw = await claudeCall(
    'You design escape rooms. Return ONLY valid JSON. The world must feel COHESIVE — every object, puzzle, and description must reinforce the theme.',
    `Create a 3-room escape room. Theme: "${theme.name}" — ${theme.tagline}

DESIGN PRINCIPLES:
1. Every object must make sense in this world
2. Puzzles must feel like part of the environment, not abstract code entry
3. The player should understand their objective immediately
4. Visual descriptions should make the theme obvious

STRUCTURE (return this exact JSON):
{
  "theme": { "name": "${theme.name}", "tagline": "${theme.tagline}", "icon": "${theme.icon}", "palette": ${JSON.stringify(theme.palette)}, "atmosphere": "${theme.atmosphere}" },
  "narrative": { "premise": "2-3 sentences: where am I, why, what happened", "objective": "1 sentence: what must I do to escape" },
  "game_master_personality": "1-2 sentences describing the narrator's voice and personality for this specific theme",
  "rooms": [
    {
      "id": "room_1", "name": "Room Name",
      "description": "2-3 vivid sentences of what the player SEES",
      "visual": { "lighting": "flickering|dim|bright|colored|moonlit|firelit", "particles": "dust|embers|snow|sparks|spores|mist|none", "wallStyle": "style description", "floorStyle": "style description", "ambientColor": "#hex", "accentLightColor": "#hex", "decorElements": ["3-5 atmospheric details"] },
      "objective": "What the player needs to achieve in this room",
      "hotspots": [
        { "id": "unique_id", "label": "Name", "x": 10, "y": 20, "w": 14, "h": 22,
          "description": "Rich 2-3 sentence description with embedded clues",
          "visual": { "emoji": "emoji", "shape": "rect|circle|arch|diamond|hexagon", "primaryColor": "#hex", "secondaryColor": "#hex", "glowColor": "rgba(r,g,b,0.3)", "scale": 1.0, "objectType": "type" },
          "interaction": { "type": "pickup|examine|container|puzzle_gate|door|email|flavor", "item": "item_id or null", "requires": "flag_or_item_id or null", "grants_flag": "flag or null", "success_message": "what happens", "locked_message": "why it's blocked or null" }
        }
      ],
      "email": { "from": "sender", "subject": "subject", "body": "2-4 sentences of lore with clues" }
    }
  ],
  "items": { "id": { "name": "Name", "description": "desc", "type": "key_item|clue|consumable", "emoji": "emoji" } },
  "puzzles": {
    "password": { "room": "room_1", "target_hotspot": "id", "answer": "WORD", "hint_item": "item_id", "clue_text": "hint", "unlock_item": "item_given_on_solve or null", "unlock_message": "what happens" },
    "cipher": { "room": "room_2", "type": "rot3", "encoded_text": "text", "decoded_text": "decoded", "answer": "4 digits", "target_hotspot": "id" },
    "combination": { "room": "room_3", "combo": [3,7,1], "clue_location": "where", "clue_description": "how" },
    "keypad": { "room": "room_3", "code": "4 digits", "clue_method": "how discovered" }
  },
  "wild_card": { "name": "Name", "description": "desc", "emoji": "emoji", "hidden_in": "room_id", "hidden_hotspot": "hotspot_id", "use_message": "text", "consequence_name": "Name", "consequence_description": "text", "timer_seconds": 90, "appease_item_name": "name", "appease_item_description": "desc" },
  "npc": { "name": "Name", "emoji": "emoji", "dialogues": ["6 lines"], "bribe_item": "item_id", "bribe_message": "text", "description": "visual desc" },
  "endings": { "standard": {"title":"T","text":"t"}, "speedrun": {"title":"T","text":"t"}, "wild_card": {"title":"T","text":"t"}, "burnout": {"title":"T","text":"t"} }
}

CRITICAL: 5-7 hotspots per room. Door LAST per room. Hotspot x: 4-86, y: 8-62. All IDs unique. Puzzles SOLVABLE from clues. Objects must fit the theme!`,
    8192
  );

  const world = extractJSON(raw);
  // Validate
  if (!world.rooms?.length || world.rooms.length < 3) throw new Error('Need 3 rooms');
  if (!world.puzzles) throw new Error('Missing puzzles');
  world.rooms.forEach(r => {
    if (!r.hotspots) r.hotspots = [];
    if (!r.visual) r.visual = {};
    r.hotspots.forEach(hs => {
      if (!hs.interaction) hs.interaction = { type: 'flavor', success_message: hs.description || '' };
      if (!hs.visual) hs.visual = { emoji: '❓', shape: 'rect', primaryColor: '#333', secondaryColor: '#111', glowColor: 'rgba(255,255,255,0.1)', scale: 1 };
    });
  });
  if (!world.narrative) world.narrative = { premise: world.theme.tagline, objective: 'Escape.' };
  return world;
  } catch (e) {
    console.warn(`  [World] AI generation failed: ${e.message}`);
    console.warn(`  [World] Falling back to Wizard Tower theme`);
    return JSON.parse(JSON.stringify(WIZARD_TOWER));
  }
}

// ═══ AI CHAT ═══
async function chat(world, state, msg) {
  if (!API_KEY) return { reply: "The game master is unavailable. Press H for hints or explore the room." };
  const rooms = world.rooms.map(r => r.id);
  const ci = rooms.indexOf(state.currentRoom);
  const room = world.rooms[ci];
  const raw = await claudeCall(
    `You are the narrator for "${world.theme.name}". Personality: ${world.game_master_personality || 'Witty and atmospheric.'}\nRules: Stay in character. NEVER give direct answers. Give atmospheric nudges. 1-3 sentences max. Reference what the player can see.`,
    `Room: ${room?.name} (${ci+1}/3)\nObjective: ${room?.objective || 'Escape'}\nInventory: ${state.inventory.map(i=>i.name).join(', ')||'nothing'}\nFlags: ${Object.entries(state.flags).filter(([k,v])=>v).map(([k])=>k).join(', ')||'none'}\nPatience: ${state.patience}%\n\nPlayer: "${msg}"`,
    200
  );
  return { reply: raw };
}

module.exports = { generateThemes, generateWorld, chat, WIZARD_TOWER };
