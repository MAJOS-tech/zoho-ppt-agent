import PptxGenJS from "pptxgenjs";

const FRONTEND_ORIGIN = "https://majos-tech.github.io";
const FRONTEND_URL = "https://majos-tech.github.io/zoho-ppt-agent/";
const ZOHO_ACCOUNTS_URL = "https://accounts.zoho.in";
const ZOHO_SCOPE = "ZohoAnalytics.data.read";
const OAUTH_STATE_COOKIE = "ppt_agent_zoho_state";
const SESSION_COOKIE = "ppt_agent_session";
const JOB_TTL = 60 * 60 * 24;
const SESSION_TTL = 60 * 60 * 24 * 7;
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

type ZohoTokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
type DeckRequest = { prompt: string; workspace: string; period: string; audience: string; slideCount: number; scope: string[] };
type Job = { status: "queued" | "running" | "complete" | "failed"; stage: "analyze" | "story" | "render"; message: string; fileName?: string; downloadUrl?: string };
type Row = Record<string, string>;
type DeckData = { summary: Row[]; outlets: Row[]; menu: Row[]; risks: Row[]; procurement: Row[]; period: string; generatedAt: string };
type ChatRequest = { message: string; period: string; conversationId?: string };
type ChatTurn = { role: "user" | "assistant"; content: string };
type ChatAnswer = { answer: string; highlights?: string[]; view?: "summary" | "outlets" | "menu" | "risks" | "procurement" };

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin === FRONTEND_ORIGIN ? origin : FRONTEND_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(request: Request, payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: { ...corsHeaders(request), "Cache-Control": "no-store" } });
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function stateCookie(value: string, maxAge: number): string {
  return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function sessionCookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
}

async function hasSession(request: Request, env: Env): Promise<boolean> {
  const session = readCookie(request, SESSION_COOKIE);
  return Boolean(session && await env.PPT_AGENT_JOBS.get(`session:${session}`));
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(null, { status: 302, headers });
}

function callbackUrl(url: URL): string { return `${url.origin}/auth/zoho/callback`; }
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function periodBounds(period: string): { start: string; end: string; label: string } {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("Reporting period must be YYYY-MM.");
  const [year, month] = period.split("-").map(Number);
  if (month < 1 || month > 12) throw new Error("Invalid reporting month.");
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  const end = endDate.toISOString().slice(0, 10);
  const label = endDate.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  return { start, end, label };
}

function validateDeckRequest(value: unknown): DeckRequest {
  if (!value || typeof value !== "object") throw new Error("Invalid request.");
  const body = value as Partial<DeckRequest>;
  const prompt = String(body.prompt ?? "").trim();
  if (prompt.length < 12 || prompt.length > 2000) throw new Error("Request must be between 12 and 2,000 characters.");
  periodBounds(String(body.period ?? ""));
  return {
    prompt,
    workspace: "abnah",
    period: String(body.period),
    audience: String(body.audience ?? "Executive Committee").slice(0, 80),
    slideCount: Math.min(10, Math.max(4, Number(body.slideCount) || 6)),
    scope: Array.isArray(body.scope) ? body.scope.map(String).slice(0, 8) : [],
  };
}

async function accessToken(env: Env): Promise<string> {
  const refreshToken = await env.PPT_AGENT_ZOHO_TOKENS.get("refresh_token");
  if (!refreshToken) throw new Error("Zoho is not connected.");
  const response = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: env.ZOHO_CLIENT_ID, client_secret: env.ZOHO_CLIENT_SECRET }),
  });
  const token = await response.json<ZohoTokenResponse>();
  if (!response.ok || !token.access_token) throw new Error("Zoho token refresh failed. Reconnect Zoho.");
  return token.access_token;
}

async function zohoFetch(env: Env, token: string, path: string): Promise<Response> {
  return fetch(`${env.ZOHO_ANALYTICS_BASE_URL}${path}`, { headers: { Authorization: `Zoho-oauthtoken ${token}`, "ZANALYTICS-ORGID": env.ZOHO_ANALYTICS_ORG_ID } });
}

async function exportSql(env: Env, token: string, sqlQuery: string): Promise<string> {
  const config = encodeURIComponent(JSON.stringify({ sqlQuery, responseFormat: "csv" }));
  let jobId: string | undefined;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await zohoFetch(env, token, `/restapi/v2/bulk/workspaces/${env.ZOHO_ANALYTICS_WORKSPACE_ID}/data?CONFIG=${config}`);
    if (response.ok) { jobId = (await response.json<{ data: { jobId: string } }>()).data.jobId; break; }
    const detail = await response.text();
    if (response.status === 400 && detail.includes("ASYNC_EXPORT_LIMIT_EXCEEDED")) { await delay(1200 * (attempt + 1)); continue; }
    throw new Error(`Zoho export could not start (${response.status}).`);
  }
  if (!jobId) throw new Error("Zoho export queue is busy.");
  // Keep a hard ceiling so a slow Zoho export cannot exhaust the Worker's
  // per-invocation subrequest allowance. Chat requests load at most two views.
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const response = await zohoFetch(env, token, `/restapi/v2/bulk/workspaces/${env.ZOHO_ANALYTICS_WORKSPACE_ID}/exportjobs/${jobId}`);
    if (!response.ok) throw new Error("Zoho export status failed.");
    const result = await response.json<{ data: { jobCode: string } }>();
    if (result.data.jobCode === "1004") {
      const download = await zohoFetch(env, token, `/restapi/v2/bulk/workspaces/${env.ZOHO_ANALYTICS_WORKSPACE_ID}/exportjobs/${jobId}/data`);
      if (!download.ok) throw new Error("Zoho export download failed.");
      return download.text();
    }
    if (["1003", "1005"].includes(result.data.jobCode)) throw new Error("Zoho export job failed.");
    await delay(1000);
  }
  throw new Error("Zoho export timed out.");
}

function csvRows(csv: string): Row[] {
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i], next = csv[i + 1];
    if (char === '"' && quoted && next === '"') { value += char; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") i += 1; row.push(value); if (row.some(Boolean)) rows.push(row); row = []; value = ""; }
    else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const [header = [], ...data] = rows;
  return data.map((cells) => Object.fromEntries(header.map((key, index) => [key.replace(/^\uFEFF/, ""), cells[index] ?? ""])));
}

function queries(period: string): Record<string, string> {
  const { start, end } = periodBounds(period);
  const salesFilter = `WHERE "sales_date" >= '${start}' AND "sales_date" <= '${end}'`;
  return {
    summary: `SELECT ROUND(SUM("net_sales_value"),0) AS "net_sales", ROUND(SUM("menu_gross_margin"),0) AS "gross_margin", ROUND(100.0*SUM("menu_gross_margin")/NULLIF(SUM("net_sales_value"),0),1) AS "gross_margin_pct", COUNT(DISTINCT "outlet_name") AS "outlet_count", COUNT(DISTINCT "menu_item_code") AS "menu_count" FROM "QT_04_Menu_Profitability" ${salesFilter}`,
    outlets: `SELECT "outlet_name" AS "store", ROUND(SUM("net_sales_value"),0) AS "net_sales", ROUND(SUM("menu_gross_margin"),0) AS "gross_margin", ROUND(100.0*SUM("menu_gross_margin")/NULLIF(SUM("net_sales_value"),0),1) AS "gross_margin_pct" FROM "QT_04_Menu_Profitability" ${salesFilter} GROUP BY "outlet_name" ORDER BY "gross_margin" DESC`,
    menu: `SELECT "menu_item_name" AS "menu_item", "outlet_name" AS "store", ROUND(SUM("net_sales_value"),0) AS "net_sales", ROUND(SUM("menu_gross_margin"),0) AS "gross_margin", ROUND(100.0*SUM("menu_gross_margin")/NULLIF(SUM("net_sales_value"),0),1) AS "gross_margin_pct", SUM("sold_menu_qty") AS "qty_sold" FROM "QT_04_Menu_Profitability" ${salesFilter} GROUP BY "menu_item_name", "outlet_name" ORDER BY "gross_margin" ASC LIMIT 12`,
    risks: `SELECT "outlet_name" AS "store", "item_name", "subject_type", "risk_color", ROUND(COALESCE("monetary_exposure",0),0) AS "exposure", ROUND(COALESCE("shortage_qty",0),2) AS "shortage_qty", "po_overdue_days", "impacted_menu_item_count" FROM "QT_02_Numerical_Risk_Center" WHERE "latest_valid_flag"=1 AND "core_complete_flag"=1 AND "risk_color" IN ('Red','Amber') ORDER BY "risk_priority_rank" ASC, COALESCE("monetary_exposure",0) DESC LIMIT 12`,
    procurement: `SELECT "outlet_name" AS "store", "vendor_name", ROUND(SUM(COALESCE("open_po_liability_pre_tax",0)),0) AS "open_liability", MAX("overdue_days") AS "max_overdue_days" FROM "QT_05_Procurement_Control" WHERE "latest_valid_flag"=1 AND "core_complete_flag"=1 AND "po_status" IN ('Open','Partially Received') GROUP BY "outlet_name", "vendor_name" ORDER BY "open_liability" DESC LIMIT 10`,
  };
}

async function loadDeckData(env: Env, period: string): Promise<DeckData> {
  const token = await accessToken(env); const result: Partial<DeckData> = {};
  for (const [name, sql] of Object.entries(queries(period))) {
    result[name as keyof DeckData] = csvRows(await exportSql(env, token, sql)) as never;
    await delay(200);
  }
  return { summary: result.summary ?? [], outlets: result.outlets ?? [], menu: result.menu ?? [], risks: result.risks ?? [], procurement: result.procurement ?? [], period, generatedAt: new Date().toISOString() };
}

type EvidenceView = "summary" | "outlets" | "menu" | "risks" | "procurement";

function chatEvidenceViews(message: string): EvidenceView[] {
  const text = message.toLowerCase();
  const wantsOutlet = /outlet|store|location|branch/.test(text);
  const wantsRisk = /risk|shortage|expiry|expired|exposure|stock/.test(text);
  const wantsMenu = /menu|dish|recipe|food item|item margin/.test(text);
  const wantsProcurement = /procurement|vendor|supplier|purchase order|\bpo\b|overdue/.test(text);
  const wantsSummary = /summary|overall|total|business|company/.test(text);

  if (wantsOutlet && wantsRisk) return ["outlets", "risks"];
  if (wantsMenu && wantsRisk) return ["menu", "risks"];
  if (wantsProcurement) return wantsRisk ? ["procurement", "risks"] : ["procurement", "summary"];
  if (wantsMenu) return ["menu", "summary"];
  if (wantsRisk) return ["risks", "summary"];
  if (wantsOutlet) return ["outlets", "summary"];
  if (wantsSummary) return ["summary", "outlets"];
  return ["summary", "outlets"];
}

async function loadChatEvidence(env: Env, period: string, message: string): Promise<Record<EvidenceView, Row[]>> {
  const token = await accessToken(env);
  const sql = queries(period);
  const selected = chatEvidenceViews(message);
  const loaded = await Promise.all(selected.map(async (view) => [view, csvRows(await exportSql(env, token, sql[view]))] as const));
  const evidence: Record<EvidenceView, Row[]> = { summary: [], outlets: [], menu: [], risks: [], procurement: [] };
  for (const [view, rows] of loaded) evidence[view] = rows;
  return evidence;
}

function validateChatRequest(value: unknown): ChatRequest {
  if (!value || typeof value !== "object") throw new Error("Invalid request.");
  const body = value as Partial<ChatRequest>;
  const message = String(body.message ?? "").trim();
  if (message.length < 3 || message.length > 1500) throw new Error("Question must be between 3 and 1,500 characters.");
  periodBounds(String(body.period ?? ""));
  return { message, period: String(body.period), conversationId: body.conversationId ? String(body.conversationId).slice(0, 80) : undefined };
}

function aiText(result: unknown): string {
  if (result && typeof result === "object" && "response" in result && typeof (result as { response?: unknown }).response === "string") return (result as { response: string }).response;
  throw new Error("The AI model returned an invalid response.");
}

function parseAiAnswer(text: string): ChatAnswer {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI response did not contain valid JSON.");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as ChatAnswer;
  if (!parsed || typeof parsed.answer !== "string" || !parsed.answer.trim()) throw new Error("The AI response could not be validated.");
  parsed.highlights = Array.isArray(parsed.highlights) ? parsed.highlights.filter(value => typeof value === "string").slice(0, 5) : [];
  return parsed;
}

async function answerQuestion(env: Env, request: ChatRequest, session: string): Promise<{ conversationId: string; answer: ChatAnswer; rows: Row[]; columns: string[]; period: string }> {
  const conversationId = request.conversationId ?? crypto.randomUUID();
  const historyKey = `chat:${session}:${conversationId}`;
  const history = (await env.PPT_AGENT_JOBS.get<ChatTurn[]>(historyKey, "json") ?? []).slice(-6);
  const loaded = await loadChatEvidence(env, request.period, request.message);
  const evidence = { summary: loaded.summary, outlets: loaded.outlets.slice(0, 12), menu: loaded.menu.slice(0, 12), risks: loaded.risks.slice(0, 12), procurement: loaded.procurement.slice(0, 10) };
  const prompt = `You are the ABNAH executive analytics agent. Answer only from the supplied Zoho Analytics evidence. Distinguish monthly sales activity from latest-complete supply/procurement position. Never invent causes or values. If evidence is insufficient, say so. Use concise executive language and Indian rupee formatting. Return valid JSON with keys answer (string), highlights (array of up to 5 strings), and view (one of summary,outlets,menu,risks,procurement).\nReporting period: ${request.period}\nRecent conversation: ${JSON.stringify(history)}\nQuestion: ${request.message}\nGoverned evidence: ${JSON.stringify(evidence)}`;
  const result = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    prompt,
    max_tokens: 900,
    temperature: 0.15,
    response_format: { type: "json_object" },
  });
  const answer = parseAiAnswer(aiText(result));
  const view = ["summary", "outlets", "menu", "risks", "procurement"].includes(answer.view ?? "") ? answer.view! : "summary";
  const rows = evidence[view].slice(0, 10);
  const columns = rows.length ? Object.keys(rows[0]).slice(0, 7) : [];
  const nextHistory: ChatTurn[] = [...history, { role: "user", content: request.message }, { role: "assistant", content: answer.answer }].slice(-8);
  await env.PPT_AGENT_JOBS.put(historyKey, JSON.stringify(nextHistory), { expirationTtl: SESSION_TTL });
  return { conversationId, answer: { ...answer, view }, rows, columns, period: request.period };
}

const n = (value: string | undefined) => Number(value || 0);
const money = (value: number) => `â‚¹${Math.abs(value) >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}m` : Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toFixed(0)}`;

async function buildPptx(data: DeckData, request: DeckRequest): Promise<Uint8Array> {
  const pptx = new PptxGenJS(); pptx.layout = "LAYOUT_WIDE"; pptx.author = "MAJOS Tech"; pptx.subject = "Zoho Analytics executive supply-chain review"; pptx.title = `ABNAH Executive Review ${data.period}`; pptx.company = "MAJOS Tech"; pptx.lang = "en-IN";
  const C = { ink: "17231F", paper: "F4F1E9", white: "FFFDF8", moss: "123B2B", green: "4F7655", lime: "B9D27F", muted: "6D7972", amber: "BF7A18", red: "A93C31", line: "DCE1D7" };
  const footer = (slide: PptxGenJS.Slide, page: number) => { slide.addText(`Source: Zoho Analytics Â· ABG-GIT-Workspace Â· ${data.period} Â· generated ${data.generatedAt.slice(0,10)}`, { x: .45, y: 7.15, w: 11.8, h: .18, fontFace: "Aptos", fontSize: 7, color: C.muted, margin: 0 }); slide.addText(String(page), { x: 12.25, y: 7.12, w: .5, h: .2, fontSize: 8, align: "right", color: C.muted, margin: 0 }); };
  const title = (slide: PptxGenJS.Slide, kicker: string, claim: string, page: number) => { slide.background = { color: C.paper }; slide.addText(kicker.toUpperCase(), { x: .55, y: .35, w: 3, h: .2, fontFace: "Aptos", fontSize: 9, bold: true, charSpacing: 1.6, color: C.green, margin: 0 }); slide.addText(claim, { x: .55, y: .67, w: 12, h: .65, fontFace: "Georgia", fontSize: 27, bold: false, color: C.ink, margin: 0, breakLine: false }); footer(slide, page); };
  const summary = data.summary[0] ?? {}; const sales = n(summary.net_sales); const margin = n(summary.gross_margin); const marginPct = n(summary.gross_margin_pct);

  let slide = pptx.addSlide(); slide.background = { color: C.moss }; slide.addText("EXECUTIVE SUPPLY CHAIN REVIEW", { x: .65, y: .55, w: 5, h: .25, fontSize: 10, bold: true, charSpacing: 1.8, color: C.lime, margin: 0 }); slide.addText(`${periodBounds(data.period).label}\nABNAH operating position`, { x: .65, y: 1.25, w: 8.8, h: 1.55, fontFace: "Georgia", fontSize: 40, color: C.white, margin: 0, breakLine: false }); slide.addText(request.prompt, { x: .7, y: 3.25, w: 7.5, h: .8, fontSize: 15, color: "DDE7DE", margin: 0 }); [[money(sales),"NET SALES"],[`${marginPct.toFixed(1)}%`,"GROSS MARGIN"],[String(data.risks.filter(r=>r.risk_color==="Red").length),"RED RISKS"]].forEach(([v,l],i)=>{slide.addText(v,{x:9.1,y:1.25+i*1.35,w:3.2,h:.55,fontSize:27,bold:true,color:C.white,margin:0});slide.addText(l,{x:9.1,y:1.85+i*1.35,w:3.2,h:.2,fontSize:8,bold:true,charSpacing:1.3,color:C.lime,margin:0});}); slide.addText("Prepared for " + request.audience, { x: .7, y: 6.65, w: 5, h: .2, fontSize: 9, color: "BFCFC3", margin: 0 });

  slide = pptx.addSlide(); title(slide,"Position", margin >= 0 ? `Sales generated ${money(margin)} of recipe-based gross margin.` : `Recipe-based margin is negative by ${money(margin)}.`,2); const metrics=[[money(sales),"Net sales"],[money(margin),"Gross margin"],[`${marginPct.toFixed(1)}%`,"Margin rate"],[summary.outlet_count||"â€“","Outlets"]]; metrics.forEach(([v,l],i)=>{const x=.6+i*3.05;slide.addText(v,{x,y:1.65,w:2.7,h:.55,fontSize:26,bold:true,color:i===1&&margin<0?C.red:C.moss,margin:0});slide.addText(l,{x,y:2.25,w:2.7,h:.22,fontSize:10,bold:true,color:C.muted,margin:0});}); slide.addShape(pptx.ShapeType.line,{x:.6,y:2.75,w:12,h:0,line:{color:C.line,width:1}}); const topRisks=data.risks.slice(0,5); slide.addText("Immediate management attention",{x:.65,y:3.15,w:4,h:.3,fontSize:15,bold:true,color:C.ink,margin:0}); topRisks.forEach((r,i)=>{slide.addShape(pptx.ShapeType.rect,{x:.65,y:3.65+i*.52,w:.12,h:.32,line:{color:r.risk_color==="Red"?C.red:C.amber},fill:{color:r.risk_color==="Red"?C.red:C.amber}});slide.addText(`${r.store||"All outlets"} Â· ${r.item_name||r.subject_type}`,{x:.92,y:3.61+i*.52,w:5.7,h:.22,fontSize:11,bold:true,color:C.ink,margin:0});slide.addText(`${r.risk_color} Â· exposure ${money(n(r.exposure))}`,{x:.92,y:3.84+i*.52,w:5.7,h:.16,fontSize:8,color:C.muted,margin:0});}); slide.addText("Decision rule",{x:7.2,y:3.15,w:2,h:.3,fontSize:15,bold:true,color:C.ink,margin:0}); slide.addText("Protect availability first where red risk intersects high menu impact; release cash next from overdue or low-return commitments.",{x:7.2,y:3.7,w:5.1,h:1.1,fontFace:"Georgia",fontSize:20,color:C.green,margin:0.05,breakLine:false});

  slide = pptx.addSlide(); title(slide,"Outlet performance","Margin contribution is concentratedâ€”focus recovery where sales scale is meaningful.",3); const outlets=data.outlets.slice(0,8); const max=Math.max(1,...outlets.map(r=>Math.abs(n(r.gross_margin)))); outlets.forEach((r,i)=>{const y=1.55+i*.62;slide.addText(r.store||"Unknown",{x:.65,y,w:2.3,h:.22,fontSize:10,bold:true,color:C.ink,margin:0});slide.addShape(pptx.ShapeType.rect,{x:3,y:y+.02,w:Math.max(.05,7*Math.abs(n(r.gross_margin))/max),h:.22,line:{color:n(r.gross_margin)<0?C.red:C.green},fill:{color:n(r.gross_margin)<0?C.red:C.green}});slide.addText(`${money(n(r.gross_margin))} Â· ${n(r.gross_margin_pct).toFixed(1)}%`,{x:10.2,y,w:2.2,h:.22,fontSize:9,align:"right",color:C.muted,margin:0});});

  slide = pptx.addSlide(); title(slide,"Menu economics","Low-margin menu items create the fastest commercial recovery queue.",4); const menu=data.menu.slice(0,9); const rows=[["Menu item","Outlet","Sales","Margin","GM %"],...menu.map(r=>[r.menu_item||"â€“",r.store||"â€“",money(n(r.net_sales)),money(n(r.gross_margin)),`${n(r.gross_margin_pct).toFixed(1)}%`])]; slide.addTable(rows,{x:.6,y:1.48,w:12.05,h:4.95,border:{type:"solid",color:C.line,pt:.6},fill:C.white,color:C.ink,fontFace:"Aptos",fontSize:9,margin:.06,rowH:.42,colW:[3.9,2.5,1.8,1.8,1.2],bold:false,autoFit:false});

  slide = pptx.addSlide(); title(slide,"Supply risk","Red and amber exposures translate operational risk into a ranked action queue.",5); const risks=data.risks.slice(0,8); risks.forEach((r,i)=>{const y=1.5+i*.63;const color=r.risk_color==="Red"?C.red:C.amber;slide.addText(String(i+1).padStart(2,"0"),{x:.6,y,w:.35,h:.2,fontSize:9,bold:true,color,margin:0});slide.addText(`${r.item_name||r.subject_type} Â· ${r.store||"All outlets"}`,{x:1.05,y,w:5.7,h:.23,fontSize:11,bold:true,color:C.ink,margin:0});slide.addText(`${r.subject_type} Â· ${r.impacted_menu_item_count||0} menus impacted`,{x:1.05,y:y+.28,w:5.7,h:.18,fontSize:8,color:C.muted,margin:0});slide.addText(money(n(r.exposure)),{x:7.2,y,w:1.5,h:.25,fontSize:13,bold:true,color,align:"right",margin:0});slide.addText(r.po_overdue_days?`${r.po_overdue_days} days overdue`:"availability risk",{x:9,y,w:2.8,h:.2,fontSize:9,color:C.muted,margin:0});});

  slide = pptx.addSlide(); title(slide,"Action plan","Convert the evidence into five owned actions for the next operating cycle.",6); const actions=["Protect red-risk ingredients tied to the highest menu impact.","Escalate overdue open POs with the largest cash exposure.","Recover margin in high-sales, low-margin outlets before broad cost cuts.","Review the bottom menu items for price, recipe, portion or delisting action.","Reconcile incomplete recipe-cost coverage before the next executive close."]; actions.forEach((a,i)=>{const y=1.45+i*.94;slide.addText(String(i+1),{x:.7,y,w:.45,h:.45,fontSize:18,bold:true,color:C.white,align:"center",valign:"mid",fill:{color:i<2?C.red:C.moss},margin:0});slide.addText(a,{x:1.35,y:y-.02,w:7.6,h:.35,fontSize:15,bold:true,color:C.ink,margin:0});slide.addText(i<2?"Owner: Supply Chain Â· 48 hours":"Owner: Commercial / Operations Â· 7 days",{x:9.25,y,w:3,h:.25,fontSize:9,bold:true,color:C.muted,align:"right",margin:0});slide.addShape(pptx.ShapeType.line,{x:1.35,y:y+.5,w:10.9,h:0,line:{color:C.line,width:.7}});});

  const output = await pptx.write({ outputType: "uint8array", compression: true });
  if (!(output instanceof Uint8Array)) throw new Error("PowerPoint renderer returned an invalid payload.");
  return output;
}

async function putJob(env: Env, id: string, job: Job): Promise<void> { await env.PPT_AGENT_JOBS.put(`job:${id}`, JSON.stringify(job), { expirationTtl: JOB_TTL }); }
async function runJob(env: Env, id: string, request: DeckRequest, origin: string): Promise<void> {
  try {
    await putJob(env,id,{status:"running",stage:"analyze",message:"Retrieving and reconciling Zoho evidence."});
    const data=await loadDeckData(env,request.period);
    await putJob(env,id,{status:"running",stage:"story",message:"Building the executive claim sequence."});
    const file=await buildPptx(data,request); const fileName=`ABNAH-Executive-Supply-Chain-${request.period}.pptx`;
    await env.PPT_AGENT_JOBS.put(`file:${id}`,file,{expirationTtl:JOB_TTL,metadata:{contentType:PPTX_MIME,fileName}});
    await putJob(env,id,{status:"complete",stage:"render",message:"Editable PowerPoint generated from live Zoho evidence.",fileName,downloadUrl:`${origin}/api/decks/${id}/download`});
  } catch(error) {
    console.error(JSON.stringify({event:"deck_generation_failed",jobId:id,message:error instanceof Error?error.message:"unknown_error"}));
    await putJob(env,id,{status:"failed",stage:"render",message:error instanceof Error?error.message:"Presentation generation failed."});
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url=new URL(request.url);
    if(request.method==="OPTIONS"){const origin=request.headers.get("Origin");if(origin&&origin!==FRONTEND_ORIGIN)return json(request,{message:"Origin not allowed."},403);return new Response(null,{status:204,headers:corsHeaders(request)});}
    if(request.method==="GET"&&url.pathname==="/health"){const refresh=await env.PPT_AGENT_ZOHO_TOKENS.get("refresh_token");const session=await hasSession(request,env);return json(request,{status:"ok",service:"zoho-ppt-agent",zoho:refresh&&session?"connected":refresh?"authorization_required":"not_connected",generation:"ready",version:"1.1.2"});}
    if(request.method==="GET"&&(url.pathname==="/auth/zoho"||url.pathname==="/auth/zoho/start")){const state=crypto.randomUUID();const auth=new URL("/oauth/v2/auth",ZOHO_ACCOUNTS_URL);auth.search=new URLSearchParams({response_type:"code",client_id:env.ZOHO_CLIENT_ID,redirect_uri:callbackUrl(url),scope:ZOHO_SCOPE,access_type:"offline",prompt:"consent",state}).toString();return redirect(auth.toString(),[stateCookie(state,600)]);}
    if(request.method==="GET"&&url.pathname==="/auth/zoho/callback"){const code=url.searchParams.get("code"),state=url.searchParams.get("state"),expected=readCookie(request,OAUTH_STATE_COOKIE);if(!code||!state||!expected||state!==expected)return json(request,{message:"Invalid or expired Zoho authorization state."},400);const response=await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:callbackUrl(url),client_id:env.ZOHO_CLIENT_ID,client_secret:env.ZOHO_CLIENT_SECRET})});const token=await response.json<ZohoTokenResponse>();if(!response.ok||!token.refresh_token)return json(request,{message:"Zoho authorization did not return an offline refresh token."},502);await env.PPT_AGENT_ZOHO_TOKENS.put("refresh_token",token.refresh_token);const session=crypto.randomUUID();await env.PPT_AGENT_JOBS.put(`session:${session}`,"active",{expirationTtl:SESSION_TTL});const frontend=new URL(FRONTEND_URL);frontend.searchParams.set("zoho","connected");return redirect(frontend.toString(),[stateCookie("",0),sessionCookie(session,SESSION_TTL)]);}
    if(request.method==="POST"&&url.pathname==="/api/decks"){if(!(await hasSession(request,env)))return json(request,{message:"Connect Zoho in this browser before generating a presentation."},401);try{const body=validateDeckRequest(await request.json());const id=crypto.randomUUID();await putJob(env,id,{status:"queued",stage:"analyze",message:"Presentation request accepted."});ctx.waitUntil(runJob(env,id,body,url.origin));return json(request,{jobId:id},202);}catch(error){return json(request,{message:error instanceof Error?error.message:"Invalid request."},400);}}
    if(request.method==="POST"&&url.pathname==="/api/chat"){const session=readCookie(request,SESSION_COOKIE);if(!session||!(await hasSession(request,env)))return json(request,{message:"Connect Zoho in this browser before asking questions."},401);try{const body=validateChatRequest(await request.json());return json(request,await answerQuestion(env,body,session));}catch(error){console.error(JSON.stringify({event:"chat_failed",message:error instanceof Error?error.message:"unknown_error"}));return json(request,{message:error instanceof Error?error.message:"Question could not be answered."},400);}}
    const download=url.pathname.match(/^\/api\/decks\/([^/]+)\/download$/);if(request.method==="GET"&&download){if(!(await hasSession(request,env)))return json(request,{message:"Authorization required."},401);const id=download[1];const object=await env.PPT_AGENT_JOBS.getWithMetadata<{contentType?:string;fileName?:string}>(`file:${id}`,"arrayBuffer");if(!object.value)return json(request,{message:"Presentation file not found or expired."},404);return new Response(object.value,{headers:{...corsHeaders(request),"Content-Type":object.metadata?.contentType??PPTX_MIME,"Content-Disposition":`attachment; filename="${object.metadata?.fileName??"presentation.pptx"}`,"Cache-Control":"private, no-store"}});}
    const status=url.pathname.match(/^\/api\/decks\/([^/]+)$/);if(request.method==="GET"&&status){if(!(await hasSession(request,env)))return json(request,{message:"Authorization required."},401);const job=await env.PPT_AGENT_JOBS.get<Job>(`job:${status[1]}`,"json");return job?json(request,job):json(request,{message:"Deck job not found or expired."},404);}
    return json(request,{message:"Route not found."},404);
  }
} satisfies ExportedHandler<Env>;

