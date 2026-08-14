export const PERSONAS = {
  ceo: { label: "CEO", lens: "enterprise value, growth, cash, material risk and accountable actions" },
  coo: { label: "COO", lens: "outlet execution, availability, working capital, leakage and recovery owners" },
  procurement_manager: { label: "Procurement Manager", lens: "supplier service, PO closure, price movement, fill rate and alternate sourcing" },
  executive_chef: { label: "Executive Chef", lens: "recipe adherence, ingredient consumption, yield, waste, expiry and menu availability" },
  outlet_manager: { label: "Outlet Manager", lens: "daily stock availability, FIFO, transfers, waste, ordering and service continuity" },
  finance: { label: "Finance Controller", lens: "gross margin, consumption leakage, inventory value, liabilities and evidence quality" },
} as const;

export type Persona = keyof typeof PERSONAS;

export const SEMANTIC_DOMAINS = {
  commercial: {
    label: "Commercial and menu economics",
    synonyms: ["sales", "revenue", "turnover", "gross margin", "gm", "food cost", "theoretical margin", "recipe margin", "menu profitability", "dish profitability"],
    definition: "Period activity. Gross margin is net sales less recipe-based theoretical ingredient cost; it is not accounting gross profit.",
  },
  inventory: {
    label: "BOH inventory and availability",
    synonyms: ["boh", "back of house", "back kitchen", "store room", "stock", "inventory", "soh", "on hand", "days cover", "dos", "stockout", "out of stock", "shortage", "reorder"],
    definition: "Latest validated item-by-outlet snapshot. Current stock, forecast requirement, valid open PO, shortage and days cover must share the same as-of date.",
  },
  consumption: {
    label: "Kitchen consumption and leakage",
    synonyms: ["actual consumption", "theoretical consumption", "ideal usage", "recipe usage", "variance", "overconsumption", "leakage", "yield loss", "portion", "recipe adherence", "food cost variance"],
    definition: "Actual consumption is the inventory bridge; theoretical consumption is recipe quantity driven by menu sales. Positive actual-minus-theoretical value is potential leakage, not automatically theft.",
  },
  waste_expiry: {
    label: "Waste, expiry and FIFO",
    synonyms: ["waste", "wastage", "spoilage", "expiry", "expired", "near expiry", "shelf life", "fifo", "slow moving", "dead stock"],
    definition: "Observed wastage is separated from estimated expiry exposure. Demo expiry estimates must be labelled estimated and not represented as POS batch truth.",
  },
  procurement: {
    label: "Procurement and PO control",
    synonyms: ["procurement", "purchase", "po", "purchase order", "open order", "pending order", "overdue", "grn", "receipt", "lead time", "fill rate", "otif"],
    definition: "PO and receipt measures use line-level status and the latest complete control-tower checkpoint.",
  },
  vendor: {
    label: "Vendor performance and price risk",
    synonyms: ["vendor", "supplier", "source", "otif", "on time in full", "fill rate", "lead time", "delay", "price increase", "inflation", "rate variance", "alternate vendor"],
    definition: "Vendor performance includes eligible closed lines for OTIF/fill rate and latest price movement; low sample sizes must be disclosed.",
  },
  foh: {
    label: "FOH service impact",
    synonyms: ["foh", "front of house", "service", "counter", "menu unavailable", "menu at risk", "guest impact", "availability", "lost sales"],
    definition: "FOH impact is inferred only through affected menu items and ingredient availability; service time, order cancellation and guest experience are not currently measured.",
  },
} as const;

export const QUESTION_STARTERS: Record<Persona, string[]> = {
  ceo: ["Where are sales, margin, cash and supply risk concentrated this month?", "Which three risks require executive intervention and what value is exposed?", "Which outlets combine weak margin with high inventory or PO exposure?"],
  coo: ["Which outlets need action on availability, leakage and waste?", "Where will ingredient shortages disrupt the most menu items?", "What should each outlet fix in the next 7 days?"],
  procurement_manager: ["Which vendors have the weakest OTIF, fill rate and lead-time performance?", "Which open POs are overdue and what supply or cash value is at risk?", "Where are purchase-price increases creating the largest value impact?"],
  executive_chef: ["Which ingredients show the largest actual-versus-theoretical consumption leakage?", "Which menu items are threatened by shortage or expiry?", "Where should recipe adherence, portion control or FIFO be checked first?"],
  outlet_manager: ["What stockouts, near-expiry items and overdue POs require action at my outlet?", "Which stock should be transferred, promoted or reordered today?", "Which ingredients have high days cover or abnormal consumption?"],
  finance: ["Reconcile theoretical margin, consumption leakage and observed wastage by outlet.", "Where is working capital tied up in closing stock and open POs?", "Which figures are observed, calculated or estimated?"],
};

export function personaFrom(value: unknown, message: string): Persona {
  const supplied = String(value ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (supplied in PERSONAS) return supplied as Persona;
  const text = message.toLowerCase();
  if (/\bceo\b|chief executive/.test(text)) return "ceo";
  if (/\bcoo\b|chief operating/.test(text)) return "coo";
  if (/procurement|purchase manager|buyer/.test(text)) return "procurement_manager";
  if (/chef|kitchen head|culinary/.test(text)) return "executive_chef";
  if (/outlet manager|store manager/.test(text)) return "outlet_manager";
  if (/finance|controller|cfo/.test(text)) return "finance";
  return "coo";
}

