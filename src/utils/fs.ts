import {
  access,
  mkdir,
  readdir,
  writeFile,
  constants,
} from "node:fs/promises";
import { dirname, join } from "node:path";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function writeFileSafe(
  filePath: string,
  content: string,
  force: boolean,
): Promise<"created" | "skipped" | "overwritten"> {
  const exists = await pathExists(filePath);
  if (exists && !force) {
    return "skipped";
  }
  await ensureDir(dirname(filePath));
  await writeFile(filePath, content, "utf8");
  return exists ? "overwritten" : "created";
}

export async function isDirectoryEmpty(dir: string): Promise<boolean> {
  if (!(await pathExists(dir))) {
    return true;
  }
  const entries = await readdir(dir);
  // Ignore common noise
  const ignored = new Set([".DS_Store", "Thumbs.db"]);
  return entries.every((e) => ignored.has(e));
}

export function resolveTargetDir(directory: string): string {
  return join(process.cwd(), directory === "." ? "." : directory);
}
