import { copyFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/pos.db";
if (!databaseUrl.startsWith("file:")) {
  throw new Error("Backup drill requires a SQLite file database");
}
const source = resolve(process.cwd(), databaseUrl.slice(5));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = resolve(process.cwd(), "data/backups");
mkdirSync(backupDir, { recursive: true });
const backup = resolve(backupDir, `pos-${stamp}.db`);
const restored = resolve(backupDir, `restore-test-${stamp}.db`);

copyFileSync(source, backup);
const checksum = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

const originalHash = checksum(backup);
copyFileSync(backup, restored);
const restoredHash = checksum(restored);

if (originalHash !== restoredHash) {
  throw new Error("Backup/restore checksum mismatch");
}

console.log(
  `[backup] ${backup} (${statSync(backup).size} bytes, sha256 ${originalHash.slice(0, 12)}…)`,
);
console.log(`[backup] restore drill passed: ${restored}`);
