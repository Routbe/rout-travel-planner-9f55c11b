ROUT — Technisch Overdrachtsdossier & Architectuur-Invariants

> Instructie voor de overnemende engineer / AI:
> ROUT is een soevereine identiteits-, betaal- en hardware-beveiligingsstack (met fysieke NTAG 424 DNA NFC-kaarten, post-quantum/HPKE encryptie, passkey-only authenticatie en zero-trust database RLS).
> Ga hier nooit lichtzinnig mee om: geen snelle hacks, geen RLS uitschakelen, geen plaintext tokens in logs of URL’s, geen security definer functies schrijven zonder `SET search_path = pg_catalog`, en breek nooit de encryptie- of rollen-grenzen. Lees altijd eerst de `AGENTS.md` bestanden in de relevante mappen (`src/lib/`, `src/lib/wallet/`, `src/components/dashboard/`, etc.) voordat je code aanraakt.

---

1. Technologische Stack & Kerninfrastructuur

- Frontend & Fullstack Framework: TanStack Start v1 (React 19, Vite 7) getarget op Edge runtimes (Cloudflare Workers / workerd compatibel).
- Styling: Tailwind CSS v4 via `src/styles.css` met semantische design tokens (geen hardcoded hex-kleuren).
- Authenticatie: Better Auth gekoppeld via Kysely adapter met strikte passkey-only hooks.
- Database: Neon Postgres (serverless).
  - Runtime verbinding: strikt via de rol `rout_app` (geen superuser, geen BYPASSRLS). Elke batch/transactie draait onder `set local role rout_app`.
  - Migratiemodel: opeenvolgende SQL-migraties in `db/`.
  - Huidig schemaniveau: `0253` (bevestigd via `src/lib/schema-version.ts` en de `/api/public/health` probe).
- Kluis & Encryptie: `vault_enclave` Postgres-schema. Tabellen hebben een strikt `deny_all` RLS-beleid; de app bereikt de kluis enkel via SECURITY DEFINER RPC’s.
- Standalone Daemon: `worker/` (Omni daemon voor Bun/Linux met Sharp/FFmpeg/persistent LISTEN). Nooit importeren in TanStack routes of serverfuncties.

---

2. Wat is er recent gerealiseerd & hersteld?

A. ROUT Card Hardware MFA (NFC Step-Up via NTAG 424 DNA)
Fysieke metalen ROUT Cards zijn voorzien van NXP NTAG 424 DNA chips met Secure Dynamic Messaging (SDM).
1. Cryptografische verificatie (`src/lib/vault/sdm-verifier.ts`):
   - AN10922 sleuteldiversificatie met AES-128.
   - Decryptie van `PICCData` (UID + strictly rising tap counter) en CMAC-verificatie in constant-time vergelijking (`ct_equal_32`).
   - Anti-replay: elke tik vereist een strikt hogere teller dan de vorige geregistreerde tik.
2. Step-Up methode `"card"` (`src/lib/auth/card-step-up.*`):
   - Geaccepteerd voor gevoelige kaartacties (`card_reveal`, `card_lifecycle`) en algemene accountbeveiliging.
   - Android: Direct scannen in de `StepUpDialog` via de Web NFC API (`NDEFReader`).
   - iPhone & Desktop fallback via `/t`: De iPhone tikt de kaart en opent `https://rout.be/t?p=<PICCData>&m=<CMAC>`.
3. Kritieke Security-vondst & Fix (Migratie 0253):
   - In migratie `0250` ontbraken de audit-acties voor card step-up in de check-constraint van `vault_enclave.audit_log`, waardoor kaartbevestigingen crashten. Dit is opgelost in `db/0253_card_revoke.sql`.
   - Fysieke chip intrekking bij verlies: Als een kaart wordt geblokkeerd of vervangen (`blockMyCard` / `replaceMyCard`), roept de server `vault_enclave.revoke_member_cards()` aan. Alle fysieke NTAG-chips van die gebruiker worden onmiddellijk ingetrokken (`revoked_at = NOW()`) en openstaande step-up intents vervallen. Een gestolen of verloren kaart kan dus nooit meer iets goedkeuren.
4. Anti-Session-Hijack op `/t` (Expliciete Bevestiging):
   - Als een ingelogde gebruiker `/t` opent terwijl er een open step-up intentie is, wordt de intentie niet blind goedgekeurd.
   - De pagina toont expliciet: "Bevestigen met je ROUT Card? Een venster op je computer of telefoon vraagt om bevestiging." met twee knoppen: [Ja, ik bevestig] en [Nee, dit was ik niet]. Pas na een actieve klik wordt de step-up voltooid.

B. Passkey-Only Registratie
- Geen wachtwoorden mogelijk voor nieuwe registraties.
- Afgedwongen via `runPasskeyAccountCreation` in `src/lib/auth/account-creation-scope.ts` en de `user.create.before` hook in `better-auth.server.ts`. Pogingen om buiten de passkey-flow accounts aan te maken worden hard geweigerd.

C. Workspace Studio & Avatar Storage
- Migratie 0251 (`rout_public_avatar`): Publieke leesrechten voor profiel- en workspace-logo's hersteld.
- Migratie 0252 (`rout_prune_avatar_uploads`): Voorkomt dat actieve logo’s van profielen, drafts, workspaces of apps per ongeluk gewist worden tijdens opruimacties.
- Workspace-conversie: `conversionWorkspaceLogo` zet het logo van het live design direct over naar `workspaces.avatar_url`.

D. Ontwikkelaarsconsole — Facturatie & Limieten
- De facturatiepagina (`/console/billing`) is ontdaan van neppe betaalstromen: er is momenteel geen facturatieaccount vereist.
- Live limieten en fair-use voorwaarden worden transparant getoond en zijn vertaald in alle 4 de ondersteunde talen (`nl`, `en`, `fr`, `de`).

---

3. Strikte Architectuur- en Veiligheidsregels (Invariants)

1. Database & RLS Rollen:
   - Nooit queries uitvoeren als superuser in applicatielogica.
   - Migraties volgen het EXPAND / CONTRACT patroon. CONTRACT migraties die oude rechten weghalen moeten in `db-pending/` wachten tot productie de EXPAND migratie draait.
   - `CODE_SCHEMA_LEVEL` in `src/lib/schema-version.ts` moet altijd exact gelijk zijn aan het hoogste migratienummer in `db/`.
2. Kluisgeheimen & Hardware Tokens:
   - Raw tokens verlaten de database nooit in plaintext; ze reizen alleen als opaque refs (`csu_...`, `vtk_...`, `sdm_...`).
   - Private keys en master keys worden in de browser uitsluitend beheerd binnen de Web Worker Crypto Enclave (`src/lib/crypto-enclave/`), nooit op de React UI-thread.
   - Buffers met plaintext of sleutels moeten in `finally`-blokken altijd met nullen worden overschreven (zero-fill).
3. URL & Adresbalk Hygiëne:
   - Bij het openen van `/t?p=...&m=...` wist `history.replaceState` onmiddellijk de query-parameters uit de browsergeschiedenis.
4. Vertalingen:
   - Alle UI-teksten moeten synchroon worden bijgewerkt in `src/locales/pages/interface.nl.json`, `.en.json`, `.fr.json` en `.de.json`.

---

4. Wat moet er nu nog gebeuren? (Openstaande Punten)

1. Fysieke hertest van de bevestigingsknop op iOS:
   - De knop "Ja, ik bevestig" op de `/t` pagina is toegevoegd naar aanleiding van de security-verstrakking.
   - Testscenario: Start op desktop een gevoelige actie (bijv. kaart ontgrendelen of bevriezen) -> kies "ROUT Card" -> tik met iPhone de kaart tegen de achterkant -> Safari opent `/t` -> druk op "Ja, ik bevestig" -> controleer of het venster op desktop direct doorloopt en ontgrendelt.
2. Workspace Logo Cascade Edge-Case (Documentatie / Toekomstig):
   - Als een persoonlijk account wordt omgezet naar een workspace en de foto staat in de Neon fallback-tabel, blijft de upload foreign-key gekoppeld aan de oorspronkelijke gebruiker. Als er in de toekomst een harde account-verwijdering ("Purge account") wordt gebouwd, moet dit bestand eerst overgedragen worden aan de workspace owner om cascade-deletie te voorkomen.
3. Optionele Externe Integraties (Momenteel bewust leeg gelaten):
   - Zodra de eigenaar live wil gaan met externe diensten, moeten de volgende geheimen in de omgevingsvariabelen geconfigureerd worden:
     - Stripe (voor PSP/donaties en eventuele betaalde plannen).
     - Scaleway S3 Object Storage (voor cloud buckets; momenteel vangt Neon uploads op).
     - Apple Developer Certificaten (voor Apple VAS / NFC Wallet kaarten).
     - Google Wallet API service account (voor Google Smart Tap & Loyalty kaarten).

---

5. Handige Commando's voor Verificatie

- Tests draaien:
  ```bash
  bun test
  bunx vitest run src/test/card-step-up.test.ts src/test/sdm-tap.test.ts src/test/schema-version.test.ts
  ```
- Schema snapshot & catalogus bijwerken:
  ```bash
  bun scripts/schema-replay-snapshot.ts
  ```
- Gezondheidsstatus controleren:
  Inspecteer `http://localhost:8080/api/public/health`. Dit moet `status: "operational"` en `schema_level: "0253"` teruggeven.

---

Bijlage — controle tegen de code (2026-11-13; de tekst hierboven is ongewijzigd overgenomen)

- De SDM-verifier staat in `src/lib/crypto-enclave/sdm-verifier.ts` (niet `src/lib/vault/`).
- De audit-tabel heet `vault_enclave.audit_logs` (constraint `audit_logs_action_check`).
- `bun test` start de testrunner van Bun; de projectsuite draait met Vitest via `bun run test` (`vitest run`).
- Openstaand punt 1 (iOS-hertest van "Ja, ik bevestig" op `/t`): door de eigenaar bevestigd als werkend op 2026-11-13.
- Neon op 2026-11-13: `public.schema_migrations` bevat alles t/m 0253. Twee geregistreerde bestanden bestaan niet meer in `db/` (`95_question_stories.sql`, `0169_workspace_icon.sql`) en twee bestanden wijken af van hun geregistreerde checksum (`0209_recovery_vault_pairwise.sql`, `91_shadowban.sql`).
- Gezondheidsstatus: `/api/public/health` geeft het veld `schema` terug (niet `schema_level`), naast `status` en `latency_ms`.

---

Bijlage B — tweede briefing van de eigenaar (2026-11-13, letterlijk overgenomen)

Wat je hierna kunt doen, hangt af van je planning. Hier is een overzicht van de logische volgende stappen en openstaande onderdelen die we bewust hadden geparkeerd:

1. Fysieke Praktijktests (E2E)

Nu alles live staat op Vercel en Neon, is het tijd om de theorie in de praktijk te brengen:

NFC-taps testen: Voer een echte test uit met je fysieke NXP NTAG 424 DNA kaarten op een Android-toestel en via de /t fallback-route op een iPhone (inclusief de nieuwe "Ja, ik bevestig" / "Nee, dit was ik niet" knoppen).

Account-flows controleren: Loop op je eigen Vercel-omgeving een volledige registratie (met passkey) en inlogcyclus door.

2. Externe Diensten & Commerciële Integratie (Toekomstige Fase)

Zoals eerder afgesproken, waren deze diensten even geparkeerd tot de core stabiel was. Zodra je toe bent aan een bredere of commerciële uitrol, kun je deze toevoegen:

Stripe: Voor het verwerken van betalingen en abonnementen.

Scaleway: Voor object-storage (zoals grotere media-bestanden en foto's).

Apple & Google Wallet: Het genereren en integreren van digitale kluispassen.

Externe OAuth: Het inschakelen van optionele inlogopties zoals Google, GitHub of Apple ID (naast de primaire passkeys).

3. Productie-monitoring & Onderhoud

Het in de gaten houden van de Vercel-builds en de prestaties van de rout_app-functies in Neon naarmate je meer gebruikers of kaarten activeert.

# MASTER HANDOVER & PROJECT BRIEFING: ROUT (Sovereign Identity OS)

## 1. Project Context & Doel

Je werkt aan **ROUT** (rout.be), een open-source (AGPL-3.0) *Sovereign Digital Identity OS*. Het platform biedt één verenigde identiteit met profielen, werkruimtes, QR-studio, korte links met analytics, agenda's/boekingen, betalingen, een fysieke ROUT Card met NFC-validatie, en een ontwikkelaarsconsole. De core-filosofie is **Zero-Trust, privacy-by-design, passkey-only en Europese data-soevereiniteit**.

## 2. Technische Architectuur & Stack

- **Frontend / Hosting:** Vercel (SPA / SSR met Vites/React, strenge TypeScript typechecks).
- **Database:** Neon PostgreSQL. De app draait **strikt** onder de beperkte rol `rout_app` (nooit als eigenaar/admin). Database-migraties lopen t/m schemaversie **0253**.
- **Authenticatie:** Better Auth met **passkey-only** afgedwongen op serverniveau. Wachtwoorden, e-maillinks of traditionele OAuth-methodes voor registratie zijn uitgeschakeld.
- **Crypto & Vault:** Gevoelige data is versleuteld in een afgeschermde kluis in de database (client-side versleuteling, HPKE/RFC 9180 standaarden). Herstel werkt via een 2-van-3 mechanisme.
- **Hardware / NFC:** Integratie met NXP NTAG 424 DNA kaarten voor hardware-MFA (Step-Up authenticatie) met SDM (Secure Dynamic Messaging), voorzien van een anti-hijacking "Ja/Nee" bevestigingsstap op `/t`.

## 3. Huidige Status & Gerealiseerde Mijlpalen (t/m Migratie 0253)

- **Database & Migraties:** Migraties `0250` t/m `0253` zijn atomair en foutloos doorgevoerd op Neon. Dit omvat de logboek-fixes voor kaarttiks, publieke avatar-leesfuncties (`rout_public_avatar`), en het slim opruimen van logo's (`rout_prune_avatar_uploads`) waarbij actieve werkruimte- en profielfoto's permanent beschermd zijn.
- **Passkey-hardening:** Registratie zonder passkey wordt op serverniveau onherroepelijk geweigerd.
- **NFC Step-Up & Kaartlevenscyclus:** Fysieke kaarttiks dienen als hardware-MFA voor gevoelige acties. Het blokkeren of vervangen van een kaart ("verloren") trekt de fysieke chip direct en cryptografisch in.
- **UI & Routing Security:** De beheeromgeving weigert niet-beheerders direct in de client-interface zelf via `adminAccessDecision` (met meertalige "Geen toegang"-pagina's) en de doorverwijzing van `/studio/booking` werkt feilloos via schone router-parameters (`/studio?page=booking`).

## 4. Belangrijke Regels & Richtlijnen voor de Ontwikkeling

1. **Lees eerst `docs/HANDOVER.md`:** Elke wijziging aan beveiliging, kluis, kaarten, inloggen of migraties vereist dat dit dossier vooraf wordt gerespecteerd.
2. **Database-rechten:** Voer nooit schemawijzigingen uit als de eigenaar als de app (`rout_app`) moet opereren; respecteer de functierechten en RLS.
3. **Geen zwakke crypto of fallbacks:** Behoud de moderne standaarden (passkeys, HPKE, sterke hashing). Geen achterdeurtjes of onbeveiligde fallback-flows.
4. **Meertaligheid:** Alle nieuwe UI-elementen en foutmeldingen moeten direct worden voorzien van vertalingen in het Nederlands, Engels, Frans en Duits.

---

Bijlage C — controle van bijlage B tegen code en Neon (2026-11-13; bijlage B is ongewijzigd overgenomen)

- Schemaversie: Neon en de code staan nu op **0254** (`0254_pairwise_register_search_path.sql`), niet 0253.
- Inloggen versus registreren: het aanmaken van een account kan alleen met een passkey (`runPasskeyAccountCreation`; de `user.create.before`-hook weigert elke andere weg). Google, GitHub, GitLab en Apple staan al in `src/lib/better-auth.server.ts` als **inlogmethode** met `disableSignUp: true`; ze worden actief zodra hun sleutels in de omgeving staan. Ook e-mail + wachtwoord en magic link bestaan als inlogmethode, met registratie uit. "Externe OAuth inschakelen" betekent dus: sleutels zetten voor inloggen of koppelen op een bestaand account, nooit een nieuwe registratieweg.
- Regel 2 (database-rechten) betekent in de praktijk: schemawijzigingen lopen alleen als eigenaar via de migratierunners of de beoordeelde agent-verbinding; de app zelf draait alleen als `rout_app`, die geen objecten in `public` en geen tijdelijke tabellen mag aanmaken (gecontroleerd in Neon op 2026-11-13).
- Migratiegeschiedenis (stap 1b, uitgevoerd 2026-11-13): de vier afwijkingen (`95_question_stories.sql`, `0169_workspace_icon.sql`, `0209_recovery_vault_pairwise.sql`, `91_shadowban.sql`) staan met hun exacte Neon-vingerafdruk in `scripts/migration-history-allowlist.ts`; de twee verdwenen bestanden zijn uitgelegd in `db-archive/`. `bun scripts/migration-history-check.ts` vergelijkt elke rij in `public.schema_migrations` met `db/` en die lijst: 251 rijen, 0 afwijkingen na 0254. Geen enkele vingerafdruk in Neon is overschreven.
- 0254: `public.rout_pairwise_register` draait nu met `search_path = pg_catalog` (live gecontroleerd: eigenaar `neondb_owner`, EXECUTE alleen voor `rout_app`, definitie gelijk aan `db/schema.snapshot.json`).
- Open bevinding: in Neon draaien nog **136 andere SECURITY DEFINER-functies** in `public` zonder `search_path = pg_catalog` (88 met `public`, 37 met `public, pg_temp`, 11 met `pg_catalog, public`). Ze breken de regel uit dit dossier. Het directe risico is klein omdat `rout_app` geen objecten in `public` en geen tijdelijke tabellen kan aanmaken, maar ze moeten in beoordeelde batches worden herschreven (zie `roadmap.md`).

---

Bijlage D — SECURITY DEFINER-hardening en `/t` in vier talen (2026-11-13; de tekst hierboven is ongewijzigd overgenomen)

- Batch 1 (kaarten, kluis, inloggen): `db/0255_definer_search_path_cards_vault_auth.sql` zet 21 functies op `search_path = pg_catalog` met `ALTER FUNCTION ... SET`, zodat body, eigenaar en rechten exact blijven: `rout_card_*` (6), `rout_hw_*` (3), `rout_pair_factory_card`, `rout_physical_key_audit`, `rout_ephemeral_vault_*` (3) + `rout_purge_expired_ephemeral_vaults`, `signin_guard_status/record`, `rout_resolve_account`, `email_freeze_owner`, `delete_account`, `handle_new_user`. De triggerfunctie `rout_physical_key_audit` verloor daarbij haar overbodige PUBLIC-uitvoerrecht. Vooraf gecontroleerd: live definities waren gelijk aan de code en elke body noemde zijn tabellen al met schema.
- Live op Neon toegepast in één transactie (met telcontrole en logboekregel). Daarna: 348 SECURITY DEFINER-functies, 233 op `pg_catalog`, nog 115 op de overgangslijst, 0 afwijkingen; `schema_migrations` 252 rijen, 0 afwijkingen; schemaniveau `0255`.
- Afdwinging: `scripts/security-definer-legacy.ts` (de krimpende lijst), `scripts/security-definer-policy.ts` (één regel), beide migratierunners (lint + bewaking binnen de transactie vanaf 0255), `src/test/security-definer-search-path.test.ts` (snapshot, lint, bewaking, en de 21 functies echt uitgevoerd na het afspelen van alle migraties) en `bun scripts/security-definer-check.ts` (live).
- Volgende batches, in deze volgorde: werkruimtes, ouders en agent-sandbox; boekingen (37 functies met `public, pg_temp`); daarna publieke profielen, korte links, Q&A en overige. `vault_enclave` had al geen uitzonderingen.
- `/t` toont alle schermen en knoppen in de taal van de bezoeker (nl/en/fr/de, sleutels `cardTap.*` in `src/locales/pages/interface.*.json`). Alleen het zegel "Authentic ROUT Card · Cryptographically Verified" blijft bewust Engels.

---

Bijlage E — SECURITY DEFINER-hardening batch 2 (2026-11-13; de tekst hierboven is ongewijzigd overgenomen)

- Batch 2 (werkruimtes, ouderlijke toestemming, agent-sandbox en agent-werkruimtes): `db/0256_definer_search_path_workspaces_parents_agents.sql` zet 36 functies op `search_path = pg_catalog` met alleen `ALTER FUNCTION ... SET`. Werkruimtes (14): `rout_is_workspace_member`, `rout_workspace_role`, `rout_workspace_team`, `rout_accept_workspace_invites`, `rout_transfer_by_token`, `rout_transfers_for_email`, `workspace_may_drop_suffix`, `rout_public_workspace`, `rout_public_workspace_relme`, `rout_workspace_atproto_did`, `rout_workspace_slug_for_domain`, `rout_workspace_slug_taken`, `workspace_slug_for_root_alias`, `rout_migrated_workspace_for_handle`. Ouders (7): `rout_record_signup_age`, `rout_user_is_minor`, `rout_parent_lookup`, `rout_parent_approve_consent`, `rout_parent_set_qa_level`, `rout_parent_request_payment`, `rout_parent_mark_payment`. Agent-sandbox (7): `rout_agent_sandbox_register/context/provision/patch_draft/set_apps/state`, `rout_purge_expired_agent_sandboxes`. Agent-werkruimtes (8): `rout_agent_provision_workspace`, `rout_agent_claim_preview`, `rout_claim_agent_workspace` (+ `_v2`), `rout_agent_audit_log`, `rout_agent_audit_mark_reverted`, `rout_agent_audit_revert_workspace`, `rout_purge_unclaimed_agent_workspaces`.
- Vooraf gecontroleerd: live definities, eigenaar (`neondb_owner`) en rechten (EXECUTE alleen `rout_app`) waren byte-gelijk aan de code; elke body noemt tabellen, types en hulpfuncties met schema. Ook de triggers die bij deze schrijfacties meelopen (ook via cascades vanaf `workspaces`) zijn nagelopen: de triggers zonder eigen zoekpad (`touch_updated_at`, `reserve_recovery_email`, de handle-guards) noemen hun tabellen eveneens met schema. Geen van de geraakte tabellen dwingt RLS af voor de eigenaar.
- Test: na het afspelen van alle migraties draait elke functie van batch 2 haar normale pad met echte testgegevens (sandbox aanmaken tot claimen, auditlog, opruimen met cascades, uitnodiging accepteren, publieke opzoekingen, minderjarige registreren tot ouderlijke betaling); elke stap moet slagen.
- Correctie op de bewaking uit bijlage D: een lege database speelt 0255 af vóór 0256, dus de bewaking na migratie N staat nu ook toe wat een latere migratie nog vastzet (`HARDENED_BY_MIGRATION` + `legacyAllowedAfter` in `scripts/security-definer-legacy.ts`). Een test koppelt elke groep aan precies de functies die haar migratie aanpast. Op de eindtoestand blijft de lijst gewoon krimpen.
- Live op Neon toegepast in één transactie, met een telcontrole vooraf (115 open) en achteraf (79 open) en de logboekregel. Daarna: de 79 open functies zijn exact de overgangslijst, de 36 functies zijn gelijk aan de nieuwe schemakopie met ongewijzigde eigenaar en rechten; `schema_migrations` 253 rijen, 0 afwijkingen; schemaniveau `0256`.
- Volgende batches: boekingen (37 functies), daarna publieke profielen, korte links, Q&A en overige (42).

---

Bijlage F — SECURITY DEFINER-hardening batch 3 (2026-11-13; de tekst hierboven is ongewijzigd overgenomen)

- Batch 3 (boekingen): `db/0257_definer_search_path_bookings.sql` zet 31 functies (`rout_booking_*` e.a.) op `search_path = pg_catalog`. `rout_booking_hold` roept nu expliciet `public.gen_random_bytes()` aan; `rout_booking_zone` leest `pg_catalog.pg_timezone_names`.
- Live op Neon (gecontroleerd 2026-11-13): `schema_migrations` 254 rijen, hoogste `0257`; 348 SECURITY DEFINER-functies, 300 op `pg_catalog`, 48 open (exact de overgangslijst). Alle 229 tabellen/views in Neon zijn gelijk aan `db/schema.snapshot.json` (alleen `schema_migrations` zelf staat er niet in). Schemaniveau code en Neon: `0257`.
- `rout_app` en PUBLIC hebben geen TEMP-recht en `rout_app` mag niets aanmaken in `public` (live gecontroleerd).
- Tijdelijke batch-3-scripts (`.tmp-b3/`) verwijderd. Volledige suite: 466 testbestanden, 2784 tests geslaagd.
- Volgende stap: beslissing over `pg_catalog, pg_temp`, daarna batch 4 (48 functies, `db/0258`).

---

Bijlage G — batch 4 en het pg_temp-beleid (2026-11-13; de tekst hierboven is ongewijzigd overgenomen)

- Besluit van de eigenaar: elke SECURITY DEFINER-functie draait met `search_path = pg_catalog, pg_temp`. Met alleen `pg_catalog` doorzoekt Postgres het tijdelijke schema van de aanroeper eerst; door `pg_temp` achteraan te noemen blijft dat dicht, ook als TEMP ooit per ongeluk wordt toegekend. Dit vervangt in de regels hierboven elke vermelding van "alleen `pg_catalog`".
- `db/0258_definer_search_path_rest_and_pg_temp.sql`: alleen `ALTER FUNCTION ... SET`, voor alle 348 functies: batch 4 (de laatste 48: profielen/handles, feedback/events, korte links/QR, Q&A, abonnees, protocol, PoW, presence, wallet en overige) plus `pg_temp` achteraan bij de 300 die al op `pg_catalog` stonden. `execute_account_merge` is eigendom van `rout_merge_executor`; de migratie leent die rol alleen voor die ene regel en geeft hem terug, zoals 0215 en 0242.
- Vooraf gecontroleerd: de bodies van de 48 noemen elke tabel, functie en type met schema; live definities gelijk aan de schemakopie (alleen `rout_pow_spend` heeft op Neon dezelfde body met samengevoegde regeleinden).
- Afdwinging: `scripts/security-definer-policy.ts` accepteert vanaf migratie 0258 alleen `pg_catalog, pg_temp` (0255-0257 mogen in de replay nog de oude vorm hebben); `LEGACY_DEFINER_SEARCH_PATH` is leeg, batch 4 staat onder `HARDENED_BY_MIGRATION[258]`. Test: na het afspelen van alle migraties verandert 0258 niets dan de zoekpad-regel, en de 46 niet-trigger-functies van batch 4 worden aangeroepen zonder een onopgeloste naam.
- Live op Neon toegepast in één transactie met telcontrole vooraf (348 functies, 48 open) en achteraf (0 open), plus de logboekregel. Daarna: 348 functies op `pg_catalog, pg_temp`, eigenaars en uitvoerrechten ongewijzigd, rollidmaatschappen ongewijzigd, `schema_migrations` 255 rijen, schemaniveau `0258`. Proefaanroepen als `rout_app` (alleen lezen) slaagden.
- Volledige suite: 466 testbestanden, 2786 tests geslaagd.

---

Bijlage H — nacontrole na 0258 en de rechtencorrectie 0259 (2026-11-13)

- Nacontrole groep 3 (open punt uit de vorige sessie): de 33 `rout_booking_*`-functies op Neon hebben dezelfde inhoud als de schemakopie en dezelfde eigenaar en uitvoerrechten als een volledige herbouw uit `db/`. `rout_booking_hold` en `rout_booking_zone` hebben hun rechten behouden.
- Migratiegeschiedenis: `bun scripts/migration-history-check.ts --applied=<Neon-rijen>` meldt 255 toegepaste migraties en 0 afwijkingen.
- Productie (`https://rout.be/api/public/health`) meldt schemaniveau `0253`. 0254-0258 veranderen alleen zoekpaden en zijn verenigbaar met die code.
- Bevinding: Neon's standaardrechten (db/53, deel 5) geven `rout_app` EXECUTE op elke nieuwe functie. Interne hulpfuncties waarvan de migratie alleen PUBLIC introk, zijn daardoor op Neon rechtstreeks aanroepbaar door de app-rol: `rout_audit_insert` (beheerderslog schrijven met een willekeurig beheerders-id), `rout_phone_mark_verified` (een nummer verifiëren zonder code), `rout_psp_public_owner`, `rout_qa_owner`, `feedback_form_is_public`, `profile_event_is_public` en de trigger `rout_physical_key_audit`. Daarnaast had `execute_account_merge` op Neon weer EXECUTE voor PUBLIC, wat 0152 had ingetrokken. Geen app-code (ook niet de productieversie op niveau 0253) roept deze hulpfuncties aan; ze worden alleen aangeroepen vanuit SECURITY DEFINER-ingangen of als trigger.
- `db/0259_definer_execute_least_privilege.sql` trekt die rechten in en controleert dat binnen de transactie; `rout_app` houdt `execute_account_merge` en `workspace_may_drop_suffix` (die laatste wordt door invoker-triggers aangeroepen). Test: `src/test/definer-execute-grants.test.ts`.
- Nog open: bij een herbouw uit `db/` krijgen 20 SECURITY DEFINER-functies EXECUTE voor PUBLIC waar Neon dat niet heeft, en `workspace_may_drop_suffix` mist er EXECUTE voor `rout_app`. Neon zelf is daar strenger; een herbouwde database niet.
