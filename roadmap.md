# Roadmap

## ROUT Card tap (NTAG 424 DNA) — Batch 1
- [x] db/0245_sdm_tap.sql (EXPAND): fleet MetaRead key, batches, cards by uid_hash, tap attempts, tap grants, RPCs for rout_app only
- [x] sdm-verifier.ts: AN10922 diversification, PICCData decrypt, uid index, constant-time compares + NXP vectors
- [x] sdm-tap.server.ts + vault port methods; PGlite tests as rout_app
- [x] /t public tap page (PICCData only, no card id), "Authentic ROUT Card" badge, replaceState clears query
- [x] schema level 0245, snapshot + db types
## ROUT Card tap — later batches
- [x] Card tap step-up: "ROUT Card" method in the step-up dialog (Web NFC on Android, /t fallback for iPhone and other devices), accepted for card_reveal, card_lifecycle and general sensitive actions
- [x] db/0253 card revoke + 0250 audit fix (EXPAND, live on Neon)
- [x] Blocking or replacing the ROUT card revokes the member's physical cards (db/0253)
- [x] Test on real hardware: Android Chrome NFC scan, iPhone tap via /t, desktop + signed-in phone (owner-tested)
- [x] /t asks "Ja, ik bevestig" before a tap completes an open card step-up (an unrelated tap can no longer approve a request from another session)
- [x] Re-test the /t confirm button on iPhone (changed after the owner's hardware test; owner-confirmed 2026-11-13)
- [x] Admin batch screen (/admin/cards): create, station config export, manifest import; member activation (db/0246, live on Neon)

## Developer console
- [x] Billing page: plan without billing account, live limits from the enforced rules, fair use + link to API terms (nl/en/fr/de)

## Auth
- [x] Passkey-only registration enforced server-side (user.create hook + bridge refuses members without a passkey)

## Workspace Studio
- [x] New profile photo does not save in Workspace Studio: Studio uploads as workspace-logo, /api/public/avatar reads via rout_public_avatar (db/0251 live on Neon, public read verified)
- [x] Workspace logos: prune keeps every photo still in use (db/0252 rout_prune_avatar_uploads, live on Neon)
- [x] Workspace conversion: workspaces.avatar_url set from the live design's photo (conversionWorkspaceLogo)
- [ ] Converted workspace logo stored in the Neon fallback still belongs to the retired login (cascade on a hard user delete); copy it into the workspace owner's uploads if hard deletes are ever enabled
- [x] "ROUT OS v2.5 Alle systemen operationeel" overlaps bottom preview buttons on phone; check similar overlaps

- [x] 0247 hardening (live on Neon, verified): constant-time activation-hash compare, SERIALIZABLE + retry for consume/activate, deny-all RLS on vault_enclave (review before apply)
- [x] Station file v2: correct NDEF offsets, encrypted UID+counter, ChangeFileSettings payload
- [x] Key delivery to the personalisation station: HPKE P-256 sealed bundle (0248 live)
- [x] Station registry (0248) + HPKE-wrapped batch key export on /admin/cards, logged via mark_sdm_batch_exported
- [x] db/0249 (drop station-less export marker) moved into db/ after production reported 0248
- [x] db/0250 card tap as step-up factor (EXPAND, live on Neon)

## Admin portal and Studio routing
- [x] Admin portal refuses non-admins in the UI itself (adminAccessDecision + AdminForbidden screen, nl/en/fr/de); server checks unchanged
- [x] /studio/booking lands on the bookings page: /studio accepts page=booking (src/lib/studio-page-param.ts) and Studio opens bookings from that routed value
- [ ] Signed-in click-through of the admin refusal screen and the bookings page: owner verifies on the Vercel deploy (no DATABASE_URL requested for the preview)

## Migratie-synchronisatie (2026-11-13)
- [x] Stap 1a: alleen-lezen analyse van 95/0169/0209/91 (verslag aan eigenaar)
- [x] Stap 1b: archief in db-archive/, erkende vingerafdrukken in scripts/migration-history-allowlist.ts, controle scripts/migration-history-check.ts (Neon: 251 rijen, 0 afwijkingen)
- [x] 0254: rout_pairwise_register op search_path = pg_catalog (live op Neon, gecontroleerd)
- [x] Afdwinging SECURITY DEFINER search_path: krimpende overgangslijst, lint + bewaking in beide runners vanaf 0255, test op snapshot, live controle (scripts/security-definer-check.ts)
- [x] Batch 1 — kaarten, kluis, inloggen: 21 functies (db/0255, live op Neon, 0 afwijkingen)
- [x] Batch 2 — werkruimtes, ouders, agent-sandbox: 36 functies (db/0256, live op Neon, 0 afwijkingen; 79 over)
- [ ] Batch 3 — boekingen (37 functies met public, pg_temp)
- [ ] Batch 4 — publieke profielen, korte links, Q&A en overige, 42 functies (tot de overgangslijst leeg is)
- [x] Briefing in appendix van docs/HANDOVER.md (bijlage B letterlijk, bijlage C controle)
- [x] QA-testdraaiboek: docs/ROUT-QA-draaiboek.md (kopie in Files)
- [x] /t-schermen en knoppen in nl/en/fr/de (cardTap.* in interface-bundels); zegel "Authentic ROUT Card" blijft bewust Engels
- [ ] QA-draaiboek uitvoeren op het Vercel-deploy — eigenaar, met fysieke kaarten en toestellen
