import { readFileSync } from "node:fs";
import { definerMigrationViolations } from "../scripts/security-definer-policy";
import { splitSql } from "../scripts/migration-plan";
const b = readFileSync("db/0257_definer_search_path_bookings.sql", "utf8");
console.log(definerMigrationViolations(b), splitSql(b).length);
