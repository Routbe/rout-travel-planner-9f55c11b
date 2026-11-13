/**
 * One rule for every SECURITY DEFINER function: it runs with
 * search_path = pg_catalog and nothing else, so no object the caller can put
 * on the path is ever resolved inside it. Shared by the CI tests, both
 * migration runners and the live check; the only exceptions are the shrinking
 * list in scripts/security-definer-legacy.ts.
 */
import { migrationNumber } from "./migration-plan";
import { legacyAllowedAfter } from "./security-definer-legacy";

/** Migrations from this number on are linted and guarded; older files are immutable history. */
export const DEFINER_GUARD_FROM = 255;

export type DefinerFn = { key: string; searchPath: string[] | null };
export type DefinerFinding = { problem: "not_pinned" | "stale_legacy_entry"; key: string; searchPath?: string[] | null };

/** "schema.name(identity args)", the same key the legacy list uses. */
export const definerKey = (schema: string, name: string, args: string) => `${schema}.${name}(${args})`;

/** search_path from pg_proc.proconfig ("search_path=public, pg_temp"). */
export function searchPathFromConfig(config: readonly string[] | null): string[] | null {
  const entry = config?.find((c) => c.startsWith("search_path="));
  return entry === undefined ? null : splitPath(entry.slice("search_path=".length));
}

/** search_path from pg_get_functiondef ("SET search_path TO 'public', 'pg_temp'"). */
export function searchPathFromDef(def: string): string[] | null {
  const m = /^\s*SET search_path (?:TO|=) (.+)$/m.exec(def);
  return m ? splitPath(m[1]!) : null;
}

function splitPath(value: string): string[] {
  return value.split(",").map((s) => s.trim().replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1")).filter(Boolean);
}

export const isPinned = (path: readonly string[] | null) => path !== null && path.length === 1 && path[0] === "pg_catalog";

/** Header of a pg_get_functiondef text (everything before the body) says SECURITY DEFINER. */
export function isSecurityDefinerDef(def: string): boolean {
  const body = def.search(/^AS /m);
  return /\bSECURITY DEFINER\b/.test(body < 0 ? def : def.slice(0, body));
}

/** Unpinned definers not on the legacy list, and legacy entries that no longer need to be there. */
export function definerFindings(fns: readonly DefinerFn[], legacy: readonly string[]): DefinerFinding[] {
  const out: DefinerFinding[] = [];
  const allowed = new Set(legacy);
  const unpinned = new Set<string>();
  for (const f of fns) {
    if (isPinned(f.searchPath)) continue;
    unpinned.add(f.key);
    if (!allowed.has(f.key)) out.push({ problem: "not_pinned", key: f.key, searchPath: f.searchPath });
  }
  for (const key of legacy) if (!unpinned.has(key)) out.push({ problem: "stale_legacy_entry", key });
  return out;
}

const PATH_VALUE = String.raw`((?:'[^']*'|"[^"]*"|[\w$]+)(?:\s*,\s*(?:'[^']*'|"[^"]*"|[\w$]+))*)`;
const SET_PATH = new RegExp(String.raw`\bset\s+(?:local\s+|session\s+)?search_path\s*(?:=|to)\s*` + PATH_VALUE, "gi");

/**
 * Static lint of one migration file: every CREATE FUNCTION marked SECURITY
 * DEFINER sets search_path = pg_catalog in its header, and every search_path
 * the file sets (function header, ALTER FUNCTION, SET LOCAL) is exactly pg_catalog.
 */
export function definerMigrationViolations(sql: string): string[] {
  const src = sql.replace(/--[^\n]*/g, "");
  const out: string[] = [];
  const header = /create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(([\s\S]*?)\bas\s+(?:\$\w*\$|')/gi;
  for (const m of src.matchAll(header)) {
    if (!/\bsecurity\s+definer\b/i.test(m[0])) continue;
    const paths = [...m[0].matchAll(SET_PATH)].map((p) => splitPath(p[1]!));
    if (paths.length === 0 || !paths.every(isPinned)) out.push(`${m[1]}: SECURITY DEFINER without set search_path = pg_catalog`);
  }
  for (const m of src.matchAll(SET_PATH)) {
    if (!isPinned(splitPath(m[1]!))) out.push(`search_path set to ${m[1]!.trim()} instead of pg_catalog`);
  }
  return out;
}

export const guardedMigration = (file: string) => migrationNumber(file) >= DEFINER_GUARD_FROM;

/**
 * Runs inside a migration transaction, after the file: raises (and so rolls
 * the migration back) when any SECURITY DEFINER function outside an extension
 * is unpinned and not on the legacy list.
 */
export function definerGuardSql(legacy: readonly string[]): string {
  const list = legacy.length === 0 ? "'{}'::text[]" : `array[\n      ${legacy.map((k) => `'${k.replace(/'/g, "''")}'`).join(",\n      ")}\n    ]::text[]`;
  return `do $definer_guard$
declare bad text;
begin
  select string_agg(k, ', ' order by k) into bad from (
    select n.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' as k
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where p.prosecdef
       and n.nspname not in ('pg_catalog', 'information_schema')
       and not exists (select 1 from pg_catalog.pg_depend d where d.classid = 'pg_catalog.pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
       and not ('search_path=pg_catalog' = any (coalesce(p.proconfig, '{}'::text[])))
  ) x where k <> all (${list});
  if bad is not null then
    raise exception 'SECURITY DEFINER without search_path = pg_catalog: %', bad using errcode = '42501';
  end if;
end $definer_guard$`;
}

/** The guard to run right after `file`: allows the legacy list plus what later migrations still pin. */
export const migrationDefinerGuardSql = (file: string) => definerGuardSql(legacyAllowedAfter(migrationNumber(file)));
