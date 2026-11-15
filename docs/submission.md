# First Hour — Devpost submission draft

## Name
First Hour

## Tagline (≤140 characters)
A flood hits a town on your real table. Four AI department heads argue, whisper and act. You lead with your hands. Ten minutes.

## Track / Division
Gaming · New Experience

## Link
https://first-hour-phi.vercel.app (open in the Meta Quest Browser, press Start, sit at a table)

## Description (≤500 words)

**Inspiration**
In a disaster, the decisions made in the first hour are made by local officials who almost never practise them. Real practice drills ("tabletop exercises") need a trained facilitator and a room full of people playing fire, hospital, utilities and press, so most small towns, schools and hospitals rarely run them. We asked what would happen if that room of role-players were AI agents with their own goals, their own secrets and their own opinions about you, sitting around your own table.

**What it is**
First Hour is a seated, hands-only mixed-reality strategy game. A miniature town, Harrow Bend, unfolds on your real table and a flash flood begins. Four AI department heads stand at the table's edge:

- the Fire Chief, who wants crews on rescues now;
- the Hospital Director, who wants power for 14 patients on life support;
- the Utilities Lead, who wants to cut power before water meets live lines;
- the Press Officer, who is fighting rumours on social media.

They propose actions, disagree, and whisper to each other privately. You have one game hour (ten real minutes) and two hands.

**How you play**
Everything is a pinch:

- Grab sandbags, crews, buses, a pump and a fuel truck from the tray and drop them on the map.
- Pinch ✓ or ✗ on an agent's proposal.
- Pinch a glowing whisper thread to eavesdrop (they notice, and trust drops).
- Hand a gold chip to an agent to give them authority to act without asking.
- Pinch the broadcast card to answer a rumour.

**Attention is the resource.** You can only follow whoever you face. Agents you ignore lose trust, start acting on their own, and may stop sharing what they know. Afterwards, a debrief replays the board, names three leadership lessons (span of control, delegation, checking information, one public message) and reveals the deals made while you weren't looking.

**How we built it**
- Built with Meta's Immersive Web SDK 1.0 (Three.js plus ECS) and deployed on Vercel.
- The town is a deterministic simulation we wrote, with 135 unit tests covering flood spread, sandbags, power and the hospital generator, evacuation routing, the bridge collapse and scoring.
- **It is genuinely multi-agent.** Each department head is a separate Claude call with its own partial view of the town, its own goals, trust and memory, and it returns structured actions. The simulation checks every action before it happens.
- Three more agents work behind the scenes: a Director paces the crisis from an event deck, a Rumor agent spreads believable misinformation that only the Press Officer can see, and a Debrief agent writes the after-action review.
- **It still works if you remove the AI.** Every agent has a rule-based fallback, so the game plays fully offline or without a model.
- Room detection places the town on your real table, falls back to a virtual desk anywhere else, and the layout fits the VR Glasses' narrower view.

**What's next**
- Real people can take seats in place of AI agents, for mixed human/AI drills.
- More scenarios: wildfire, heatwave, a cyberattack on the water plant.
- Eye tracking on Meta VR Glasses.
- Maps of the player's own town, and a "drill mode" for emergency-management offices, hospitals and schools.

## Hand interactions
First Hour is fully usable with hands from start to finish; it never needs a controller. Every verb is a pinch (grab and drop, ✓/✗, eavesdrop, delegate, broadcast, pause), plus a fingertip poke for buttons. Head direction decides which agent you are attending to, and real gaze will take over on the VR Glasses. Everything sits within a seated 2-foot reach.

## Target launch date
Q2 2027 (alongside Meta VR Glasses)

## Team
Solo developer. Fill in name, email and role on Devpost.

---

## Demo video shot list (<3 min, real footage only)
Recorded with OBS from the IWSDK emulator (conference_room) at 1080p. Hands mode. Seat the headset at the table (y≈1.2, z≈-0.7).

| Time | Shot |
|---|---|
| 0:00–0:10 | Start → the town unfolds on the conference table; rain begins |
| 0:10–0:40 | Agents speak in turn (captions); a whisper thread arcs between Utilities and Hospital |
| 0:40–1:30 | Pinch a sandbag onto the Riverside bank; pinch ✓ on the Fire Chief's rescue; hand a gold chip to Utilities; pinch the whisper bead to eavesdrop |
| 1:30–2:10 | Bridge collapse event; the "dam burst" rumour; open the broadcast card and pick the counter-message |
| 2:10–2:40 | Outcome card → Debrief: pinch a moment, the board replays; the missed whispers are revealed |
| 2:40–2:55 | Title card: the problem (tabletop drills are rare and expensive) and drill mode |

Tip: in a development build (`npm run dev`), press **F** to toggle ×8 speed when you need the later crisis beats quickly. Record those beats at normal speed for the final cut.
