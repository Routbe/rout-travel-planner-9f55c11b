import { replayed } from "./replaylib";
const db = await replayed();
const live = JSON.parse(await Bun.file("/tmp/b3/live.json").text()).rows[0].r.fns as any[];
const r = await db.query(`select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as k, md5(pg_get_functiondef(p.oid)) as h, pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^rout_booking_'`);
let diff = 0; const rows = r.rows as any[];
for (const l of live.filter(x => x.k.startsWith("public.rout_booking_"))) { const x = rows.find(y => y.k === l.k); if (!x || x.h !== l.h) { diff++; console.log("DIFF", l.k); } }
console.log("booking live", live.filter(x => x.k.startsWith("public.rout_booking_")).length, "diffs", diff);
const cat = new Set(((await db.query(`select distinct proname from pg_proc where pronamespace='pg_catalog'::regnamespace`)).rows as any[]).map(x => x.proname));
const kw = new Set(["exists","coalesce","case","in","values","array","any","all","greatest","least","nullif","select","from","over","as","and","or","not","when","then","on","row","returns","table","loop","if","into","with","jsonb","text","boolean","integer","bigint","uuid","timestamptz","interval","date","filter","lateral","returning","where","join","by","conflict","set","update","insert","delete","using","public","function","language","is","exclude","perform"]);
for (const x of rows) {
  const body = x.d.slice(x.d.indexOf("AS $function$"));
  const toks = [...body.matchAll(/(?<![\w.$])([a-z_][a-z0-9_]*)\s*\(/gi)].map(m => m[1].toLowerCase()).filter(t => !kw.has(t) && !cat.has(t));
  if (toks.length) console.log(x.k.slice(0, 50), [...new Set(toks)]);
}
await Bun.write("/tmp/b3/two.sql", rows.filter(x => /rout_booking_(hold|zone)\(/.test(x.k)).map(x => x.d).join("\n;;;;\n"));
