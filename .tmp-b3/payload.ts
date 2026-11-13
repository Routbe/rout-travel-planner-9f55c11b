import { readFileSync, writeFileSync } from "node:fs";
import { checksumOf, splitSql } from "../scripts/migration-plan";
import { definerMigrationViolations } from "../scripts/security-definer-policy";
const file = "0257_definer_search_path_bookings.sql";
const body = readFileSync(`db/${file}`, "utf8");
if (definerMigrationViolations(body).length) throw new Error("lint");
const count = (expect: number, label: string) => `do $g$ declare n int; begin
  select count(*) into n from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
   where p.prosecdef and s.nspname not in ('pg_catalog', 'information_schema')
     and not exists (select 1 from pg_catalog.pg_depend d where d.classid = 'pg_catalog.pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
     and not ('search_path=pg_catalog' = any (coalesce(p.proconfig, '{}'::text[])));
  if n <> ${expect} then raise exception '${label}: expected ${expect} unpinned SECURITY DEFINER functions, found %', n using errcode = '42501'; end if;
end $g$`;
const stmts = splitSql(body);
const queries = [{ query: count(79, "before"), params: [] }, ...stmts.map((query) => ({ query, params: [] })), { query: count(48, "after"), params: [] },
  { query: "insert into public.schema_migrations (filename, checksum) values ($1, $2)", params: [file, checksumOf(body)] }];
writeFileSync("/tmp/b3/payload.json", JSON.stringify({ queries }));
console.log(stmts.length, checksumOf(body));
