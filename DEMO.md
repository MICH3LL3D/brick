# brick: learn robotics like LEGO

> Describe a task. Get a robot you can actually build: real parts, a 3D model, step-by-step manuals, and an owl to ask when you're stuck.

Track: **Best and Most Creative Use of Gemini**

---

## The idea

Most beginners quit robotics before they build anything. To get started you have to choose parts from thousands of listings, work out voltages and current, assign pins, wire it all up, and write code. One wrong choice and nothing moves.

Kids don't learn building that way. LEGO gives them three things: **a box of bricks that fit together**, **an instruction book with one step per page**, and **someone to ask** when a step is confusing.

brick gives robotics the same three things.

| LEGO | brick |
|---|---|
| A box of bricks that always fit | A catalog of real, priced parts. Gemini may only pick from it, and code checks that they work together. |
| "Build me a fire truck" | Type a task: "Water my plants" |
| The picture on the box | A 3D robot you can turn, take apart by layer, and watch extend its arm |
| The instruction books | Build mode: a shelf of manuals, one step per page, each with its own parts box |
| Asking a friend | The owl: "Why this arm?", "Make it cheaper" |
| It snaps together or it doesn't | Code checks pins, power, payload, reach and budget. Failures are shown in plain English, never hidden. |

---

## Why this is a creative use of Gemini

- **A team, not a chatbot.** Gemini runs as a team of agents with narrow jobs: interpreter, mobility, arm and tool, sensing, power and brain, routine, master, and fact-checker. Code sits between them as the budgeter.
- **Gemini checks Gemini.** A fact-checker agent rewrites any claim the catalog does not support. A Gemini vision check confirms that each product photo shows the right part.
- **Gemini decides, code verifies.** Output is schema-locked to catalog IDs. Every price, total, pin and reach value is computed by code. Failed checks go back to the agent that owns them for repair.
- **Gemini answers in actions, not just words.** The owl uses function calling (`set_budget`, `swap_part`, `regenerate`) to change the design. Code re-checks every change.
- **Grounded in the real world.** Google Search grounding finds real products and photos, so everything in the buy list can be bought.
- **Many Gemini features in one flow:** structured output, function calling, search grounding, vision, thinking levels, and a fallback race across models when one is slow.

---

## Demo script (3 minutes)

Before going on stage: open the app at 1280 px wide or wider. Set `DEMO_MODE=1` if the wifi is unreliable. Have the backup video ready.

| Time | On screen | Say |
|---|---|---|
| 0:00 | Landing page | "Who here has tried to build a robot? Most people quit before the first wire. Picking parts, voltages, pins, code. We asked: what if you could learn robotics the way you learned LEGO?" |
| 0:20 | Type **"Water my plants"**, budget $240, Generate | "I just describe what I want. A team of Gemini agents designs it." |
| 0:30 | **Gemini moment 1: the agent team.** Loading screen with live agent progress | "This isn't one chatbot. It's a team of Gemini agents, each with one job: wheels, arm, sensors, power. They can only pick real parts from our catalog, and a fact-checker agent audits their claims." |
| 0:55 | 3D robot. Orbit, then extend the arm | "This is the picture on the box. Every part here is real, and you can buy it." |
| 1:15 | **Gemini moment 2: the owl.** Click the owl, then **"Why this arm?"** | "Confused? Ask the owl. It knows this exact design." |
| 1:35 | Type **"Make it cheaper"** | "It doesn't just answer. It acts. Gemini function calling changes the design, and code re-checks every change." |
| 1:50 | Checks panel, then the Simulation tab | "Gemini decides, code verifies. Every number is computed by code, and if the arm can't reach the shelf, it says so in plain English." |
| 2:10 | Cart: verified badges, vendor links, CSV | "Here's the box of bricks. Gemini with Google Search grounding found real products, and a Gemini vision check confirmed the photos." |
| 2:25 | **Gemini moment 3: the instruction book.** Build mode: the manual shelf, then a wiring page | "And the instruction book, one step per page. Gemini writer agents write the words. Pin numbers and wire colors come from code." |
| 2:45 | Back to the 3D robot | "brick: describe it, see it, build it. Honest note: the kits aren't tested on hardware yet. That's next." |

**If something breaks:**
1. Generation is slow or fails: restart with `DEMO_MODE=1` to use cached designs.
2. The owl can't reach Gemini: it falls back to an offline reply. Skip to the checks.
3. Everything fails: play the backup video.

---

## Devpost write-up

### Inspiration

We both remember getting stuck at the same place: wanting to build a robot, then opening a parts site and closing it again. Robotics asks beginners to make dozens of expert decisions before anything moves. LEGO taught a generation to build by removing those decisions: the bricks always fit, the book shows one step at a time, and you can always ask someone. We wanted that for real robots.

### What it does

You type a task in plain English, such as "water my plants" or "bring my water bottle to the couch", and set a budget. brick then:

- **Designs** one wheeled Raspberry Pi robot for the task, using only real parts from a catalog.
- **Shows it in 3D.** You can orbit it, toggle shell, parts, wiring and frame layers, and extend the arm.
- **Checks it.** Pins, power, battery life, payload, reach and budget are computed by code and shown in plain English.
- **Simulates it** doing the task in a sample apartment, with each stop shown as a pass or fail.
- **Lists what to buy:** vendor links, prices, a reason per part, verified badges and a CSV export.
- **Writes the instruction books.** Build mode is a shelf of manuals with one step per page, a parts box, wiring diagrams and fix-it pages.
- **Answers questions.** The owl explains the design and makes small changes through Gemini function calling.
- **Exports a build kit:** a zip with the buy list, wiring, Pi Python code, a self-test and a printable manual.

### How we built it

- **Next.js and TypeScript** web app. **react-three-fiber** and drei for the 3D robot.
- **Gemini (`@google/genai`)**, server-side only, running a team of agents:
  1. An interpreter reads the task and works out what it physically needs: reach, grip, lift, liquid, camera.
  2. Mobility, arm, and sensing agents pick parts in parallel, each from its own slice of the catalog.
  3. Power and routine agents follow, using those parts' loads.
  4. Code picks one option per agent that fits the budget.
  5. A master agent combines the parts, and a fact-checker agent rewrites any claim the catalog doesn't support.
  6. Deterministic checks run. Failures go back to the agent that owns them, with at most 2 repair rounds.
- **The owl** uses Gemini function calling (`set_budget`, `swap_part`, `regenerate`). Every change is re-checked by code before it is shown.
- **Manuals:** code lays out pages, wires and parts from the checked pin map. Gemini writer agents write the words, one per book. Photo agents use Google Search grounding and a Gemini vision check to find real product photos.
- **Zod contracts** shared between frontend and backend, so Gemini's JSON is validated, and fails loudly, at every step.
- **Model fallback:** when the primary model is slow or overloaded, requests race through fallback models.

### Challenges we ran into

- **Hallucinated parts.** Early designs invented parts or prices. We locked Gemini to catalog IDs through the response schema, rejected anything else, and fed the failures back for repair.
- **Silent passes.** "Grab books from the shelf" matched none of our room targets, so every check passed and the robot did nothing. We added a requirements step, in which Gemini estimates what the task physically needs and code checks the design against those needs.
- **Honest limits.** When no catalog part can meet a need, brick says so instead of repairing forever.
- **Latency.** A full design took up to a minute. Splitting the work into parallel specialist agents, plus a model fallback race, brought it down. The live progress text makes the wait readable.

### Accomplishments we're proud of

- Gemini never computes a number. Every price, total, pin and reach value comes from code, so the design you see is the design you can buy.
- Failed checks are never hidden. A beginner sees why a design won't work, in plain English.
- A designed robot comes with real parts, a 3D model, a simulation, manuals, code and a buy list.

### What we learned

- LLMs are great at choosing and explaining, and unreliable at arithmetic. Splitting "Gemini decides, code verifies" made the output trustworthy.
- Several small agents with narrow jobs beat one giant prompt, for both quality and speed.
- Schema-locked output plus a repair loop is far more reliable than prompting alone.

### What's next for brick

- Test the kits on real hardware and mark the parts we've verified.
- Scan your own room with a LiDAR phone instead of using a sample apartment.
- Scratch-built bases from plywood or acrylic, with a cut list in the manual.
- Shopping agents that check stock and live prices.
- More robot types beyond wheeled bases.

### Built with

`gemini` `google-genai` `next.js` `react` `typescript` `three.js` `react-three-fiber` `zod` `raspberry-pi`

### Team

- **Michelle**: UX and frontend. Designed the app, the 3D viewer, the simulation view and Build mode.
- **David**: Gemini integration. Built the agent pipeline, the checks, the catalog, the owl chat and the build kit.

### Honest limits

- The build kits are not yet tested on hardware.
- Prices come from vendor pages at the time we scraped them, and may have changed.
- Some catalog parts are not yet verified by a human. They are marked in the buy list.
- Room scanning and shopping agents are future work.
