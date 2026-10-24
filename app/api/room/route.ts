// GET /api/room -> Room  (thin wrapper over data/room.json)
import { loadRoom } from "@/lib/data";

export function GET() {
  return Response.json(loadRoom());
}
