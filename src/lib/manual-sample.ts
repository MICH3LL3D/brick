// Sample manual content so the Build view works before Gemini writes real manuals. Mirrors the Paper pages.
// Pages without content yet are `skill` stubs marked "Gemini writes this page".
import { BOOKS, type BookIdT, type ManualPageT, type ManualSetT } from "./manual-format";

const PI_CREDIT = "Pi photo: SimonWaldherr, CC BY 4.0, via Wikimedia Commons";
const see = (book: BookIdT, page: number, label: string) => ({ book, page, label });

const COUNTS: Record<BookIdT, number> = { "0": 3, "1": 3, "2": 3, "3": 4, "4": 4, "5": 3, "6": 3, "7": 3, "8": 1, "9": 2, "10": 2, S: 6 };

const written: ManualPageT[] = [
  { book: "0", page: 1, kind: "shelf", title: "Plant waterer", blurb: "A set of 12 build books. Read them in number order. Skills is the toolbox: the other books point to it.", parts: [], see: [], note: "1 to 7 build the robot, one system each. 8 checks everything and switches it on. 9 loads the code. 10 fixes problems. Pages show a 'SEE' tag when another book explains a skill." },
  { book: "0", page: 3, kind: "legend", title: "How to read these books", blurb: "Five things to know before page one.", parts: [], see: [] },
  { book: "2", page: 2, kind: "steps", title: "Set up the Pi", blurb: "Flash the card, set your Wi-Fi, mount the board.", warning: undefined, parts: [{ qty: 1, label: "Raspberry Pi 5" }, { qty: 1, label: "microSD card" }, { qty: 4, label: "Standoff + screw" }, { qty: 1, label: "Your laptop" }], see: [], footer: "Power it with USB-C for now. A green light should blink.", photoCredit: PI_CREDIT,
    panels: [
      { title: "Flash the card", caption: "Install Raspberry Pi Imager from raspberrypi.com/software. Plug the card reader into your laptop." },
      { title: "Edit settings", caption: "Hostname brick, username pi, your Wi-Fi, SSH on. Then WRITE and wait for 'done'." },
      { title: "Mount it", caption: "Card in the slot (contacts up). Screw the Pi onto 4 standoffs on the chassis deck. No metal below it." },
    ] },
  { book: "3", page: 2, kind: "wiring", title: "Wire the blocks", blurb: "Battery to both lever blocks, then blocks to the regulator input.", warning: "Battery stays unplugged until Book 8.", parts: [{ qty: 2, label: "Red wire" }, { qty: 2, label: "Black wire" }], see: [see("S", 1, "Strip a wire"), see("S", 2, "Lever block")],
    wires: [
      { color: "red", from: "LiPo 7.4V +", to: "BATT + block (in)", isNew: true },
      { color: "black", from: "LiPo 7.4V −", to: "BATT − block (in)", isNew: true },
      { color: "red", from: "BATT + block port 1", to: "5V regulator IN+", isNew: true },
      { color: "black", from: "BATT − block port 1", to: "5V regulator IN−", isNew: true },
    ] },
  { book: "3", page: 3, kind: "wiring", title: "Check the 5V", blurb: "Plug in the battery. Read the regulator output. Then unplug.", parts: [{ qty: 1, label: "Multimeter" }], see: [see("S", 4, "Multimeter")], wires: [], gauge: { reading: "5.0 V", expect: "Must read 4.9 to 5.1 V" } },
  { book: "10", page: 1, kind: "fix", title: "Power and Pi problems", blurb: "Find your symptom. Try the checks top to bottom.", parts: [], see: [],
    rows: [
      { symptom: "Pi has no light", advice: "Regulator out should read 4.9 to 5.1 V. Wires on Pi pins 2 and 9? Battery charged?", see: [see("3", 3, "Check the 5V"), see("3", 4, "Feed the Pi")] },
      { symptom: "Regulator reads 0 V", advice: "Battery plugged in? Both lever blocks closed? Wires in IN+ and IN−?", see: [see("S", 2, "Lever block"), see("3", 2, "Wire the blocks")] },
      { symptom: "Regulator reads over 5.1 V", advice: "UNPLUG. Do not connect the Pi. Replace the regulator.", see: [see("3", 3, "Check the 5V")] },
    ] },
  { book: "S", page: 2, kind: "skill", title: "Lever block", blurb: "A lever block joins up to five wires with no soldering.", parts: [{ qty: 1, label: "Lever block" }, { qty: 1, label: "Stripped wire" }], see: [],
    panels: [
      { title: "Lift the lever", caption: "Flip the orange lever up for the port you want." },
      { title: "Push wire in", caption: "Push until the plastic touches the insulation." },
      { title: "Lever down, tug", caption: "Close the lever. Tug gently. If it moves, redo it." },
    ] },
  { book: "S", page: 6, kind: "skill", title: "Find pin 1", blurb: "Count from pin 1. The GPIO number is not the pin number.", parts: [], see: [], panels: [{ title: "The header" }, { title: "Count along" }] },
];

const stub = (book: BookIdT, page: number): ManualPageT => ({ book, page, kind: "skill", title: `Page ${page}`, blurb: "Gemini writes this page from your design.", parts: [], see: [], panels: [{ title: "Coming soon" }] });

export const SAMPLE_MANUALS: ManualSetT = {
  title: "Plant waterer",
  subtitle: "Sample content. Gemini writes the real pages from your design.",
  source: "sample",
  books: BOOKS.map((b) => ({
    id: b.id,
    name: b.name,
    pages: Array.from({ length: COUNTS[b.id] }, (_, i) => written.find((w) => w.book === b.id && w.page === i + 1) ?? stub(b.id, i + 1)),
  })),
};
