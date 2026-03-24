// gameEngine.js — v7: Progression-driven puzzle engine
// Core principle: the engine always knows what the player should do next.

class GameEngine {
  constructor() { this.sessions = new Map(); this.TTL = 3600000; this._reap(); }

  create(sid, world) {
    const s = {
      currentRoom: world.rooms[0].id,
      inventory: [],
      flags: {},
      patience: 100,
      patienceEffects: [],
      hintCount: 0,
      hintLevel: {},        // stepId → 0-2 (escalating hints)
      startTime: Date.now(),
      itemsPickedUp: [],
      achievements: [],
      ending: null,
      escaped: false,
      npcState: { present: false, blockingHotspot: null, appearedAt: null, bribed: false, brideCount: 0 },
      wildCardUsed: false,
      wildCardConsequence: false,
      wildCardTimer: null,
      wildCardTimerSecs: world.wild_card?.timer_seconds || 90,
      entityArrived: false,
      entityAppeased: false,
      emailsRead: [],
      actionCount: 0,
      // ── PROGRESSION STATE ──
      completedSteps: [],    // step IDs that are done
      currentObjective: '',
      failedAttempts: {},    // hotspotId → count (for stuck detection)
      lastInteracted: null,
      stuckCount: 0,         // increments when same thing fails repeatedly
    };
    // Set initial objective
    s.currentObjective = this._getNextObjective(s, world);
    this.sessions.set(sid, { state: s, world, lastActive: Date.now() });
    return s;
  }

  get(sid) { const e = this.sessions.get(sid); if (!e) return null; e.lastActive = Date.now(); return e; }

  // ══════════════════════════════════════════════════════════
  // PROGRESSION ENGINE — knows the puzzle dependency graph
  // ══════════════════════════════════════════════════════════

  // Get all steps available in the current room that aren't completed yet
  _getAvailableSteps(s, w) {
    const prog = w.progression || [];
    return prog.filter(step =>
      step.room === s.currentRoom &&
      !s.completedSteps.includes(step.id) &&
      step.requires.every(req => s.completedSteps.includes(req) || s.flags[req] || this._has(s, req))
    );
  }

  // Get the NEXT step the player should focus on (first available with requirements met)
  _getNextStep(s, w) {
    const available = this._getAvailableSteps(s, w);
    // Prioritize steps whose hotspot hasn't been attempted much
    return available.sort((a, b) => {
      const aAttempts = s.failedAttempts[a.hotspot] || 0;
      const bAttempts = s.failedAttempts[b.hotspot] || 0;
      return aAttempts - bAttempts;
    })[0] || null;
  }

  _getNextObjective(s, w) {
    const next = this._getNextStep(s, w);
    if (next) return next.objective;
    // Check if there's an incomplete step in any room (need to move rooms)
    const prog = w.progression || [];
    const incomplete = prog.find(step =>
      !s.completedSteps.includes(step.id) &&
      step.requires.every(req => s.completedSteps.includes(req) || s.flags[req] || this._has(s, req))
    );
    if (incomplete) return incomplete.objective;
    return 'Explore and find the way forward.';
  }

  // Mark a step as complete, update objective
  _completeStep(s, w, stepId) {
    if (!s.completedSteps.includes(stepId)) {
      s.completedSteps.push(stepId);
      const step = (w.progression || []).find(p => p.id === stepId);
      if (step) {
        step.grants.forEach(g => { s.flags[g] = true; });
      }
    }
    s.currentObjective = this._getNextObjective(s, w);
    s.stuckCount = 0; // Reset stuck counter on progress
  }

  // Get hotspots that are currently RELEVANT (have available steps)
  _getRelevantHotspots(s, w) {
    const available = this._getAvailableSteps(s, w);
    return available.map(step => step.hotspot);
  }

  // Smart hint: based on current step, escalating
  _smartHint(s, w) {
    s.hintCount++;
    const next = this._getNextStep(s, w);
    if (!next) {
      // Maybe player needs to move rooms
      const prog = w.progression || [];
      const nextAny = prog.find(step =>
        !s.completedSteps.includes(step.id) &&
        step.requires.every(req => s.completedSteps.includes(req) || s.flags[req] || this._has(s, req))
      );
      if (nextAny && nextAny.room !== s.currentRoom) {
        return this._R(s, true, `💡 You've done everything in this room. Head to the door to proceed.`, 'hint');
      }
      return this._R(s, true, '💡 Look around carefully. Something in this room will help.', 'hint');
    }

    // Escalating hints: level 0 → 1 → 2
    const level = s.hintLevel[next.id] || 0;
    const hint = next.hints[Math.min(level, next.hints.length - 1)];
    s.hintLevel[next.id] = Math.min(level + 1, 2);

    this._drain(s, 2);
    return this._R(s, true, `💡 ${hint}`, 'hint');
  }

  // Stuck detection: if player clicks same thing 3+ times with no progress
  _trackAttempt(s, hotspotId, success) {
    if (success) {
      s.failedAttempts[hotspotId] = 0;
      s.stuckCount = 0;
    } else {
      s.failedAttempts[hotspotId] = (s.failedAttempts[hotspotId] || 0) + 1;
      if (s.lastInteracted === hotspotId) {
        s.stuckCount++;
      } else {
        s.stuckCount = 1;
      }
    }
    s.lastInteracted = hotspotId;
  }

  // ══════════════════════════════════════════════════════════
  // ACTION PROCESSING
  // ══════════════════════════════════════════════════════════

  processAction(sid, action) {
    const entry = this.get(sid);
    if (!entry) return { ok: false, message: 'Session not found.', event: 'error', state: null };
    const { state: s, world: w } = entry;
    s.actionCount++;
    if (s.patience <= 0 && !s.ending) return this._burnout(s, w);

    let r;
    switch (action.type) {
      case 'interact':     r = this._interact(s, w, action.target); break;
      case 'use_item':     r = this._useItem(s, w, action.target, action.payload); break;
      case 'submit':       r = this._submit(s, w, action.payload); break;
      case 'hint':         r = this._smartHint(s, w); break;
      case 'read_email':   r = this._email(s, w, action.target); break;
      case 'use_wildcard': r = this._useWC(s, w); break;
      case 'appease':      r = this._appease(s, w); break;
      case 'bribe_npc':    r = this._bribeNpc(s, w); break;
      case 'cipher_wheel': r = this._cipher(s, w, action.payload); break;
      case 'puzzle_dial':  r = this._dial(s, w, action.payload); break;
      default: r = this._R(s, false, 'Unknown action.');
    }

    this._tickNpc(s, w);
    this._checkEntity(s, w, r);
    this._pFx(s);

    // Attach progression info to every response
    r.relevantHotspots = this._getRelevantHotspots(s, w);
    r.stuckCount = s.stuckCount;
    r.nextStep = this._getNextStep(s, w)?.id || null;

    return r;
  }

  // ── INTERACT ────────────────────────────────────────────────

  _interact(s, w, hsId) {
    const room = this._room(w, s.currentRoom);
    if (!room) return this._R(s, false, 'Room not found.');

    // NPC blocking
    if (s.npcState.present && s.npcState.blockingHotspot === hsId) {
      const line = w.npc.dialogues[Math.floor(Math.random() * w.npc.dialogues.length)];
      this._drain(s, 8);
      return this._R(s, false, `${w.npc.name} blocks your path. "${line}"`, 'npc');
    }

    const hs = room.hotspots.find(h => h.id === hsId);
    if (!hs) return this._R(s, true, 'Nothing interesting here.', 'info');
    const inter = hs.interaction;

    // Wild card hidden check
    const wc = w.wild_card;
    if (wc && wc.hidden_hotspot === hsId && wc.hidden_in === s.currentRoom && !s.flags['wc_found']) {
      s.flags['wc_found'] = true;
      s.inventory.push({ id: 'wild_card', name: wc.name, desc: wc.description, type: 'wild_card', emoji: wc.emoji || '🔮' });
      s.itemsPickedUp.push('wild_card');
      this._trackAttempt(s, hsId, true);
      return this._R(s, true, `Hidden here: ${wc.name}. ${wc.description}`, 'orb_found');
    }

    // Requires check — give CLEAR feedback about what's needed
    if (inter.requires && !s.flags[inter.requires] && !this._has(s, inter.requires)) {
      this._drain(s, 3);
      this._trackAttempt(s, hsId, false);
      return this._R(s, false, inter.locked_message || 'You need something to interact with this.', 'locked');
    }

    switch (inter.type) {
      case 'pickup': {
        if (s.flags[`p_${hsId}`]) { this._trackAttempt(s, hsId, false); return this._R(s, true, 'Already taken.', 'already_done'); }
        const item = w.items[inter.item];
        if (!item) return this._R(s, true, hs.description, 'info');
        s.flags[`p_${hsId}`] = true;
        s.inventory.push({ id: inter.item, name: item.name, desc: item.description, type: item.type, emoji: item.emoji || '📦' });
        s.itemsPickedUp.push(inter.item);
        if (inter.grants_flag) s.flags[inter.grants_flag] = true;
        // Check if this completes a progression step
        this._checkStepCompletion(s, w, hsId, 'interact');
        this._trackAttempt(s, hsId, true);
        return this._R(s, true, inter.success_message || `Found: ${item.name}`, 'pickup');
      }

      case 'examine': {
        if (inter.grants_flag) s.flags[inter.grants_flag] = true;
        this._checkStepCompletion(s, w, hsId, 'interact');
        this._trackAttempt(s, hsId, true);
        return this._R(s, true, inter.success_message || hs.description, 'examine');
      }

      case 'container': {
        if (s.flags[`o_${hsId}`]) { this._trackAttempt(s, hsId, false); return this._R(s, true, 'Already searched.', 'already_done'); }
        s.flags[`o_${hsId}`] = true;
        if (inter.item) {
          const it = w.items[inter.item];
          if (it) { s.inventory.push({ id: inter.item, name: it.name, desc: it.description, type: it.type, emoji: it.emoji || '📦' }); s.itemsPickedUp.push(inter.item); }
        }
        if (inter.grants_flag) s.flags[inter.grants_flag] = true;
        this._checkStepCompletion(s, w, hsId, 'interact');
        this._trackAttempt(s, hsId, true);
        return this._R(s, true, inter.success_message || 'Found something inside.', 'pickup');
      }

      case 'puzzle_gate': {
        if (inter.grants_flag && s.flags[inter.grants_flag]) {
          this._trackAttempt(s, hsId, false);
          return this._R(s, true, 'Already solved.', 'already_done');
        }
        // Gate needs requires met
        if (inter.requires && !s.flags[inter.requires] && !this._has(s, inter.requires)) {
          this._trackAttempt(s, hsId, false);
          this._drain(s, 3);
          return this._R(s, false, inter.locked_message || 'You need something first.', 'locked');
        }
        // If requirements met, apply the flag and consume item if specified
        if (inter.grants_flag) s.flags[inter.grants_flag] = true;
        if (inter.consumes_item) this._removeItem(s, inter.consumes_item);
        this._checkStepCompletion(s, w, hsId, 'interact');
        this._trackAttempt(s, hsId, true);
        // Return 'unlock' when a flag was granted (meaningful progress), 'puzzle_prompt' otherwise
        const evType = inter.grants_flag ? 'unlock' : 'puzzle_prompt';
        return this._R(s, true, inter.success_message || hs.description, evType);
      }

      case 'door': {
        const rooms = w.rooms.map(r => r.id), ci = rooms.indexOf(s.currentRoom);
        if (inter.requires && !s.flags[inter.requires] && !this._has(s, inter.requires)) {
          this._drain(s, 4);
          this._trackAttempt(s, hsId, false);
          return this._R(s, false, inter.locked_message || 'Locked. You need to solve this room\'s puzzles first.', 'locked');
        }
        if (ci === rooms.length - 1) return this._escape(s, w);
        s.currentRoom = rooms[ci + 1];
        this._restore(s, 15);
        this._checkStepCompletion(s, w, hsId, 'interact');
        s.currentObjective = this._getNextObjective(s, w);
        this._trackAttempt(s, hsId, true);
        return this._R(s, true, inter.success_message || `Entered ${w.rooms[ci + 1]?.name}.`, 'room_change');
      }

      case 'email':
        return this._R(s, true, 'A document. Click READ to open.', 'email_available', { room: s.currentRoom });

      case 'flavor':
        this._trackAttempt(s, hsId, true);
        return this._R(s, true, inter.success_message || hs.description, 'flavor');

      default:
        return this._R(s, true, hs.description, 'info');
    }
  }

  // Check if an action completes a progression step
  _checkStepCompletion(s, w, hotspotId, actionType) {
    const prog = w.progression || [];
    prog.forEach(step => {
      if (step.hotspot === hotspotId && !s.completedSteps.includes(step.id)) {
        // Steps with no flag (like door transitions) complete on successful interaction
        if (step.flag === null) {
          this._completeStep(s, w, step.id);
          return;
        }
        // Check if step's flag is now set
        if (step.flag && s.flags[step.flag]) {
          this._completeStep(s, w, step.id);
          return;
        }
        // Check grants that are now satisfied
        if (step.grants.every(g => s.flags[g] || this._has(s, g))) {
          this._completeStep(s, w, step.id);
        }
      }
    });
  }

  // ── USE ITEM ──────────────────────────────────────────────

  _useItem(s, w, hsId, itemId) {
    if (!this._has(s, itemId)) return this._R(s, false, "You don't have that.");
    const room = this._room(w, s.currentRoom);
    const hs = room?.hotspots.find(h => h.id === hsId);
    if (!hs) return this._R(s, false, "Can't use that here.");
    if (hs.interaction.requires === itemId) {
      s.flags[itemId] = true;
      if (hs.interaction.grants_flag) s.flags[hs.interaction.grants_flag] = true;
      this._removeItem(s, itemId);
      this._checkStepCompletion(s, w, hsId, 'use_item');
      this._trackAttempt(s, hsId, true);
      return this._R(s, true, hs.interaction.success_message || 'Used successfully.', 'unlock');
    }
    if (itemId === w.npc?.bribe_item && s.npcState.present) return this._bribeNpc(s, w);
    this._trackAttempt(s, hsId, false);
    return this._R(s, false, "That doesn't work here.", 'error');
  }

  // ── SUBMIT (text input) ──────────────────────────────────

  _submit(s, w, text) {
    const inp = (text || '').trim().toUpperCase(), p = w.puzzles;
    const ci = w.rooms.map(r => r.id).indexOf(s.currentRoom);

    // Room 1: password — only active after finding the note
    if (ci === 0 && p.password) {
      if (s.flags['password_solved']) return this._R(s, true, 'Already solved.', 'already_done');
      if (!s.completedSteps.includes('find_note') && !s.flags['note_found']) {
        return this._R(s, false, "You haven't found anything to enter a code into yet. Explore the room first.", 'info');
      }
      if (inp === p.password.answer.toUpperCase()) {
        s.flags['password_solved'] = true;
        s.flags[p.password.target_hotspot + '_solved'] = true;
        this._restore(s, 10);
        if (p.password.unlock_item && w.items[p.password.unlock_item]) {
          const ui = w.items[p.password.unlock_item];
          s.inventory.push({ id: p.password.unlock_item, name: ui.name, desc: ui.description, type: ui.type, emoji: ui.emoji || '📦' });
          s.itemsPickedUp.push(p.password.unlock_item);
        }
        this._checkStepCompletion(s, w, p.password.target_hotspot, 'submit');
        // Also mark the step directly
        this._completeStep(s, w, 'solve_desk');
        return this._R(s, true, p.password.unlock_message || 'Accepted!', 'unlock');
      }
      this._drain(s, 6);
      this._trackAttempt(s, 'submit_password', false);
      return this._R(s, false, `"${text.trim()}" — wrong password.`, 'error');
    }

    // Room 2: cipher code
    if (ci === 1 && p.cipher) {
      if (s.flags['cipher_solved']) return this._R(s, true, 'Already solved.', 'already_done');
      if (inp === p.cipher.answer) {
        s.flags['cipher_solved'] = true;
        s.flags[p.cipher.target_hotspot + '_solved'] = true;
        this._restore(s, 10);
        this._completeStep(s, w, 'solve_cipher');
        return this._R(s, true, 'Code accepted!', 'unlock');
      }
      this._drain(s, 5);
      this._trackAttempt(s, 'submit_cipher', false);
      return this._R(s, false, `"${text.trim()}" — wrong code.`, 'error');
    }

    // Room 3: keypad code
    if (ci === 2 && p.keypad) {
      if (s.flags['keypad_solved']) return this._R(s, true, 'Already solved.', 'already_done');
      if (!s.flags['dial_solved']) return this._R(s, false, 'The keypad is locked behind the combination lock. Solve that first.', 'locked');
      if (inp === p.keypad.code) {
        s.flags['keypad_solved'] = true;
        this._restore(s, 10);
        this._completeStep(s, w, 'enter_code');
        return this._R(s, true, 'Code accepted! The exit is open!', 'unlock');
      }
      this._drain(s, 5);
      this._trackAttempt(s, 'submit_keypad', false);
      return this._R(s, false, `"${text.trim()}" — wrong code.`, 'error');
    }

    return this._R(s, false, "Nothing to enter a code into right now. Interact with an object first.");
  }

  // ── CIPHER / DIAL ─────────────────────────────────────────

  _cipher(s, w, pl) {
    const p = w.puzzles.cipher; if (!p) return this._R(s, false, 'No cipher here.');
    if (s.flags['cipher_solved']) return this._R(s, true, 'Already solved.', 'already_done');
    if (!s.flags['runes_seen']) return this._R(s, false, 'You need to examine the encoded text first. Look for runes or symbols in the room.', 'info');
    const ans = (pl?.answer || '').trim();
    if (ans === p.answer || ans === p.decoded_text) {
      s.flags['cipher_solved'] = true;
      s.flags[p.target_hotspot + '_solved'] = true;
      this._restore(s, 10);
      this._completeStep(s, w, 'solve_cipher');
      return this._R(s, true, `Decoded! The code is ${p.answer}.`, 'unlock');
    }
    this._trackAttempt(s, 'cipher', false);
    return this._R(s, false, 'Not right — keep adjusting the shift.', 'error');
  }

  _dial(s, w, pl) {
    const p = w.puzzles.combination; if (!p) return this._R(s, false, 'No lock here.');
    if (s.flags['dial_solved']) return this._R(s, true, 'Already solved.', 'already_done');
    const att = pl?.combo || [];
    if (att.length === p.combo.length && att.every((v, i) => v === p.combo[i])) {
      s.flags['dial_solved'] = true;
      this._restore(s, 10);
      this._completeStep(s, w, 'solve_combo');
      if (s.wildCardConsequence) {
        s.flags['appease_item_found'] = true;
        const wc = w.wild_card;
        s.inventory.push({ id: 'appease_item', name: wc.appease_item_name, desc: wc.appease_item_description, emoji: '📜' });
      }
      return this._R(s, true, 'Combination correct! The keystone is revealed.', 'unlock');
    }
    this._drain(s, 4);
    this._trackAttempt(s, 'dial', false);
    return this._R(s, false, 'Wrong combination — the dials reset.', 'error');
  }

  // ── WILDCARD / NPC / EMAIL ────────────────────────────────

  _useWC(s, w) {
    if (!this._has(s, 'wild_card') || s.wildCardUsed) return this._R(s, false, "Can't use that.");
    s.wildCardUsed = true; this._removeItem(s, 'wild_card');
    const rooms = w.rooms.map(r => r.id), ci = rooms.indexOf(s.currentRoom);
    if (ci < rooms.length - 1) { s.currentRoom = rooms[ci + 1]; s.currentObjective = this._getNextObjective(s, w); }
    else s.flags['keypad_solved'] = true;
    s.wildCardConsequence = true; s.wildCardTimer = Date.now();
    return this._R(s, true, `${w.wild_card.use_message}\n\n⏱️ ${w.wild_card.timer_seconds}s until ${w.wild_card.consequence_name} arrives.`, 'orb_used');
  }

  _appease(s, w) {
    if (!s.wildCardConsequence) return this._R(s, false, 'Nothing to appease.');
    if (s.entityAppeased) return this._R(s, true, 'Already appeased.', 'already_done');
    if (!this._has(s, 'appease_item')) return this._R(s, false, `Need ${w.wild_card?.appease_item_name}.`);
    s.entityAppeased = true; s.wildCardTimer = null; this._removeItem(s, 'appease_item');
    return this._R(s, true, `${w.wild_card.consequence_name} accepts and recedes.`, 'entity_appeased');
  }

  _bribeNpc(s, w) {
    if (!s.npcState.present) return this._R(s, false, `${w.npc?.name} isn't here.`);
    if (!this._has(s, w.npc.bribe_item)) return this._R(s, false, 'Need the right offering.');
    s.npcState = { present: false, blockingHotspot: null, appearedAt: null, bribed: true, brideCount: (s.npcState.brideCount || 0) + 1 };
    return this._R(s, true, w.npc.bribe_message, 'npc_leave');
  }

  _tickNpc(s, w) {
    if (s.escaped || s.ending) return;
    if (s.npcState.present) { if (Date.now() - s.npcState.appearedAt > 15000) { s.npcState.present = false; s.npcState.blockingHotspot = null; } return; }
    if (s.actionCount > 5 && Math.random() < 0.07) {
      const room = this._room(w, s.currentRoom); if (!room) return;
      const bl = room.hotspots.filter(h => h.interaction.type !== 'door');
      if (bl.length) { const t = bl[Math.floor(Math.random() * bl.length)]; s.npcState.present = true; s.npcState.blockingHotspot = t.id; s.npcState.appearedAt = Date.now(); this._drain(s, 6); }
    }
  }

  _email(s, w, rid) {
    const room = this._room(w, rid || s.currentRoom);
    if (!room?.email) return this._R(s, false, 'Nothing to read.');
    if (!s.emailsRead.includes(room.id)) s.emailsRead.push(room.id);
    return this._R(s, true, '', 'show_email', room.email);
  }

  // ── ENDINGS ──────────────────────────────────────────────

  _escape(s, w) {
    s.escaped = true;
    const el = Math.round((Date.now() - s.startTime) / 1000);
    s.ending = s.wildCardUsed ? 'wild_card' : el < 120 ? 'speedrun' : 'standard';
    this._completeStep(s, w, 'escape');
    this._ach(s, el);
    s.currentObjective = 'You escaped!';
    return this._R(s, true, w.endings?.[s.ending]?.text || 'You escaped!', 'escape');
  }

  _burnout(s, w) {
    s.ending = 'burnout';
    this._ach(s, Math.round((Date.now() - s.startTime) / 1000));
    s.currentObjective = 'Game over.';
    return this._R(s, true, w.endings?.burnout?.text || 'You became part of this place.', 'burnout');
  }

  _ach(s, el) {
    const a = [];
    if (el < 120) a.push('speed_demon');
    if (s.hintCount === 0) a.push('no_hints');
    if (s.itemsPickedUp.length >= 5) a.push('hoarder');
    if (s.wildCardUsed) a.push('wild_card_user');
    if (s.npcState.bribed) a.push('npc_briber');
    if (s.patience >= 80) a.push('zen_master');
    if (s.emailsRead.length >= 3) a.push('lore_hound');
    if (s.ending === 'burnout') a.push('burnout');
    if (s.entityAppeased) a.push('entity_survived');
    s.achievements = a;
  }

  // ── PATIENCE ──────────────────────────────────────────────

  _drain(s, n) { s.patience = Math.max(0, s.patience - n); }
  _restore(s, n) { s.patience = Math.min(100, s.patience + n); }
  _pFx(s) {
    s.patienceEffects = [];
    if (s.patience <= 70) s.patienceEffects.push('unease');
    if (s.patience <= 50) s.patienceEffects.push('typos');
    if (s.patience <= 30) s.patienceEffects.push('dread');
    if (s.patience <= 10) s.patienceEffects.push('despair');
  }

  _checkEntity(s, w, r) {
    if (s.wildCardConsequence && s.wildCardTimer && (Date.now() - s.wildCardTimer) / 1000 >= s.wildCardTimerSecs && !s.entityArrived) {
      s.entityArrived = true; r.entityArrived = true; r.entityMessage = `${w.wild_card?.consequence_name} has arrived!`;
    }
  }

  // ── HELPERS ──────────────────────────────────────────────

  _room(w, id) { return w.rooms.find(r => r.id === id); }
  _has(s, id) { return s.inventory.some(i => i.id === id); }
  _removeItem(s, id) { s.inventory = s.inventory.filter(i => i.id !== id); }
  _R(s, ok, msg, ev, data) { return { ok, message: msg, event: ev || (ok ? 'info' : 'error'), state: this._pub(s), data }; }
  _pub(s) { return { ...s, flags: { ...s.flags } }; }
  _reap() { setInterval(() => { const n = Date.now(); for (const [k, v] of this.sessions) if (n - v.lastActive > this.TTL) this.sessions.delete(k); }, 60000); }
}

module.exports = GameEngine;
