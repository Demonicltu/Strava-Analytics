import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveBaseDir(importMetaUrl: string): string {
  let dir: string;
  try {
    dir = dirname(fileURLToPath(importMetaUrl));
  } catch {
    return process.cwd();
  }
  return existsSync(join(dir, "..", "package.json")) ? join(dir, "..") : process.cwd();
}

