import { replayed } from "./replaylib";
import { readFileSync } from "node:fs";
const db = await replayed(["0257_definer_search_path_bookings.sql"]);
const defs = async () => new Map(((await db.query(`select p.oid::regprocedure::text k, pg_get_functiondef(p.oid) d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'rout_booking_%'`)).rows as any[]).map(r => [r.k, r.d]));
const before = await defs();
await db.exec(`begin;\n${readFileSync("db/0257_definer_search_path_bookings.sql", "utf8")}\n;commit;`);
const after = await defs();
const norm = (d: string) => d.replace(/^ SET search_path TO .*$/m, "").replace("public.gen_random_bytes(", "gen_random_bytes(").replaceAll("pg_catalog.pg_timezone_names", "pg_timezone_names");
let changed = 0; for (const [k, d] of before) { if (norm(d) !== norm(after.get(k)!)) { changed++; console.log("BODY DIFF", k); } }
console.log("functions", before.size, "body diffs", changed);
const A = "00000000-0000-4000-8000-0000000000b1", T = "00000000-0000-4000-8000-0000000000b2", P = "00000000-0000-4000-8000-0000000000b3";
const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const bits = "0".repeat(32) + "1".repeat(40) + "0".repeat(24);
const steps: [string, ...unknown[]][] = [
  ["insert into public.users (id, email) values ($1, 'host@example.test')", A],
  ["insert into public.profiles (id, username, display_name) values ($1, 'hosty', 'Host') on conflict (id) do update set username = 'hosty'", A],
  ["insert into public.booking_event_types (id, user_id, slug, title, duration_minutes, minimum_notice_hours, max_days_ahead) values ($1, $2, 'intro', 'Intro', 30, 0, 30)", T, A],
  ["insert into public.booking_event_types (id, user_id, slug, title, duration_minutes, minimum_notice_hours, max_days_ahead, price_cents, currency) values ($1, $2, 'paid', 'Paid', 30, 0, 30, 1000, 'eur')", P, A],
  ["insert into public.booking_event_type_hosts (event_type_id, user_id) values ($1, $3), ($2, $3)", T, P, A],
  ["insert into public.availability_cache (user_id, day, free_bits) values ($1, $2::date, $3::bit(96))", A, day, bits],
  ["select public.rout_booking_public_event_type($1) as v", T],
  ["select * from public.rout_booking_public_type_for_handle('hosty', null)"],
  ["select * from public.rout_booking_public_days($1, current_date, current_date + 10)", T],
  ["select * from public.rout_booking_public_sessions($1, now(), now() + interval '7 days', null)", T],
  ["select * from public.rout_booking_public_constraints($1, now(), now() + interval '7 days', null)", T],
  ["select public.rout_booking_stale_hosts($1, interval '1 hour')", T],
  [`select public.rout_booking_hold($1, '${day}T10:00:00Z', repeat('a', 64), null, null) as v`, T],
  [`select public.rout_booking_create($1, '${day}T10:00:00Z', 'Ann', 'ann@example.test', 'Europe/Brussels', null, null, (select hold_id from public.booking_holds limit 1), null) as v`, T],
  [`select public.rout_booking_create($1, '${day}T12:00:00Z', 'Bo', 'bo@example.test', 'Europe/Brussels', null, null) as v`, T],
  [`select public.rout_booking_create($1, '${day}T14:00:00Z', 'Cy', 'cy@example.test', 'Europe/Brussels', null, null) as v`, P],
  ["select public.rout_booking_set_checkout((select id from public.bookings where status = 'pending_payment' limit 1), 'cs_test_12345678') as v"],
  ["select public.rout_booking_confirm_paid((select id from public.bookings where stripe_checkout_session_id = 'cs_test_12345678'), 'cs_test_12345678') as v"],
  ["select public.rout_booking_guest_view(b.id, b.booking_token) as v from public.bookings b where b.guest_name = 'Bo'"],
  [`select public.rout_booking_hold($1, '${day}T16:00:00Z', repeat('b', 64), null, null) as v`, T],
  ["select public.rout_booking_hold_release((select hold_id from public.booking_holds limit 1), repeat('c', 64)) as v"],
  ["select public.rout_booking_release_hold((select id from public.bookings where guest_name = 'Bo')) as v"],
  ["select public.rout_booking_release_expired(10) as v"],
  ["select * from public.rout_booking_due_calendars(10)"],
];
await db.exec("begin");
for (const [sql, ...p] of steps) {
  try { const r = await db.query(sql, p); console.log("OK ", sql.slice(0, 70), JSON.stringify(r.rows).slice(0, 200)); }
  catch (e: any) { console.log("ERR", sql.slice(0, 90), e.code, e.message); break; }
}
await db.exec("rollback");
