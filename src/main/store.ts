import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SiteSession } from "../shared/model.js";

export interface PersistedTabs {
  tabs: { sessionId: string | null; url: string }[];
  activeIndex: number;
}

function dataDir(): string {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson<T>(file: string, fallback: T): T {
  const path = join(dataDir(), file);
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown): void {
  const path = join(dataDir(), file);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, path);
}

export function loadSessions(): SiteSession[] {
  return readJson<SiteSession[]>("sessions.json", []);
}

export function saveSessions(sessions: SiteSession[]): void {
  writeJson("sessions.json", sessions);
}

export function loadTabs(): PersistedTabs | null {
  return readJson<PersistedTabs | null>("tabs.json", null);
}

export function saveTabs(tabs: PersistedTabs): void {
  writeJson("tabs.json", tabs);
}
