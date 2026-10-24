// Typed, validated access to the JSON data files. Safe on server and client.
import catalogJson from "../../data/catalog.json";
import roomJson from "../../data/room.json";
import { Check, Derived, Part, Room, SimResult, Task } from "./contracts";
import { z } from "zod";

// Room geometry conventions (sim and derive rely on these):
// - origin is the top-left corner of the room, x to the right, y down, millimetres.
// - obstacle x,y is its min corner; w spans x, d spans y, h is height.
// - doorway x,y is the centre of the opening in a wall; widthMm is the clear width.
// - a target sits on or beside furniture; the robot acts on it from the nearest free floor spot.

export type Room = z.infer<typeof Room>;
export type Target = Room["targets"][number];
export type Task = z.infer<typeof Task>;
export type Check = z.infer<typeof Check>;
export type Derived = z.infer<typeof Derived>;
export type SimResult = z.infer<typeof SimResult>;

let catalogCache: Part[] | null = null;
let roomCache: Room | null = null;

export function loadCatalog(): Part[] {
  if (!catalogCache) catalogCache = z.array(Part).parse(catalogJson);
  return catalogCache;
}

export function loadRoom(): Room {
  if (!roomCache) roomCache = Room.parse(roomJson);
  return roomCache;
}

export function partMap(catalog: Part[]): Map<string, Part> {
  return new Map(catalog.map((p) => [p.id, p]));
}
