# First Hour — Design

*Working title. Entry for the Meta VR Start Developer Competition 2026, Gaming track, New Experience division. Written 2026-11-14.*

## 1. Intent

**Problem.** In a disaster, the decisions made in the first hour are made by local officials who almost never practise them. Practice drills ("tabletop exercises") need a trained facilitator and a room full of people playing roles (fire, hospital, utilities, press). Most small towns, schools, hospitals and companies run them rarely or never because of the cost and coordination.

**Product.** First Hour is a seated, hands-only mixed-reality strategy game. A miniature town unfolds on the player's real table. A flash flood hits. Four AI department heads stand around the table and argue for what they need. They talk to each other in private, hold back information when they distrust you, and act on their own when you ignore them. You have one game hour (10 real minutes) and two hands. Afterwards, a debrief replays the decisions you made and the deals you missed.

**Why VR.** Five people arguing at once is unreadable on a flat screen. In VR, each agent has a place at the table and a spatial voice, so you can follow who is talking. Who you turn to *is* the decision about who gets your attention. Handing someone a physical authority chip *is* delegation. The town sits on your real table, so the room changes the game.

**Why now.** The competition closes 2026-11-18 12:00 PT (2026-11-19 01:30 IST). Meta's VR Glasses ship in spring 2027, are controller-free and designed for seated use, and IWSDK 1.0 is ready for them.

**Path to funding (pitch material, not built now).** A consumer strategy game first. Later a "drill mode" sold to emergency-management agencies, hospitals, schools and company incident-response teams, with real humans able to take seats in place of AI agents.

## 2. Goals, non-goals, anti-goals

**Goals (what success looks like by the deadline)**
1. A judge with a Quest 3 opens a link, pinches "Start", and within about 20 seconds a town is on their table. They finish a complete flood scenario plus debrief in about 10–12 minutes, using only hands.
2. Four embodied agents plus three behind-the-scenes agents act as real separate agents: separate private views of the town, separate goals, separate memory, and messages to each other.
3. The game still plays fully with the AI switched off (rule-based agents with pre-written lines). This passes the competition's "remove the third-party service" test and protects the live demo.
4. A video under 3 minutes recorded from the emulator. It shows the town on a table, agents arguing, the hand mechanics and the debrief.
5. A complete Devpost submission before the deadline.

**Non-goals (out of scope for this build)**
- Multiplayer or human role-players.
- Voice input. Voice output from a real text-to-speech service (a stretch goal only; see §6.6).
- More than one scenario. Real maps or real towns. Drill-mode business features. Accounts or analytics.
- Standing or room-scale movement. Locomotion.

**Anti-goals (would be a failure even if it technically works)**
- A chat wrapper: agents that only talk. Every agent output that matters must go through the town simulation as a checked action.
- Walls of text. Each agent line is at most 25 words, with one-line captions.
- Anything that needs a controller, or needs the player to stand or reach more than about 0.7 m.
- Gore or realistic casualty imagery. Keep it suitable for a 10+ rating: people are "in danger" or "safe", never shown hurt.
- Real place names, real agencies, logos or identifiable people (competition rules forbid them). The town is fictional: **Harrow Bend**.

## 3. Constraints

- **Competition hard rule:** fully usable with hands from start to finish, with no controller ever needed.
- **Competition guidelines:**
  - Seated, with every interaction within a 2 ft radius.
  - Quick to start, with clean pause and resume.
  - A satisfying session in 10 minutes or less.
  - Not a wrapper around a third-party service.
- **Judging (25% each):** innovation, experience design, technical implementation, polish.
  - Passthrough must matter.
  - Field-of-view-aware: essential UI must fit the VR Glasses' narrower view, 74° wide × 68° tall, 25° up and 43° down.
  - At least 60 fps on Quest.
  - Must hold up in rooms the developer never tested.
  - The video must show real footage, not AI-generated video.
- **Submission:**
  - A public HTTPS link that stays live and unchanged until about 2026-12-11.
  - A demo video under 3 minutes on YouTube or Vimeo.
  - The Devpost form: name, 140-character tagline, track, division, a description of 500 words or less (inspiration, how it was built, future plans), an optional note on hand interactions, target launch date, and team.
  - The entry is frozen at the deadline.
- **Eligibility:** the entrant's Start membership is pending. Building goes ahead regardless.
- **No headset.** All development and the demo video use the IWSDK dev server's browser emulator (IWER) plus its mixed-reality room add-on (`@iwer/sem`). Real-device performance and the feel of real pinches cannot be checked unless a Quest is borrowed.
- **Time:** about 4 days of build time.
- **Stack:** TypeScript on IWSDK 1.0 (Three.js plus an entity-component system). Node 22.14 is installed locally.

## 4. Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| A | Hosted voice agents (e.g. ElevenLabs Conversational AI), one per department head, as in the competing entry WeaVR | Fastest to get talking agents. But five live voice sessions are costly, agents can't talk to each other without relaying, voice-first works against the hands-first rule, and it fails the "remove the service" test | Rejected |
| **B** | **Our own multi-agent orchestrator on a small server. Each agent is a separate Claude call with its own observation, goals and memory, and returns structured actions that our simulation checks** | Genuine multi-agent design. Passes the "remove the service" test. Cheap and controllable. Private messages become the whisper mechanic. Cost: we write the coordination loop | **Chosen by the user** |
| C | Scripted agents (behaviour rules plus pre-written lines), with AI only in the debrief | Safest and no lag. But agents can't negotiate or surprise you, which throws away the agentic story | Kept as the **fallback layer** inside B |

## 5. Decided

**By the user:**
- The concept: First Hour.
- Approach B with C as the fallback.
- Gaming track.

**My calls (the user can override):**
- TypeScript plus IWSDK 1.0.
- Hosting on Vercel: the static build plus one serverless function, in one deploy and one HTTPS link.
- Model (**user chose low budget**): `claude-haiku-5-5` at low effort by default (about $0.10 per session), switchable to `claude-opus-5-5` with one environment variable for the demo recording if the arguing needs to be sharper. Use a new API key dedicated to this project, with a monthly spend limit of about $15 set in the Claude Console.
- Builder: solo; GitHub and Vercel accounts exist. Build time is 3 days.
- Agents "talk" in spatial babble plus captions, not real text-to-speech (see §6.6).
- Hybrid mixed reality with a virtual-desk fallback.
- Fictional town name.
- Persistence through `localStorage`.

## 6. The design

### 6.1 Session flow (10 real minutes = 60 game minutes; 1 real second = 6 game seconds)

| Real time | What happens |
|---|---|
| 0:00 | 2D landing page: title, one-line pitch, a big "Start" button, plus an "AI agents: On/Off" toggle (default On). Pinch or click Start, and an XR session begins: `immersive-ar` if supported, else `immersive-vr`. |
| 0:00–0:05 | **Table finding.** Look for a detected horizontal plane labelled `table` or `desk` within 1.2 m of the head and 0.35–1.1 m above the floor. Pick the nearest one. If none is found within 3 s, use the **fallback**: a virtual desk 0.45 m in front of the player at 0.72 m height (or 0.30 m below head height if the floor is unknown). In AR it floats over passthrough. In VR it sits in a simple, dim operations room. |
| 0:05–0:08 | The town board (scaled to fit at most 0.9 × 0.6 m, minimum 0.5 × 0.35 m) unfolds like a pop-up book. Rain starts. Four agents rise on the far edge and the side edges. |
| 0:08–1:30 | **First five minutes / onboarding, taught by the agents, no text walls.** The Fire Chief says, "Commander, the river's rising. Pinch my badge for my report." That teaches pinch-to-open. Next comes a sandbag prompt, which teaches grab-and-drop on a cell. Then a scripted whisper between Utilities and the Hospital, which teaches pinching the thread. The game clock starts after the first sandbag drop, or at 1:30 at the latest. |
| 1:30–9:30 | **Crisis play.** The flood spreads. The Director agent releases events (§6.4). Agents propose, argue, whisper and act. |
| 9:30–10:00 | "The first hour is over." The board freezes. An outcome card shows people safe, hospital power uptime, rumours countered and average trust. |
| 10:00–12:00 | **Debrief** (skippable). The board replays the timeline. The player pinch-drags a scrubber. Three key moments are highlighted, each with one line of feedback against a crisis-management principle. Missed whispers are revealed ("While you were looking at the hospital, Fire and Utilities agreed to cut power to Riverside"). "Play again" and "Exit" buttons. |

**Pause and resume:** when the XR session becomes hidden (`visibilitychange` or the XR session's visibility state), stop the simulation clock, hold agent turns and drop in-flight results. On return, resume with a one-line "Where we were" from the most trusted agent.

### 6.2 The town and its simulation (deterministic, ours, tested)

- **Grid:** 12 × 8 cells. Cell types: river, riverbank, road, bridge, residential (has a population), hospital, school (the shelter, on high ground), power substation, fire station, park. Each cell has an elevation from 0 to 5. One hand-authored map (Harrow Bend).
- **Tick:** every 0.5 real seconds. Each run uses a seeded random generator, so a run can be replayed exactly from `(seed, input log)`.
- **Flood:** water level per cell.
  - Rain intensity follows the scenario curve.
  - River cells rise. Water flows to neighbouring cells where `level + elevation` is lower.
  - Sandbags on a cell block inflow up to a capacity. The pump drains one cell plus its neighbours.
- **Power:**
  - The substation feeds the districts and the hospital.
  - If the substation floods (water above a threshold), there's a district-wide outage unless it's sandbagged.
  - Utilities can cut power to a district. Cutting a flooded district prevents a "live water" hazard.
  - The hospital runs on a generator with a fuel timer during an outage. A fuel truck resets it.
- **People:**
  - Residential cells have residents.
  - Residents in a cell with water above a threshold are "in danger".
  - In danger for more than N game minutes: they need rescue (a fire crew on the cell for X seconds) or they are counted as "harmed" in the final score only, never shown.
  - Buses evacuate a district to the school shelter by following roads. The bridge can collapse (an event), which reroutes buses.
- **Compliance:** each district has a compliance value (0–1) that scales how fast evacuation happens. Rumours lower it. Clear broadcasts raise it.
- **Player resources** sit in a tray along the near edge:
  - 3 fire crews
  - 2 buses
  - 6 sandbag stacks
  - 1 pump
  - 1 fuel truck
  - 2 gold delegation chips
  - 1 broadcast card, which recharges every 3 game minutes
- **Event log:** one append-only list `{t, type, actor, data}` that every system writes to. The debrief, replay and scoring all read it.
- **Scoring:** people safe %, hospital uptime %, rumours countered, average trust, and one combined "Command rating" letter (A–E). The weights are the builder's tuning.

### 6.3 The embodied agents (4)

Each agent is a chunky 10–12 cm figure with its own colour, a role icon and a nameplate, standing at a fixed spot on the table edge. Agents sit at about ±30° and 0° horizontally and no higher than 15° above eye level, so they stay inside the Glasses' field-of-view mask.

| Agent | Wants | Private information only they see |
|---|---|---|
| **Fire Chief** (rescue and flood fighting) | Crews on rescues now. Impulsive. | Rescue calls per district, crew status |
| **Hospital Director** | Power and fuel priority for the hospital. Cautious. | Generator fuel, patients on life support |
| **Utilities & Roads Lead** | Cut power to flooded districts. Protect the substation. Methodical. | Substation water level, bridge sensor, road closures |
| **Press & Public Officer** | Get a public statement out fast. Sees rumours first. | Rumour feed (from the Rumor agent), call volume |

**Agent state** (kept on the client, sent with each turn): role card (static), trust in the player (0–100), mood, short memory notes (≤5 lines from this session, plus ≤3 lines from past sessions), inbox (player actions and messages from other agents), and holds-chip (whether the agent has a delegation chip).

**When an agent takes a turn:**
- an event in its area of responsibility,
- a message for it,
- a player action aimed at it,
- or a 20 real second heartbeat.

At most one request per agent can be in flight at a time. Agents run in parallel.

**Turn output** (structured JSON, validated):
```
{ say: string (≤25 words),
  mood: "calm"|"tense"|"angry"|"relieved",
  proposals: [{ action, params, rationale (≤15 words) }]  // 0–2
  messages:  [{ to: agentId, text (≤20 words), private: boolean }] // 0–2
  memoryNote?: string (≤15 words),
  withhold?: boolean  // chose not to share private info (only allowed when trust < 30)
}
```

**Allowed actions:** `request_resource(type, cell)`, `deploy_own(type, cell)` (only with a chip, or as limited freelancing; see below), `cut_power(district)`, `restore_power(district)`, `draft_broadcast(options[3])` (Press only), `report(fact)`, `support(proposalId)` / `oppose(proposalId)`. The simulation rejects anything invalid, such as a resource that isn't available or a wrong role. A rejected action is logged and the agent is told why on its next turn.

### 6.4 Behind-the-scenes agents (3)

- **Director** (game master):
  - A call every 60 real seconds with a summary of the game state.
  - It picks from a fixed event deck and decides the timing and intensity, to keep tension in a target band.
  - Event deck: bridge collapse, hospital generator fault, school bus stranded, rumour "the dam has burst", rainfall surge, substation alarm, a citizen livestream going viral.
  - It may only pick from the deck and only within the timing windows, so it can't break the scenario.
  - Fallback: a fixed schedule at 3:00, 5:00, 6:30 and 7:30.
- **Rumor:**
  - Every 45 real seconds it writes up to one short rumour tied to the current state.
  - Each rumour has a target district and a severity, which lower that district's compliance.
  - The rumour only reaches the Press Officer's feed. A broadcast that addresses it counts as "countered".
  - Fallback: rumour templates.
- **Debrief:**
  - One call at the end, with a compressed event log (≤200 events).
  - It returns three key moments, each `{t, what happened, principle, one-line feedback}`, plus missed whispers.
  - Principles: clear objectives, span of control, delegation, checking information, one consistent public message.
  - Fallback: rule-based detection of the same moments (for example, an agent ignored for more than 90 s, a rumour left uncountered for more than 3 game minutes, a chip given to a low-trust agent).

### 6.5 Hand mechanics (everything is pinch-based)

Pinch is the only gesture captured from real Quest 3 data in the emulator, and the most reliable on hardware.

| Verb | How | Notes |
|---|---|---|
| Open report | Pinch an agent's badge (a ray from the hand works, so the player doesn't have to reach) | The agent speaks its private information if trust ≥ 30 |
| Approve / deny | Pinch ✓ or ✗ on the proposal card floating above the agent | An unanswered proposal expires after 15 s, or runs automatically if the agent holds a chip |
| Deploy | Pinch-grab a token from the tray and release it over a cell | It snaps to the cell, and the cell highlights while hovering |
| Eavesdrop | Pinch a whisper thread (a glowing arc between two agents, visible for 8 s) | Shows the private message. Both agents notice: trust −5, and they may comment |
| Delegate | Grab a gold chip and release it near an agent | That agent's proposals in its area now run automatically. Grab the chip back to take authority back |
| Broadcast | Pinch the broadcast card, then pick one of 3 options the Press agent drafted | Raises compliance. Counters a matching rumour |
| Pause | Pinch the pause dial on the table corner | Also pauses automatically when the session is hidden |

**Attention (span of control):**
- The *focused* agent is the one within a 20° cone of head direction. IWSDK treats head direction as gaze on Quest 3, and real eye tracking takes over on the VR Glasses.
- The focused agent shows full captions and proposals, and its babble is louder.
- Unfocused agents murmur, and their captions shrink to an icon with a one-line preview.
- An agent left unfocused for more than 45 real seconds, and not holding a chip, starts **freelancing**: it may use up to one of its own role's resources from the shared tray on its own judgment. Freelance actions are logged and flagged in the debrief.

**Trust** changes:

| Event | Trust change |
|---|---|
| Approval | +5 |
| Denial | −3 |
| Ignored more than 60 s | −2 per 30 s |
| Eavesdropped on | −5 |
| Given a chip | +10 |
| Chip taken back | −8 |

Below 30, an agent may withhold private information and coordinate with others without you.

### 6.6 Voice, audio and text

- Agents speak in **spatial babble**: short, made-up syllable sounds generated with WebAudio, with a different pitch and timbre for each agent. The sounds come from the agent's position in 3D space. Every line has a caption on a high-contrast nameplate bubble.
- My call, for these reasons:
  - Browser speech synthesis can't be placed in 3D space, and Quest Browser support for it is unverified.
  - A real voice service adds lag, cost and another outside dependency.
  - Babble works offline, keeps the 10+ rating easy, and reads as stylised and charming.
- **Stretch goal:** real voices from a text-to-speech service, played as positional audio.
- Ambient sounds: rain intensity follows the simulation, plus distant sirens, alert chimes for events, and sounds for picking up and placing tokens.

### 6.7 Server and AI

- **One Vercel serverless function** `POST /api/turn` handles all agent types, keyed by `agentId`.
  - It uses the official `@anthropic-ai/sdk`.
  - The API key is stored only in the Vercel environment variable `ANTHROPIC_API_KEY`.
  - The model comes from `AGENT_MODEL` (default `claude-haiku-5-5`, alternative `claude-opus-5-5`), at low effort.
  - It uses structured JSON output matching the schema in §6.3.
  - Static role prompts are cached.
- **The client's orchestrator** owns scheduling, the inboxes, retries and validation.
  - A request that takes longer than **8 s**, errors, or returns invalid output falls back to that agent's rule-based policy for that turn.
  - The fallback is silent to the player and logged.
  - Agents are asynchronous, so the game never waits on them. Because a reply can arrive up to 8 s (48 game seconds) after its observation, every returned action is re-checked against the *current* state, and stale ones are dropped.
- **Cost guard:** at most 250 AI calls per session and a simple per-IP rate limit on the function. When the cap is hit, the game switches to the rule-based agents and keeps going.
- **Rule-based policy** (one per agent):
  - Score each allowed action against the agent's goals and observation, and pick the best one.
  - Its line comes from a template bank: about 12 lines per agent per situation type (calm, warning, crisis, gratitude, complaint, withholding).
  - It must make a full session playable with the AI off.

### 6.8 Mixed reality, the fallback, and comfort

- AR: use plane detection with semantic labels (`table` / `desk`) through IWSDK's room-surfaces feature. Use depth occlusion if it's cheap. If an anchor is available, anchor the board to the plane.
- If the plane is lost mid-session, keep the board where it is; it is world-locked. A "Recenter" option on the pause dial re-runs table finding.
- VR fallback: the virtual desk in a simple operations room (dim, with rain on the windows). Same gameplay.
- All essential UI fits inside the VR Glasses field-of-view mask. Turn on the IWSDK field-of-view mask during development.
- Reach: every interactive item is within 0.3–0.7 m of the head when seated. Distant pinches use a ray.

### 6.9 Coming back (persistence)

Stored in `localStorage` (no accounts):
- Town damage carries over and is shown repaired between sessions. One upgrade is unlocked per session based on the rating: a levee segment, a backup generator, or a second bus.
- Each agent keeps up to 3 memory lines about the player's past choices ("Last time you left me alone for four minutes").
- Session history and best rating.
- A rain modifier (light, heavy, night) is picked per session, so replays differ.

Persistent spatial anchors across sessions are **not required**; the table is found again each session.

### 6.10 Look and performance

- **Look:** a tactile diorama. A painted-wood board, felt-textured districts, low-poly buildings built from Three.js primitives (no external art pipeline), and water as one animated translucent surface. Warm lighting with soft blob shadows and no real-time shadow maps.
- **Budgets:** ≤100k triangles, ≤60 draw calls (instanced cells and buildings), ≤1 transparent full-board surface, texture atlas ≤2048². Target 72 fps, with 60 fps as the floor on Quest 3.
- UI uses IWSDK's spatial UI (UIKitML) where suitable.

### 6.11 Testing without a headset

- Develop in the IWSDK dev server's emulator, switching input to hands, with head-locked gaze emulation and the VR Glasses field-of-view mask on.
- Mixed-reality testing uses `@iwer/sem` rooms:
  - **`conference_room`** (table top at 0.74 m, labelled `table`) is the main room for testing and filming.
  - **`sunlit_living_room`** (coffee table labelled `table`) is the second room.
  - A run with no planes tests the fallback.
  - How to load a SEM room inside the IWSDK dev server is **unconfirmed**. The builder confirms it, or wires IWER plus SEM manually in a development-only entry.
- Automated tests (Vitest):
  - Simulation: flood spread, sandbags, power, generator, evacuation pathing, bridge collapse, scoring.
  - A replay from `(seed, input log)` gives the same final state.
  - Every agent output that fails the schema falls back correctly.
  - A full session with the AI off and random legal inputs ends without errors.
- Before submitting, play the deployed link at least twice from start to finish in the emulator: once with the AI on and once with it off.
- If a Quest 3 can be borrowed, run one session on it to check fps and pinch feel.

### 6.12 Submission deliverables

- **Link:** the Vercel production URL, frozen at submission.
- **Video under 3 minutes** (OBS screen recording of the emulator, real footage only, edited with captions and a short voice-over or text):
  - 0:00–0:10 the town unfolds on the table
  - 0:10–0:40 agents arguing, a whisper thread
  - 0:40–1:30 sandbags, chip hand-off, eavesdropping
  - 1:30–2:10 crisis peak and the rumour broadcast
  - 2:10–2:40 the debrief reveals a missed deal
  - 2:40–2:55 the problem statement and drill mode
- **Devpost text:** tagline, a description of 500 words or less, a hand-interactions note, target launch date (suggested: Q2 2027, alongside the VR Glasses), and team details. The user supplies the personal details.

## 7. Schedule (deadline 2026-11-19 01:30 IST; aim to submit by 2026-11-18 22:00 IST)

| Day | Target |
|---|---|
| Day 1 (Nov 16) | Scaffold the IWSDK project. Deploy a hello-world to Vercel with a test `/api/turn`. Simulation core with tests. Table finding plus the fallback. Render the board and agents. Tokens and deploying. |
| Day 2 (Nov 17) | Agent server plus the client orchestrator. Rule-based policies and line banks. Captions and babble. Proposals, whispers, chips, attention, trust. Director, Rumor, Debrief. |
| Day 3 (Nov 18) | Onboarding, persistence, pause and resume, sound, polish, performance, field-of-view check. Record the video. Write the Devpost entry. Submit by 22:00 IST. |

If time runs short, cut in this order: the replay scrubber (keep the three text moments), persistence upgrades, the Rumor agent (move to fixed rumours), the VR operations-room art (keep a plain desk). Never cut the AI-off fallback, the hands-only path, or the debrief's missed-whispers reveal.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Start membership not approved in time | Out of our control. Build anyway. |
| No real-device check of fps or pinch feel | Strict performance budgets; pinch-only verbs; borrow a Quest if possible. |
| AI lag | Haiku by default; agents are asynchronous, so the game never waits; 8 s timeout then fallback; stale actions re-checked. |
| `@iwer/sem` integration with the IWSDK dev server unclear | Fallback path; manual IWER plus SEM development entry. |
| Judges hammering the link and running up cost | Per-session cap and rate limit, then fall back to rule-based agents. |
| Plane labels missing in a judge's room | Table finding accepts any horizontal plane at table height, then falls back to the virtual desk. |

## 9. Left to the builder

- Exact IWSDK component and system names (plane detection, anchors, grab, ray pointers, spatial audio, UIKitML) and how the code is organised.
- Simulation tuning constants, scoring weights, event timing within the stated windows.
- Prompt wording for each agent, plus the template line banks.
- Art details within §6.10, and the babble sound design.
- How SEM rooms are loaded in development.
- Project and file layout, and the test layout.
