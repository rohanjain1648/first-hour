# First Hour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a seated, hands-only mixed-reality strategy game. A flood hits a miniature town on the player's table, and four AI department heads (plus three behind-the-scenes agents) argue, whisper, and act through a deterministic simulation. It is deployed on Vercel for the Meta VR Start 2026 deadline.

**Architecture:**
- A pure TypeScript simulation (`src/sim`) owns all game truth and is fully unit-tested.
- A client-side orchestrator (`src/agents`) schedules agent turns. Each turn goes to one Vercel function (`api/turn.ts`) that calls Claude with structured output.
- Every agent action is validated by the simulation. Any AI failure falls back to a rule-based policy, so the game runs with the AI off.
- An IWSDK 1.0 layer (`src/xr`, `src/audio`, `src/game`) renders the board, handles pinch interactions, and runs the session flow.

**Tech Stack:** TypeScript, IWSDK 1.0 (`npm create @iwsdk@latest`, Three.js + ECS, UIKitML), Vitest, Zod, `@anthropic-ai/sdk`, Vercel (static + serverless), IWER + `@iwer/sem` for headset-free testing.

**Spec:** `docs/superpowers/specs/2026-11-14-first-hour-design.md`. Read it before any task. Section numbers below (§) refer to it.

## Global Constraints

- **Hands only.** Every action must be completable by pinch. No controller-only code paths. No voice input.
- **Seated.** Every interactive item must be 0.3–0.7 m from the head. Essential UI must sit inside the VR Glasses mask: 74° wide × 68° tall, 25° up / 43° down.
- **Time compression:** 10 real minutes = 60 game minutes (1 real s = 6 game s). Sim tick = 0.5 real s.
- **Grid:** 12 × 8. Fictional town "Harrow Bend". No real places, agencies, logos, or people. 10+ content: people are "in danger" / "safe", never shown hurt.
- **Agent line limits:** `say` ≤ 25 words; `rationale` ≤ 15 words; `messages[].text` ≤ 20 words; `memoryNote` ≤ 15 words; at most 2 proposals and 2 messages per turn.
- **AI:**
  - Model from env `AGENT_MODEL`, default `claude-haiku-5-5`, at effort `low`. The API key lives only in Vercel env `ANTHROPIC_API_KEY`, never in client code.
  - 8 s client timeout, then fallback.
  - At most 250 AI calls per session, then fallback for the rest of the session.
- **Performance:** ≤ 100k triangles, ≤ 60 draw calls, no real-time shadow maps, texture atlas ≤ 2048². Target 72 fps.
- **Persistence:** `localStorage` only. Every access is wrapped in try/catch.
- **Deadline:** submit by 2026-11-18 22:00 IST (hard close 2026-11-19 01:30 IST). The link must stay unchanged until about 2026-12-11.

## Review Focus

1. **An agent proposes an impossible action** (cell out of bounds, resource already deployed, wrong role, stale after 8 s). Expect: the action is rejected with a reason and logged, no crash, and the agent is told why next turn. Pinned in Task 4 and Task 9.
2. **`/api/turn` returns 429/500/invalid JSON, or the network drops mid-session.** Expect: a silent fallback for that turn, and the game continues. Pinned in Task 8.
3. **The session is hidden (headset off, system menu) while AI calls are in flight.** Expect: the clock stops, results arriving while paused are discarded, and the game resumes cleanly. Pinned in Task 5 and Task 9.
4. **Odd rooms:** no table; only a 0.44 m coffee table; two tables; a horizontal plane at 1.3 m (a shelf); planes with no semantic label. Expect: a sensible table pick or the virtual-desk fallback. Pinned in Task 6.
5. **`localStorage` throws or is empty** (private window, cleared data). Expect: the game runs as a first session. Pinned in Task 5.

---

## File Structure

```
index.html                 landing page (title, pitch, Start, AI On/Off)
iwsdk.config.json          (generated) world/emulator config
vite.config.ts             (generated)
vercel.json                build + function config
api/turn.ts                Vercel function: one agent turn -> Claude -> validated JSON
src/index.ts               entry: World.create, systems registration, session wiring
src/sim/types.ts           all sim types
src/sim/rng.ts             seeded RNG
src/sim/map.ts             Harrow Bend map
src/sim/flood.ts           water spread, sandbags, pump
src/sim/power.ts           substation, outages, generator, cuts
src/sim/people.ts          danger, rescue, evacuation pathing, compliance
src/sim/actions.ts         applyAction validation + effects
src/sim/engine.ts          createSim, tick, event log
src/sim/score.ts           outcome metrics + rating
src/agents/types.ts        AgentId, AgentState, TurnOutput (zod), TurnRequest
src/agents/roles.ts        role cards (goals, personality, domain, resources)
src/agents/observe.ts      partial observation per agent
src/agents/trust.ts        trust deltas
src/agents/lines.ts        template line banks
src/agents/fallback.ts     rule-based policies for all 7 agents
src/agents/aiClient.ts     fetch /api/turn with timeout + cost guard
src/agents/orchestrator.ts scheduling, inboxes, proposals, whispers, chips, freelancing
src/agents/director.ts     event deck selection (AI + fallback)
src/agents/rumor.ts        rumour generation (AI + fallback)
src/agents/debrief.ts      key moments + missed whispers (AI + fallback)
src/game/session.ts        flow state machine + pause
src/game/persist.ts        save/load
src/game/attention.ts      focus cone calc
src/xr/table.ts            chooseTable (pure) + plane reading
src/xr/board.ts            board mesh, cells, water, pop-up animation
src/xr/tray.ts             resource tokens, grab/drop to cell
src/xr/agentsView.ts       figures, badges, captions, proposal cards
src/xr/threads.ts          whisper arcs
src/xr/chips.ts            delegation chips
src/xr/hud.ts              pause dial, broadcast card, outcome card, debrief scrubber
src/audio/babble.ts        procedural spatial babble per agent
src/audio/ambient.ts       rain, sirens, chimes, token sounds
tests/**.test.ts           Vitest
```

---

### Task 1: Scaffold, test runner, and a live Vercel deploy

**Files:**
- Create: the project via generator, `vercel.json`, `api/turn.ts` (stub), `tests/smoke.test.ts`, `.gitignore`

**Interfaces:**
- Produces: `npm run dev`, `npm run build` → `dist/`, `npm test` (Vitest), `POST /api/turn` returning `{ok:true}` on Vercel.

- [ ] **Step 1:** In `d:\downloads\meta vr`, run `npm create @iwsdk@latest`. Choose: name `first-hour` (then move its contents to the repo root, or create in place); **Mixed reality / passthrough**; Customize: TypeScript, features **grabbing on, room surfaces/anchors on, physics off, locomotion off**, hand tracking on, Git init yes.
- [ ] **Step 2:** Run `npm run dev`. Expected: the dev server URL loads, the emulator shows the starter scene, and input can be toggled to hands.
- [ ] **Step 3:** `npm i zod @anthropic-ai/sdk` and `npm i -D vitest`. Add the script `"test": "vitest run"`. Write `tests/smoke.test.ts`: `expect(1+1).toBe(2)`. Run `npm test`. Expected: 1 passed.
- [ ] **Step 4:** Create `api/turn.ts` exporting `POST(req: Request): Promise<Response>` that returns `Response.json({ ok: true })`. Check the Vercel docs for the current non-Next.js function signature and adjust if needed. Create `vercel.json` with build command `npm run build` and output `dist`.
- [ ] **Step 5:** Push to a new GitHub repo, import it in Vercel, and add env `ANTHROPIC_API_KEY` (a new key named `first-hour`; set a ~$15 monthly limit in the Claude Console) and `AGENT_MODEL=claude-haiku-5-5`. Deploy.
- [ ] **Step 6:** Verify: the production URL serves the starter scene over HTTPS, and `curl -X POST <url>/api/turn` returns `{"ok":true}`.
- [ ] **Step 7:** Commit: `chore: scaffold IWSDK project, vitest, vercel function stub`.

---

### Task 2: Sim types, RNG, map, flood

**Files:**
- Create: `src/sim/types.ts`, `src/sim/rng.ts`, `src/sim/map.ts`, `src/sim/flood.ts`
- Test: `tests/sim/flood.test.ts`, `tests/sim/map.test.ts`

**Interfaces:**
- Produces:
  - `type CellType = 'river'|'bank'|'road'|'bridge'|'residential'|'hospital'|'school'|'substation'|'firestation'|'park'`
  - `interface Cell { x:number; y:number; type:CellType; elevation:0|1|2|3|4|5; water:number; sandbags:number; residents:number; district:DistrictId; powered:boolean }`
  - `type DistrictId = 'riverside'|'oldtown'|'hillcrest'|'market'|'eastfield'`
  - `type ResourceType = 'crew'|'bus'|'sandbags'|'pump'|'fuel'`
  - `interface Token { id:string; type:ResourceType; cell:{x:number;y:number}|null; busyUntil:number }`
  - `interface GameEvent { t:number; type:string; actor:string; data:Record<string,unknown> }`
  - `interface SimState { seed:number; t:number /*game seconds*/; cells:Cell[][] /*[y][x]*/; tokens:Token[]; rain:number; generatorFuel:number; substationFlooded:boolean; bridgeIntact:boolean; compliance:Record<DistrictId,number>; cutDistricts:DistrictId[]; peopleInDanger:Record<string,number> /*cellKey->game s*/; harmed:number; saved:number; rumours:Rumour[]; log:GameEvent[]; modifier:'light'|'heavy'|'night' }`
  - `interface Rumour { id:string; text:string; district:DistrictId; severity:1|2|3; countered:boolean; t:number }`
  - `rng.ts`: `createRng(seed:number): () => number` (mulberry32)
  - `map.ts`: `buildHarrowBend(): Cell[][]`
  - `flood.ts`: `stepFlood(s:SimState, dtGame:number): void` (mutates)

- [ ] **Step 1: Failing tests (`map.test.ts`)**
  - `buildHarrowBend()` returns 8 rows × 12 cols.
  - Exactly one `hospital`, one `school`, one `substation`, one `firestation`, and ≥ 1 `bridge`.
  - The school's elevation is ≥ 4.
  - Every residential cell has `residents > 0`.
  - Total residents is between 800 and 1500.
  - River cells have elevation 0.
- [ ] **Step 2: Failing tests (`flood.test.ts`)**
  - `water spreads from river to lower neighbour`: a 3×1 test grid [river(elev 0, water 2), bank(elev 0), park(elev 3)] after 10 steps → the bank's water > 0 and the park's water === 0.
  - `sandbags block inflow`: same grid with `sandbags=3` on the bank → the bank's water stays 0 while the river level is < 3 + elevation.
  - `pump drains cell and neighbours`: a cell with water 1.0 and a pump token on it → after 20 game s the water is lower than without the pump.
  - `rain raises river`: `rain=1` → river water increases over 60 game s.
  - `deterministic`: the same seed + steps → deep-equal cells.
- [ ] **Step 3:** Run `npm test`. Expected: FAIL (modules missing).
- [ ] **Step 4:** Implement.
  - Map: hand-author the 12×8 layout as a string array (one char per type) plus an elevation array. A river runs left to right through rows 3–4, with a bridge at column 6. Riverside and Oldtown are low; Hillcrest is high with the school; the substation is in Market at elevation 1.
  - Flood: per step, the river gains `rain * k`. For each cell, move a fraction of the head difference `(water+elevation)` to each lower 4-neighbour. Sandbags add `+sandbags` to the target's effective wall height. A pump removes a fixed rate from its cell and neighbours. Constants are builder's tuning; aim for Riverside flooding in about 3 real minutes on `heavy`.
- [ ] **Step 5:** Run `npm test`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(sim): types, map, rng, flood`.

---

### Task 3: Power and people

**Files:**
- Create: `src/sim/power.ts`, `src/sim/people.ts`
- Test: `tests/sim/power.test.ts`, `tests/sim/people.test.ts`

**Interfaces:**
- Consumes: Task 2 types.
- Produces:
  - `stepPower(s:SimState, dtGame:number): void`
  - `stepPeople(s:SimState, dtGame:number): void`
  - `findPath(s:SimState, from:{x,y}, to:{x,y}): {x,y}[] | null` (BFS over road/bridge cells; a bridge is impassable if `!bridgeIntact`)
  - Constants exported from `people.ts`: `DANGER_WATER = 0.3`, `HARM_AFTER_GAME_S = 900`, `RESCUE_GAME_S = 120`

- [ ] **Step 1: Failing tests**
  - Power:
    - `substation floods when water > 0.5` → `substationFlooded`, every district's `powered=false`, and an event `power.outage` is logged.
    - `generator drains only during outage`, at 1 unit per game minute.
    - `fuel token resets generatorFuel to 60`.
    - `cut district unpowers its cells and prevents live-water event`: a flooded powered cell logs `hazard.livewater`; a cut one does not.
  - People:
    - `cell becomes in danger above DANGER_WATER`.
    - `harmed after HARM_AFTER_GAME_S without rescue` (counts move to `harmed`, event `people.harmed`).
    - `crew on cell for RESCUE_GAME_S moves residents to saved`.
    - `bus evacuates district to school scaled by compliance`: compliance 1.0 moves more people in 300 game s than compliance 0.3.
    - `findPath avoids broken bridge`: returns a longer path or null.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement to the rules in spec §6.2.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(sim): power and people`.

---

### Task 4: Actions, engine, score, replay

**Files:**
- Create: `src/sim/actions.ts`, `src/sim/engine.ts`, `src/sim/score.ts`
- Test: `tests/sim/actions.test.ts`, `tests/sim/engine.test.ts`

**Interfaces:**
- Produces:
  - `type Actor = 'player'|AgentId` (AgentId from Task 8: `'fire'|'hospital'|'utilities'|'press'`; declare the union here in `types.ts` and re-export from `agents/types.ts`)
  - `type Action = {kind:'deploy'; token:string; cell:{x:number;y:number}} | {kind:'recall'; token:string} | {kind:'cut_power'|'restore_power'; district:DistrictId} | {kind:'broadcast'; text:string; counters?:string} | {kind:'report'; fact:string}`
  - `applyAction(s:SimState, a:Action, actor:Actor, opts?:{delegated?:boolean}): {ok:true} | {ok:false; reason:string}`. Every result is logged as `action.ok` / `action.rejected`.
  - Role rules (agents only; the player may do anything):
    - fire may deploy `crew` and `sandbags`
    - hospital may deploy `fuel`
    - utilities may deploy `pump` and `sandbags`, and `cut_power`/`restore_power`
    - press may `broadcast`
  - `createSim(seed:number, modifier:SimState['modifier']): SimState` — tokens: 3 crew, 2 bus, 6 sandbags, 1 pump, 1 fuel.
  - `tick(s:SimState, dtReal:number): void` — converts with ×6 and runs flood → power → people at 0.5 s real steps.
  - `logEvent(s, type, actor, data): void`
  - `score(s:SimState): {safePct:number; hospitalUptimePct:number; rumoursCountered:number; rating:'A'|'B'|'C'|'D'|'E'}` (average trust is added by the caller)
  - `replay(seed, modifier, inputs:{tReal:number; action:Action; actor:Actor}[], untilReal:number): SimState`

- [ ] **Step 1: Failing tests**
  - `rejects out-of-bounds cell` (x=12) with reason containing `"bounds"`.
  - `rejects token already deployed`.
  - `rejects wrong role` (hospital deploying crew).
  - `rejects deploy onto river cell` for bus/crew.
  - `broadcast raises compliance and marks matching rumour countered`.
  - `every applyAction call appends exactly one log event`.
  - `tick(600 real s) ends at t=3600`.
  - `replay is deterministic`: two `replay` runs with the same inputs deep-equal on `cells`, `saved`, `harmed`.
  - `score returns A when everyone is safe and the hospital never lost power`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(sim): actions, engine, scoring, replay`.

---

### Task 5: Session flow, pause, persistence, attention

**Files:**
- Create: `src/game/session.ts`, `src/game/persist.ts`, `src/game/attention.ts`
- Test: `tests/game/session.test.ts`, `tests/game/persist.test.ts`, `tests/game/attention.test.ts`

**Interfaces:**
- Produces:
  - `type Phase = 'landing'|'finding'|'unfolding'|'onboarding'|'crisis'|'outcome'|'debrief'`
  - `class Session { phase:Phase; paused:boolean; epoch:number; constructor(clock:()=>number); start(); tableFound(); unfolded(); onboardingDone(); update(dtReal:number); pause(); resume(); onPhase(cb:(p:Phase)=>void) }`
    - `epoch` increments on every pause. The orchestrator drops any AI result tagged with an old epoch.
    - Onboarding ends at 90 real s at the latest.
    - Crisis runs 480 real s (1:30 → 9:30), then `outcome`.
  - `interface Save { version:1; sessions:number; bestRating?:string; upgrades:('levee'|'generator'|'bus2')[]; memories:Record<AgentId,string[]> /*≤3 each*/; lastModifier?:string }`
  - `loadSave(): Save` (returns a default on any error) and `writeSave(s:Save): void` (swallows errors)
  - `focusedAgent(headDir:{x,y,z}, headPos:{x,y,z}, agents:{id:AgentId; pos:{x,y,z}}[], coneDeg=20): AgentId|null`

- [ ] **Step 1: Failing tests**
  - `phases advance in order`.
  - `onboarding auto-ends at 90 s`.
  - `crisis ends after 480 real s`.
  - `pause stops update from advancing and bumps epoch`.
  - `loadSave returns default when localStorage.getItem throws` (stub a throwing `globalThis.localStorage`).
  - `writeSave does not throw when setItem throws`.
  - `memories capped at 3`.
  - `focusedAgent picks agent inside 20° and null when none`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(game): session flow, pause epochs, persistence, attention`.

---

### Task 6: XR scene — table finding, fallback desk, board render

**Files:**
- Create: `src/xr/table.ts`, `src/xr/board.ts`. Modify: `src/index.ts`, `index.html`
- Test: `tests/xr/table.test.ts`

**Interfaces:**
- Consumes: `SimState`, `Session`.
- Produces:
  - `interface PlaneInfo { center:{x,y,z}; width:number; depth:number; label?:string; horizontal:boolean }`
  - `chooseTable(planes:PlaneInfo[], head:{x,y,z}, floorY:number|null): PlaneInfo|null` — rules from spec §6.1: label `table`/`desk` preferred, then any horizontal plane; within 1.2 m of the head horizontally; 0.35–1.1 m above the floor (when floorY is null, 0.2–0.9 m below head height); nearest wins.
  - `fallbackDesk(head, floorY): PlaneInfo` — 0.45 m in front, at 0.72 m (or head − 0.30).
  - `class BoardView { constructor(world, plane:PlaneInfo); syncFrom(s:SimState):void; unfold(durationS=2):Promise<void>; cellAt(worldPoint):{x,y}|null; cellCenter(c:{x,y}):Vector3 }`
  - Board footprint: fit within the plane, max 0.9 × 0.6 m, min 0.5 × 0.35 m.

- [ ] **Step 1: Failing tests (`table.test.ts`)**
  - `picks labelled table over unlabelled closer plane`.
  - `accepts 0.44 m coffee table` (floor 0, plane at y=0.44).
  - `rejects shelf at 1.3 m`.
  - `picks nearest of two tables`.
  - `uses unlabelled horizontal plane when no labels`.
  - `returns null when nothing qualifies`.
  - `fallbackDesk is 0.45 m ahead at 0.72 m`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `chooseTable` and `fallbackDesk`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Wire XR in `index.ts`:
  - On Start, read detected planes through IWSDK's room-surfaces feature (look up the exact component/query names in the IWSDK docs or the bundled agent skills/MCP), map them to `PlaneInfo`, and call `chooseTable` with a 3 s timeout, then `fallbackDesk`.
  - In VR (no passthrough), build a simple dim room around the desk.
  - Build `BoardView` with instanced boxes per cell type (diorama palette), one animated translucent water mesh per cell (instanced, height = water), and blob shadows.
  - `index.html`: title, a one-line pitch, a Start button, and an AI On/Off toggle stored in `localStorage` key `fh.ai`.
- [ ] **Step 6: Manual verify in the emulator:**
  - Load the SEM `conference_room`. If the IWSDK dev server can't select SEM rooms, add a dev-only entry that installs IWER + `@iwer/sem` and calls `loadDefaultEnvironment('conference_room')`.
  - The board lands on the conference table.
  - With no room loaded, the fallback desk appears.
  - Run `sunlit_living_room` → the board lands on the coffee table.
  - FoV mask on: the whole board is visible when looking at it.
- [ ] **Step 7:** Commit: `feat(xr): table finding, fallback desk, board render`.

---

### Task 7: Hand interactions — tray, deploy, pause dial

**Files:**
- Create: `src/xr/tray.ts`, `src/xr/hud.ts` (pause dial only for now). Modify: `src/index.ts`

**Interfaces:**
- Consumes: `BoardView.cellAt/cellCenter`, `applyAction`, `Session.pause/resume`.
- Produces:
  - `class Tray { constructor(world, board:BoardView, onDrop:(tokenId:string, cell:{x,y}|null)=>void); sync(s:SimState):void }`
  - `class Hud { constructor(world, board); onPause(cb); onRecenter(cb); setPaused(p:boolean) }`

- [ ] **Step 1:** Tokens are IWSDK grabbables (the grab feature from Task 1; one-hand grab, translate only) laid out along the board's near edge.
  - On release: `cellAt` gives a cell → `applyAction({kind:'deploy'})`. If rejected or off the board → animate back to the tray and play the reject sound (Task 11).
  - A deployed token can be grabbed again; release on the tray → `recall`.
  - While hovering over the board, highlight the cell under the token.
- [ ] **Step 2:** Pause dial on the table corner: a ray-pinch (click) toggles pause and shows "Resume" / "Recenter".
  - Also hook the XR session visibility change and `document.visibilitychange` → `session.pause()`.
- [ ] **Step 3: Manual verify in the emulator (hands mode, mouse-hold pinch):**
  - Drop sandbags on a Riverside bank cell → the water stops there.
  - Drop a bus on the river → it returns to the tray.
  - Pause freezes the water.
- [ ] **Step 4:** Commit: `feat(xr): token tray with pinch deploy, pause dial`.

---

### Task 8: Agent core — types, roles, observation, trust, fallback, AI client

**Files:**
- Create: `src/agents/types.ts`, `src/agents/roles.ts`, `src/agents/observe.ts`, `src/agents/trust.ts`, `src/agents/lines.ts`, `src/agents/fallback.ts`, `src/agents/aiClient.ts`
- Test: `tests/agents/schema.test.ts`, `tests/agents/fallback.test.ts`, `tests/agents/aiClient.test.ts`, `tests/agents/trust.test.ts`

**Interfaces:**
- Produces:
  - `type AgentId = 'fire'|'hospital'|'utilities'|'press'`
  - `type SystemAgentId = 'director'|'rumor'|'debrief'`
  - `TurnOutput` zod schema exactly as in spec §6.3, with the word limits from Global Constraints enforced by `.refine` (word count). `proposals[].action` is the `Action` union from Task 4.
  - `interface AgentState { id:AgentId; trust:number; mood:'calm'|'tense'|'angry'|'relieved'; memory:string[] /*≤5 session*/; pastMemory:string[] /*≤3*/; inbox:InboxItem[]; holdsChip:boolean; lastFocusedT:number; inFlight:boolean }`
  - `type InboxItem = {from:'player'|AgentId|'sim'; text:string; t:number}`
  - `interface TurnRequest { agentId:AgentId|SystemAgentId; observation:unknown; inbox:InboxItem[]; memory:string[]; trust?:number; sessionId:string }`
  - `ROLES: Record<AgentId, {name:string; wants:string; personality:string; domain:string[]; deployable:ResourceType[]; canCutPower?:true; canBroadcast?:true; color:string}>` (content from spec §6.3 table)
  - `observe(s:SimState, id:AgentId): object` — only that agent's private fields (spec §6.3 table), plus public: time, rain, flooded districts, its own pending proposals
  - `TRUST = {approve:+5, deny:-3, ignoredPer30s:-2 /*after 60 s*/, eavesdropped:-5, chipGiven:+10, chipTaken:-8}`; `applyTrust(a:AgentState, delta:number)` clamps to 0–100
  - `fallbackTurn(s:SimState, a:AgentState, rng):TurnOutput` — utility scoring over allowed actions; line from `LINES[id][situation]`, where situation ∈ `calm|warning|crisis|gratitude|complaint|withholding`; about 12 lines per agent per situation; `withhold` only if trust < 30
  - `class AiClient { constructor(opts:{enabled:boolean; maxCalls:250; timeoutMs:8000}); turn(req:TurnRequest): Promise<TurnOutput|null>; calls:number }` — returns `null` on timeout, non-200, schema failure, disabled, or over the cap

- [ ] **Step 1: Failing tests**
  - `schema rejects say over 25 words`.
  - `schema rejects 3 proposals`.
  - `schema accepts valid output`.
  - `observe(fire) contains rescueCalls and not generatorFuel`.
  - `observe(hospital) contains generatorFuel and not rumours`.
  - `applyTrust clamps`.
  - `fallbackTurn always returns schema-valid output across 200 random states`.
  - `fallbackTurn withholds only under 30 trust`.
  - `fallback lines exist for every agent × situation (≥12)`.
  - aiClient (mock `fetch`):
    - `returns null on 500`
    - `returns null on 429`
    - `returns null on invalid JSON`
    - `returns null after 8000 ms` (fake timers)
    - `returns null after 250 calls without fetching`
    - `returns null when disabled`
    - `returns parsed output on valid 200`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(agents): schema, roles, observation, trust, fallback policies, AI client`.

---

### Task 9: Server turn function + orchestrator

**Files:**
- Modify: `api/turn.ts`
- Create: `src/agents/prompts.ts` (shared by server), `src/agents/orchestrator.ts`
- Test: `tests/agents/orchestrator.test.ts`, `tests/api/turn.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 5 and 8.
- Produces:
  - `api/turn.ts` `POST`:
    - Parse a `TurnRequest` and reject a bad body with 400.
    - Best-effort per-IP limit of 60 requests/min (in-memory Map) → 429.
    - Build the system prompt with `buildSystemPrompt(agentId)` from `prompts.ts` (role card, rules, output limits, "act only through listed actions", 10+ tone, fictional town). Put the user content in a JSON block.
    - Call `client.messages.create({ model: process.env.AGENT_MODEL ?? 'claude-haiku-5-5', max_tokens: 1024, output_config: { effort: 'low', format: { type: 'json_schema', schema: TURN_JSON_SCHEMA } }, system: [{type:'text', text, cache_control:{type:'ephemeral'}}], messages:[{role:'user', content}] })` — check the SDK README in the claude-api skill (TypeScript) for the exact structured-output field shape before writing.
    - Check `stop_reason` (`refusal` → 502). Parse the text block as JSON and return it.
    - No `temperature`.
  - `class Orchestrator { constructor(deps:{sim:SimState; session:Session; ai:AiClient; agents:Record<AgentId,AgentState>; rng; now:()=>number}); update(dtReal:number):void; playerApprove(proposalId):void; playerDeny(proposalId):void; giveChip(id:AgentId):void; takeChip(id:AgentId):void; eavesdrop(threadId):void; setFocus(id:AgentId|null):void; on(evt:'say'|'proposal'|'proposalResolved'|'whisper'|'trust', cb):void; proposals:Proposal[]; threads:Thread[] }`
  - `interface Proposal { id:string; agent:AgentId; action:Action; rationale:string; createdT:number; expiresT:number /*+15 real s*/ }`
  - `interface Thread { id:string; from:AgentId; to:AgentId; text:string; createdT:number; expiresT:number /*+8 s*/; heard:boolean }`
  - Turn triggers (spec §6.3):
    - a sim event in the agent's domain
    - an inbox message
    - a player action targeting it
    - a 20 real s heartbeat
  - One request in flight per agent. Each result is tagged with the `session.epoch` at request time and dropped if the epoch changed. Every action is re-validated by `applyAction` on arrival.
  - Unanswered proposals: auto-apply if the agent `holdsChip`, else expire.
  - Freelancing: unfocused > 45 s and no chip → may apply at most one own-role deploy per freelance window, logged `agent.freelance`.
  - Ignored trust decay per `TRUST`.
  - Private messages become `Thread`s; unheard expired threads are logged `whisper.missed`.

- [ ] **Step 1: Failing tests (`orchestrator.test.ts`, with a fake AiClient)**
  - `never two in-flight turns for one agent`.
  - `heartbeat triggers turn after 20 s`.
  - `result from old epoch is discarded` (pause between request and resolve).
  - `stale action rejected on arrival is logged and fed back to inbox`.
  - `approve applies action and +5 trust`.
  - `deny gives -3`.
  - `proposal expires after 15 s without chip`.
  - `proposal auto-applies with chip`.
  - `freelance after 45 s unfocused, max one deploy`.
  - `private message creates thread; unheard thread logs whisper.missed`.
  - `eavesdrop marks heard and applies -5 to both`.
  - `AI null falls back to fallbackTurn`.
- [ ] **Step 2: Failing tests (`turn.test.ts`, mocking `@anthropic-ai/sdk`)**
  - `400 on bad body`.
  - `429 after 60 requests from one IP`.
  - `uses AGENT_MODEL env`.
  - `502 on refusal`.
  - `returns parsed JSON`.
- [ ] **Step 3:** Run. Expected: FAIL.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** Run. Expected: PASS.
- [ ] **Step 6:** Deploy, then `curl` a real fire-agent turn against production. Expected: schema-valid JSON in < 8 s. Check the Claude Console cost column after 10 calls (expect cents).
- [ ] **Step 7:** Commit: `feat(agents): server turn function and orchestrator`.

---

### Task 10: Agents in the scene — figures, captions, proposals, threads, chips, attention

**Files:**
- Create: `src/xr/agentsView.ts`, `src/xr/threads.ts`, `src/xr/chips.ts`. Modify: `src/index.ts`

**Interfaces:**
- Consumes: `Orchestrator` events and methods, `focusedAgent`, `BoardView`.
- Produces:
  - `class AgentsView { constructor(world, board, orch); update(headPose) }` — 10–12 cm figures at 0° and ±30° on the far and side edges, ≤ 15° above eye level.
    - Badge: ray-pinch → `orch` report request (adds a player inbox item "report").
    - Caption bubble: the focused agent shows full text; others show an icon plus a one-line preview.
    - Proposal card with ✓/✗ (ray-pinch) above the agent.
    - Mood tint.
  - `ThreadsView`: an arc between two figures for 8 s; ray-pinch → `orch.eavesdrop`.
  - `ChipsView`: 2 gold grabbables on the tray; release within 0.12 m of a figure → `giveChip`; grab from a figure → `takeChip`.
  - Every frame: `orch.setFocus(focusedAgent(headDir, headPos, agents))`.

- [ ] **Step 1:** Implement the figures, badges, and captions (UIKitML panels or a canvas texture; keep the high-contrast palette).
- [ ] **Step 2:** Implement proposal cards and threads.
- [ ] **Step 3:** Implement chips.
- [ ] **Step 4: Manual verify in the emulator (hands mode, head-locked gaze, AI On):**
  - Within 60 s, agents speak.
  - Turning toward an agent expands its caption.
  - ✓ applies a sandbag proposal on the board.
  - A whisper arc appears, and pinching it shows the text.
  - A chip given to Fire makes its next proposal auto-apply.
  - Repeat with AI Off: everything still happens via fallback.
- [ ] **Step 5:** Commit: `feat(xr): agents, captions, proposals, whispers, chips, attention`.

---

### Task 11: Audio — babble and ambience

**Files:**
- Create: `src/audio/babble.ts`, `src/audio/ambient.ts`. Modify: `src/index.ts`

**Interfaces:**
- Produces:
  - `class Babble { constructor(ctx:AudioContext); voiceFor(id:AgentId, pos:Object3D); speak(id:AgentId, text:string, focused:boolean):void }` — procedural syllables: one per ~2 characters, capped at 3 s. Pitch/timbre per agent: fire low and gruff, hospital mid and soft, utilities mid and clipped, press high and quick. Uses a PannerNode (HRTF) or IWSDK spatial audio at the figure position. Unfocused = −12 dB.
  - `class Ambient { setRain(intensity:number); chime(kind:'event'|'reject'|'place'|'pickup'|'whisper') }` — sounds generated procedurally (noise for rain, oscillators for chimes). No external audio files are required.

- [ ] **Step 1:** Implement, resuming the `AudioContext` on the Start pinch (user gesture).
- [ ] **Step 2: Manual verify:** in the emulator, an agent's babble pans left/right with head rotation; rain follows `s.rain`; a rejected drop plays the reject chime.
- [ ] **Step 3:** Commit: `feat(audio): spatial babble and procedural ambience`.

---

### Task 12: Director, Rumor, broadcast

**Files:**
- Create: `src/agents/director.ts`, `src/agents/rumor.ts`. Modify: `src/xr/hud.ts` (broadcast card), `src/agents/orchestrator.ts`
- Test: `tests/agents/director.test.ts`, `tests/agents/rumor.test.ts`

**Interfaces:**
- Produces:
  - `type DeckEvent = 'bridge_collapse'|'generator_fault'|'bus_stranded'|'rumour_dam'|'rain_surge'|'substation_alarm'|'viral_livestream'`
  - `directorStep(s, ai, tReal): Promise<DeckEvent|null>` — called every 60 real s with an AI choice. The result must be in the deck and inside the timing windows (none before 1:30, ≤ 1 per 60 s). Fallback fixed schedule: `{180:'bridge_collapse', 300:'generator_fault', 390:'rumour_dam', 450:'bus_stranded'}` real seconds.
  - `applyDeckEvent(s, e:DeckEvent): void` (logs `deck.<e>`)
  - `rumorStep(s, ai, tReal): Promise<Rumour|null>` — every 45 real s, at most one; lowers the target district's compliance by `0.1*severity`; goes only into the press agent's observation. Fallback: templates.
  - Broadcast card: pinch → ask the press agent for `draft_broadcast` (3 options, via its next turn or the fallback) → 3 pinchable options → `applyAction({kind:'broadcast', text, counters})`. It recharges every 3 game minutes (30 real s).

- [ ] **Step 1: Failing tests**
  - `director rejects event outside deck`.
  - `director none before 90 s`.
  - `director at most one per 60 s`.
  - `fallback schedule fires bridge_collapse at 180 s`.
  - `bridge_collapse sets bridgeIntact=false`.
  - `rumour lowers compliance and only press observes it`.
  - `broadcast with counters marks rumour countered`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(agents): director, rumor, broadcast`.

---

### Task 13: Onboarding, outcome, debrief and replay, persistence wiring

**Files:**
- Create: `src/agents/debrief.ts`. Modify: `src/xr/hud.ts`, `src/index.ts`, `src/agents/orchestrator.ts`
- Test: `tests/agents/debrief.test.ts`

**Interfaces:**
- Produces:
  - `interface KeyMoment { t:number; what:string; principle:'objectives'|'span_of_control'|'delegation'|'verification'|'one_message'; feedback:string }`
  - `debriefFallback(s:SimState): {moments:KeyMoment[] /*3*/; missedWhispers:{t:number;text:string}[]}` — detects: an agent ignored > 90 s; a rumour uncountered > 3 game min; a chip given to an agent with trust < 30; a freelance action; the hospital going dark
  - `debrief(s, ai): Promise<same>` — AI with ≤ 200 compressed events; falls back
  - Onboarding script (spec §6.1): forced fallback lines in order — Fire "Commander, the river's rising. Pinch my badge for my report." → sandbag prompt → a scripted whisper between Utilities and Hospital. `Session.onboardingDone()` on the first sandbag drop or at 90 s.
  - Outcome card: `score()` plus average trust. Debrief panel: three moments; pinch-drag scrubber → `replay()` to a time, then `board.syncFrom`; missed-whispers list; Play again / Exit.
  - Persistence: on outcome, `writeSave` with sessions+1, best rating, one upgrade by rating (A/B → next of levee/generator/bus2), and ≤ 3 memory lines per agent from `memoryNote`s. On start, apply upgrades to `createSim` (levee = permanent sandbags on 2 Riverside bank cells; generator = fuel 90; bus2 = 3rd bus) and rotate `modifier`.

- [ ] **Step 1: Failing tests**
  - `fallback finds ignored-agent moment`.
  - `fallback finds uncountered rumour`.
  - `returns exactly 3 moments, padding with best-available`.
  - `missed whispers come from whisper.missed log events`.
  - `upgrades apply to createSim`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Manual verify:** play a full session in the emulator (AI On) → onboarding teaches the three verbs without text walls; the outcome card and debrief show; the scrubber replays the board; a second session shows an agent memory line and the upgrade.
- [ ] **Step 6:** Commit: `feat: onboarding, outcome, debrief with replay, persistence`.

---

### Task 14: Polish, performance, final deploy, video, submission

**Files:**
- Modify: as needed. Create: `docs/submission.md` (Devpost text draft)

- [ ] **Step 1: Performance pass.** Use the IWSDK/Three.js renderer info to log triangles and draw calls in dev. Expected: ≤ 100k and ≤ 60. Fix by instancing and merging.
- [ ] **Step 2: FoV pass.** With the VR Glasses mask on, all agents, cards, tray, and HUD are visible from the seated pose.
- [ ] **Step 3: Full checks:**
  - `npm test` all pass.
  - `npm run build` succeeds.
  - Deploy to production.
  - Play the production URL end to end twice in the emulator: AI On and AI Off (`fh.ai=0`).
  - One run with no SEM room (fallback desk).
  - If a Quest 3 is available, one run on device.
- [ ] **Step 4: Video (< 3 min):** record with OBS following spec §6.12. For the hero take, temporarily set `AGENT_MODEL=claude-opus-5-5` if Haiku's lines are flat, then switch back. Upload to YouTube as public.
- [ ] **Step 5: Write `docs/submission.md`:**
  - name; 140-character tagline; Track Gaming; Division New Experience
  - a description of 500 words or less: inspiration, how it was built, future plans
  - the hands note (every verb is a pinch; hands-only end to end)
  - target launch: Q2 2027
  - team: solo (the user fills in personal details)
- [ ] **Step 6:** The user submits on Devpost by 2026-11-18 22:00 IST. After that, no deploys to production until about 2026-12-11.
- [ ] **Step 7:** Commit: `chore: polish, perf, submission text`.
