// GET /api/catalog -> Part[]  (thin wrapper over data/catalog.json)
import { loadCatalog } from "@/lib/data";

export function GET() {
  return Response.json(loadCatalog());
}
