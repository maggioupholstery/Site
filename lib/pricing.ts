// lib/pricing.ts

export type QuoteCategory = "auto" | "marine" | "motorcycle";

export type AiAssessment = {
  category: QuoteCategory;
  item: string;
  material_guess: "vinyl" | "leather" | "marine_vinyl" | "unknown";
  damage: string;
  recommended_repair:
    | "stitch_repair"
    | "panel_replace"
    | "recover"
    | "foam_replace"
    | "unknown";
  complexity: "low" | "medium" | "high";
  notes: string;
};

export type Estimate = {
  laborHours: number;
  laborRate: number;
  laborSubtotal: number;
  materialsLow: number;
  materialsHigh: number;
  shopMinimum: number;
  totalLow: number;
  totalHigh: number;
  assumptions: string[];
};

const LABOR_RATE = 125;
const SHOP_MINIMUM = 250;

function clamp(n: number, lo: number, hi: number) {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

export function estimateFromAssessment(a: AiAssessment): Estimate {
  // Base labor hours
  let hours = 3.0;

  if (a.recommended_repair === "stitch_repair") hours = 1.5;
  else if (a.recommended_repair === "foam_replace") hours = 2.5;
  else if (a.recommended_repair === "panel_replace") hours = 3.5;
  else if (a.recommended_repair === "recover") hours = 5.5;

  // Complexity multiplier
  let mult = 1.0;
  if (a.complexity === "medium") mult = 1.25;
  else if (a.complexity === "high") mult = 1.5;

  hours = clamp(hours * mult, 1.5, 10.0);

  // Materials range
  let materialsLow = 60;
  let materialsHigh = 180;

  if (a.material_guess === "leather") {
    materialsLow = 140;
    materialsHigh = 380;
  } else if (a.material_guess === "marine_vinyl") {
    materialsLow = 110;
    materialsHigh = 320;
  }

  // Category adjustments
  if (a.category === "marine") {
    materialsLow = Math.round(materialsLow * 1.15);
    materialsHigh = Math.round(materialsHigh * 1.2);
  }

  // Item tweaks
  const itemLower = (a.item || "").toLowerCase();
  if (itemLower.includes("armrest")) {
    hours = clamp(hours * 0.75, 1.5, 7.0);
    materialsLow = Math.round(materialsLow * 0.8);
    materialsHigh = Math.round(materialsHigh * 0.85);
  }

  const laborSubtotal = Math.round(hours * LABOR_RATE);

  const rawLow = laborSubtotal + materialsLow;
  const rawHigh = laborSubtotal + materialsHigh;

  const totalLow = Math.max(SHOP_MINIMUM, rawLow);
  const totalHigh = Math.max(totalLow + 50, rawHigh);

  const assumptions = [
    "Estimate is based on photos only; final quote confirmed after inspection or additional close-ups.",
    "Assumes no hidden damage under covers or foam.",
    "Does not include major frame repair or airbag/sensor complications.",
  ];

  return {
    laborHours: Math.round(hours * 10) / 10,
    laborRate: LABOR_RATE,
    laborSubtotal,
    materialsLow,
    materialsHigh,
    shopMinimum: SHOP_MINIMUM,
    totalLow,
    totalHigh,
    assumptions,
  };
}

