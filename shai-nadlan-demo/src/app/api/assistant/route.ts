import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

// Two sequential model calls can pass 10s; Vercel Hobby allows up to 60.
export const maxDuration = 60;

const CLAUDE_MODEL = 'claude-opus-5';
const GEMINI_MODEL = 'gemini-2.5-flash';

/* ── What the planner may touch ────────────────────────
   RLS already scopes every row to the signed-in owner; the allowlist is
   defense in depth so a crafted prompt cannot reach a column we never
   meant the assistant to read. */
/* The tables the assistant may read, checked against the real schema: a name
   that is not a table fails to compile, and ALLOWED_COLUMNS below must carry
   an entry for every one of them — a missing or extra key is a type error,
   not something to notice later. */
const ASSISTANT_TABLES = ['properties', 'tenants', 'leases', 'repairs', 'vendors'] as const satisfies readonly (keyof Database['public']['Tables'])[];
type AssistantTable = (typeof ASSISTANT_TABLES)[number];

const ALLOWED_COLUMNS: Record<AssistantTable, string[]> = {
  properties: [
    'id', 'name', 'address', 'city', 'property_type', 'rooms', 'area_sqm',
    'floor_no', 'purchase_price', 'purchase_date', 'current_value', 'status',
    'notes', 'created_at',
  ],
  tenants: ['id', 'full_name', 'phone', 'email', 'notes', 'created_at'],
  leases: [
    'id', 'property_id', 'tenant_id', 'start_date', 'end_date', 'monthly_rent',
    'payment_day', 'deposit', 'linked_to_cpi', 'status', 'notes', 'created_at',
  ],
  repairs: [
    'id', 'property_id', 'vendor_id', 'title', 'trade', 'reported_on', 'done_on',
    'cost', 'charge_mode', 'tenant_share', 'tenant_charge', 'owner_cost',
    'notes', 'created_at',
  ],
  vendors: ['id', 'name', 'trade', 'phone', 'email', 'notes', 'created_at'],
};

/* The one list of tables the assistant may read. Both plan schemas below
   derive from it, so a table added to the allowlist is immediately askable —
   `repairs` was added to the allowlist and to the prompt and remained
   unreachable, because the enum in each schema still named three tables and
   every repairs question came back "I did not understand". */
const TABLES = ASSISTANT_TABLES as unknown as [AssistantTable, ...AssistantTable[]];

/* ── Query-plan schema ─────────────────────────────────
   The model must answer inside this shape — a validated plan, never
   free-form JSON we'd have to regex out of prose. Whatever the provider,
   the plan only counts if it parses against this. */
const FilterSchema = z.object({
  column: z.string(),
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is']),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

const QuerySchema = z.object({
  table: z.enum(TABLES),
  select: z.array(z.string()),
  filters: z.array(FilterSchema),
  order: z.union([
    z.object({ column: z.string(), ascending: z.boolean() }),
    z.null(),
  ]),
  limit: z.union([z.number(), z.null()]),
});

const PlanSchema = z.object({
  intent: z.enum(['query', 'unknown']),
  queries: z.array(QuerySchema),
});

type Plan = z.infer<typeof PlanSchema>;

/* The same plan shape for Gemini's structured output. Gemini's schema
   dialect has no unions, so filter values arrive as nullable strings —
   PostgREST parses numeric strings fine and PlanSchema accepts them. */
const GEMINI_PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: { type: 'STRING', enum: ['query', 'unknown'] },
    queries: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          table: { type: 'STRING', enum: TABLES },
          select: { type: 'ARRAY', items: { type: 'STRING' } },
          filters: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                column: { type: 'STRING' },
                op: { type: 'STRING', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is'] },
                value: { type: 'STRING', nullable: true },
              },
              required: ['column', 'op', 'value'],
            },
          },
          order: {
            type: 'OBJECT',
            nullable: true,
            properties: {
              column: { type: 'STRING' },
              ascending: { type: 'BOOLEAN' },
            },
            required: ['column', 'ascending'],
          },
          limit: { type: 'INTEGER', nullable: true },
        },
        required: ['table', 'select', 'filters', 'order', 'limit'],
      },
    },
  },
  required: ['intent', 'queries'],
} as const;

/* Closed vocabularies. A filter carrying a value outside them (e.g. a
   Hebrew word instead of the stored enum) would return an empty set that
   reads as a confident "none" — treat it as could-not-read instead. */
const ENUM_COLUMNS: Partial<Record<AssistantTable, Record<string, string[]>>> = {
  properties: {
    status: ['rented', 'vacant', 'renovation', 'for_sale'],
    property_type: ['apartment', 'penthouse', 'garden_apartment', 'house', 'commercial', 'office', 'storage', 'parking'],
  },
  leases: {
    status: ['active', 'ended'],
  },
  repairs: {
    charge_mode: ['owner', 'tenant', 'split'],
  },
};

function validEnumFilters(table: AssistantTable, filters: { column: string; op: string; value: unknown }[]): boolean {
  const enums = ENUM_COLUMNS[table];
  if (!enums) return true;
  return filters.every((f) => {
    const vocab = enums[f.column];
    if (!vocab || (f.op !== 'eq' && f.op !== 'neq')) return true;
    return typeof f.value === 'string' && vocab.includes(f.value);
  });
}

const MAX_LIMIT = 100;

/**
 * Every total the rows can support, worked out in JavaScript.
 *
 * A language model asked to add fifteen seven-figure numbers will produce a
 * plausible one, and a plausible total is indistinguishable from a correct one
 * in a fluent Hebrew sentence. So the arithmetic happens here and the answer
 * step is told to quote it rather than do its own.
 */
function summarise(rows: unknown[]): string {
  if (!rows.length) return '';
  const lines: string[] = [`count = ${rows.length}`];
  const numeric = new Map<string, number[]>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      if (!Number.isFinite(n)) continue;
      // An id or a year is a number and is never worth totalling.
      if (/(^|_)(id|day|no|floor)$/.test(k)) continue;
      numeric.set(k, [...(numeric.get(k) ?? []), n]);
    }
  }
  for (const [col, values] of numeric) {
    if (values.length < 2) continue;
    const sum = values.reduce((a, b) => a + b, 0);
    lines.push(`sum(${col}) = ${sum} · avg(${col}) = ${Math.round(sum / values.length)} · n = ${values.length}`);
  }
  return lines.join('\n');
}

/** The allowlist, looked up by a name that has not been proved to be a table. */
const columnsOf = (name: string): string[] | undefined =>
  (ALLOWED_COLUMNS as Record<string, string[] | undefined>)[name];

function validColumns(table: string, columns: string[]): boolean {
  const allowed = columnsOf(table);
  if (!allowed) return false;
  return columns.every((raw) => {
    const col = raw.trim();
    // Embedded relation, e.g. properties(name,city) inside a leases query.
    const rel = col.match(/^(\w+)\(([\w\s,]+)\)$/);
    if (rel) {
      const relAllowed = columnsOf(rel[1]);
      const relCols = rel[2].split(',').map((c) => c.trim());
      return !!relAllowed && relCols.every((c) => relAllowed.includes(c));
    }
    return allowed.includes(col);
  });
}

const SCHEMA_PROMPT = `You are the AI assistant inside a Hebrew real-estate portfolio app owned by שי עובדיה.
You translate a Hebrew question about the portfolio into a query plan. Respond only through the given schema.

DATABASE (PostgREST-style, all rows belong to the signed-in owner):
- properties: id, name, address, city, property_type (apartment/penthouse/garden_apartment/house/commercial/office/storage/parking), rooms, area_sqm, floor_no, purchase_price, purchase_date, current_value, status (rented/vacant/renovation/for_sale), notes, created_at
- tenants: id, full_name, phone, email, notes, created_at
- leases: id, property_id, tenant_id, start_date, end_date, monthly_rent, payment_day, deposit, linked_to_cpi, status (active/ended), notes, created_at
- repairs: id, property_id, vendor_id, title, trade, reported_on, done_on (null = still open), cost (null = the invoice has not arrived yet), charge_mode (owner/tenant/split), tenant_share, tenant_charge, owner_cost, notes, created_at
- vendors: id, name, trade, phone, email, notes, created_at

RULES:
- select is an array of column names. In a leases query you may embed the related rows as "properties(name,city)" and "tenants(full_name,phone)".
- Filter values for status, property_type and charge_mode MUST be the exact English enum values listed above — never Hebrew words. Hebrew mapping: מושכר=rented, פנוי=vacant, בשיפוץ=renovation, למכירה=for_sale, פעיל=active, הסתיים=ended, על חשבוני=owner, על חשבון הדייר=tenant, חלוקה=split.
- On repairs: owner_cost is what came off the owner's profit and tenant_charge is what was charged on to the tenant — both are computed by the database, so select them rather than working the split out from cost. An open repair has done_on = null; a repair whose invoice has not arrived has cost = null, which means "not known yet" and never ₪0. In a repairs query you may embed "properties(name,city)" and "vendors(name,trade)".
- Dates are ISO YYYY-MM-DD strings. For "soon/הקרוב" questions filter end_date between today and the horizon the user implies (default 6 months).
- Text matching (name, address, city, full_name) MUST use op "ilike" with the value wrapped in % on both sides, e.g. {"op":"ilike","value":"%רוטשילד%"} — never eq, and never a bare substring.
- For sums/averages (portfolio value, total rent) select the numeric columns and enough context columns; the answer layer does the arithmetic.
- Prefer few queries (max 3). limit null means default.
- If the question is not about this portfolio data, or you cannot map it, use intent "unknown" with an empty queries array.`;

const FORMAT_PROMPT = `You are a Hebrew-speaking assistant inside a real-estate portfolio app.
Format the fetched data into a clear, concise Hebrew answer to the user's question.
- Currency is ₪ with thousands commas (e.g. ₪12,500). Compute sums/averages yourself when asked.
- Short sentences; a short list when several items are returned.
- NEVER add, average or otherwise calculate numbers yourself. Any total you need is already given under COMPUTED TOTALS — quote it exactly. If the total you need is not there, say what you can from the rows rather than working it out.
- If a query result is empty, say לא נמצאו נתונים מתאימים — never invent values.
- If the data block says a query FAILED, say you could not read that data right now; do not treat failure as "no results".
- Plain text only — no markdown, no asterisks, no bold. Bullet lists use the character • .
- No technical terms (SQL, tables, JSON). Answer directly, no intro.`;

type HistoryItem = { role: string; content: string };
type Turn = { role: 'user' | 'assistant'; content: string };

/* ── Providers ─────────────────────────────────────────
   Claude when an Anthropic key is configured; Gemini otherwise.
   Both return null for "could not produce a usable result" — that state
   is never silently converted into an empty plan or an invented answer. */

/* "The model could not map your question" and "the model never answered" are
   different things, and only the first is the user's to act on. Folding an
   unreachable service into "I did not understand the question" blames the
   person for an outage and sends them rewording a question that was fine —
   which is exactly what happened here with an expired API key. */
const UNREACHABLE = Symbol('assistant-unreachable');
type Planned = Plan | null | typeof UNREACHABLE;

async function claudePlan(client: Anthropic, turns: Turn[]): Promise<Planned> {
  try {
    const resp = await client.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      output_config: { effort: 'low', format: zodOutputFormat(PlanSchema) },
      system: SCHEMA_PROMPT,
      messages: turns,
    });
    if (resp.stop_reason === 'refusal') return null;
    return resp.parsed_output ?? null;
  } catch (e) {
    console.error('claude plan call failed:', e instanceof Error ? e.message : e);
    return UNREACHABLE;
  }
}

async function claudeAnswer(client: Anthropic, content: string): Promise<string | null> {
  const resp = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    output_config: { effort: 'low' },
    system: FORMAT_PROMPT,
    messages: [{ role: 'user', content }],
  });
  if (resp.stop_reason === 'refusal') return null;
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return text || null;
}

async function geminiCall(
  apiKey: string,
  system: string,
  turns: Turn[],
  jsonSchema?: unknown,
): Promise<string | null | typeof UNREACHABLE> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map((t) => ({
          role: t.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: t.content }],
        })),
        generationConfig: jsonSchema
          ? { responseMimeType: 'application/json', responseSchema: jsonSchema }
          : {},
      }),
    },
  );
  if (!resp.ok) {
    /* The status alone sent an earlier debugging session looking in the wrong
       place: a 400 here is almost always the request schema being rejected,
       and the body says which field. Log it. */
    console.error('gemini call failed:', resp.status, (await resp.text()).slice(0, 600));
    return UNREACHABLE;
  }
  const json = await resp.json();
  const parts: { text?: string }[] = json?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? '').join('').trim();
  return text || null;
}

async function geminiPlan(apiKey: string, turns: Turn[]): Promise<Planned> {
  const text = await geminiCall(apiKey, SCHEMA_PROMPT, turns, GEMINI_PLAN_SCHEMA);
  if (text === UNREACHABLE) return UNREACHABLE;
  if (!text) return null;
  try {
    const parsed = PlanSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/* Tiny per-instance throttle — enough to stop a runaway client loop. */
const hits = new Map<string, number[]>();
function throttled(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const recent = (hits.get(userId) ?? []).filter((t) => t > windowStart);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > 15;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (throttled(user.id)) {
    return NextResponse.json({ answer: 'רגע, לאט יותר — נסה שוב בעוד דקה.' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!anthropicKey && !geminiKey) {
    return NextResponse.json({ answer: 'העוזר החכם עדיין לא הופעל בסביבה הזו.' });
  }
  const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;

  let body: { message?: string; history?: HistoryItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const message = (body.message ?? '').trim().slice(0, 1000);
  if (!message) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);

  try {
    /* ── Phase A: plan ── */
    const turns: Turn[] = [];
    for (const h of (body.history ?? []).slice(-10)) {
      turns.push({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: String(h.content).slice(0, 2000),
      });
    }
    turns.push({ role: 'user', content: `(התאריך היום: ${today})\n${message}` });

    const plan = anthropic
      ? await claudePlan(anthropic, turns)
      : await geminiPlan(geminiKey!, turns);

    if (plan === UNREACHABLE) {
      return NextResponse.json({
        answer: 'העוזר החכם לא זמין כרגע — זו תקלה אצלנו, לא בשאלה שלך. נסה שוב עוד רגע.',
      });
    }
    if (!plan) {
      return NextResponse.json({
        answer: 'לא הצלחתי להבין את השאלה. נסה למשל: "אילו חוזים מסתיימים בקרוב?" או "מה שווי התיק?"',
      });
    }

    console.log('assistant plan:', JSON.stringify(plan));

    if (plan.intent === 'unknown' || plan.queries.length === 0) {
      return NextResponse.json({
        answer: 'אני עונה על שאלות על תיק הנכסים — נכסים, שוכרים, חוזים ותשלומים. נסה למשל: "אילו נכסים פנויים?"',
      });
    }

    /* ── Phase B: execute, per query, with its own failed state ── */
    const results: { table: string; data?: unknown[]; failed?: true }[] = [];
    for (const q of plan.queries.slice(0, 3)) {
      const selectCols = q.select.length ? q.select : ['id'];
      if (
        !validColumns(q.table, selectCols) ||
        !validColumns(q.table, q.filters.map((f) => f.column)) ||
        !validEnumFilters(q.table, q.filters) ||
        (q.order && !validColumns(q.table, [q.order.column]))
      ) {
        console.error(`assistant plan rejected on ${q.table}:`, JSON.stringify(q.filters));
        results.push({ table: q.table, failed: true });
        continue;
      }

      let query = supabase.from(q.table).select(selectCols.join(','));
      for (const f of q.filters) {
        const v = f.value;
        if (v === null || f.op === 'is') {
          query = query.is(f.column, v === null || v === 'null' ? null : (v as boolean));
          continue;
        }
        switch (f.op) {
          case 'eq': query = query.eq(f.column, v); break;
          case 'neq': query = query.neq(f.column, v); break;
          case 'gt': query = query.gt(f.column, v); break;
          case 'gte': query = query.gte(f.column, v); break;
          case 'lt': query = query.lt(f.column, v); break;
          case 'lte': query = query.lte(f.column, v); break;
          case 'like': query = query.like(f.column, String(v)); break;
          case 'ilike': query = query.ilike(f.column, String(v)); break;
        }
      }
      if (q.order) query = query.order(q.order.column, { ascending: q.order.ascending });
      const limit = typeof q.limit === 'number' && Number.isFinite(q.limit)
        ? Math.min(Math.max(1, Math.floor(q.limit)), MAX_LIMIT)
        : MAX_LIMIT;
      query = query.limit(limit);

      const { data, error } = await query;
      if (error) {
        console.error(`assistant query failed on ${q.table}:`, error.message);
        results.push({ table: q.table, failed: true });
      } else {
        results.push({ table: q.table, data: data ?? [] });
      }
    }

    if (results.every((r) => r.failed)) {
      return NextResponse.json({ answer: 'לא הצלחתי לקרוא את הנתונים כרגע. נסה שוב עוד רגע.' });
    }

    /* ── Phase C: answer in Hebrew ── */
    /* Totals are computed HERE, not by the model.
       Asked for the portfolio's value it answered ₪50,000,000 against a real
       ₪48,000,000 — it had the right rows and added them up wrong, which is the
       worst kind of wrong because the sentence around it is perfectly fluent.
       Every sum, count and average the rows can support is handed over already
       calculated, and the prompt forbids arithmetic. */
    const dataBlock = results
      .map((r) => {
        if (r.failed) return `${r.table}: FAILED (could not be read)`;
        const rows = r.data ?? [];
        const totals = summarise(rows);
        return `${r.table} (${rows.length} rows)${totals ? `\nCOMPUTED TOTALS — use these exact numbers, do not recalculate:\n${totals}` : ''}\n${JSON.stringify(rows)}`;
      })
      .join('\n\n');

    const question = `התאריך היום: ${today}\nהשאלה: ${message}\n\nהנתונים:\n${dataBlock}`;
    const answer = anthropic
      ? await claudeAnswer(anthropic, question)
      : await geminiCall(geminiKey!, FORMAT_PROMPT, [{ role: 'user', content: question }]);

    if (!answer) {
      return NextResponse.json({ answer: 'לא הצלחתי לנסח תשובה לשאלה הזו. נסה לנסח אחרת.' });
    }

    // Raw rows never leave the server — only the formatted Hebrew answer.
    return NextResponse.json({ answer });
  } catch (err) {
    console.error('assistant error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ answer: 'אירעה שגיאה. נסה שוב.' });
  }
}
