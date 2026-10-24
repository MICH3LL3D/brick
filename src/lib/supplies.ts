// Baseline tools and consumables any robotics build needs. Links are left blank for now (the cart hides empty ones). Kept out of catalog.json so Gemini never designs with them and the contracts stay unchanged.
import { z } from "zod";
import { Part } from "./contracts";
import suppliesJson from "../../data/supplies.json";

export const SUPPLIES = z.array(Part.extend({ url: z.string() })).parse(suppliesJson);
