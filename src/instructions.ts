/**
 * Loads and composes activity-specific AI analysis instructions.
 * Combines common.md + activity-type-specific file + optional device file.
 * Falls back gracefully if files are missing.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Map Strava sport types to instruction file names */
function activityTypeToFile(type: string): string {
  const t = (type || "").toLowerCase();
  const compact = t.replace(/[^a-z0-9]/g, "");
  if (["ride", "virtualride", "gravelride", "mountainbikeride", "ebikeride", "handcycle"].some(k => t.includes(k.toLowerCase()))) return "cycling";
  if (["run", "virtualrun", "trailrun"].some(k => t.includes(k.toLowerCase()))) return "running";
  if (["walk", "hike", "hiking"].some(k => t.includes(k.toLowerCase()))) return "walk";
  if (["standuppaddling", "stand up paddling", "sup", "paddle", "paddling"].some(k => t.includes(k) || compact.includes(k.replace(/[^a-z0-9]/g, "")))) return "paddle";
  if (["surf", "windsurf", "kitesurf", "standup"].some(k => t.includes(k.toLowerCase()))) return "surf";
  if (["workout", "weighttraining", "crosstraining", "hiit", "yoga", "pilates", "stretch"].some(k => t.includes(k.toLowerCase()))) return "workout";
  return "workout"; // safe default for unknown indoor types
}

/** Map device name to device instruction file (if known brand detected) */
function deviceToFile(deviceName: string | null | undefined): string | null {
  if (!deviceName) return null;
  const d = deviceName.toLowerCase();
  if (d.includes("garmin") || d.includes("fenix") || d.includes("edge") || d.includes("forerunner") || d.includes("vivoactive")) return "garmin";
  if (d.includes("samsung") || d.includes("galaxy")) return "samsung";
  // Future: apple, wahoo, polar, suunto, coros
  return null;
}

/**
 * Load and compose instruction files for a given activity type and device.
 * instructionsDir = path to the instructions/ folder.
 * activityType = Strava sport_type string (e.g. "Ride", "Run", "Workout").
 * deviceName = optional device string from activity data.
 */
export function loadComposedInstructions(
  instructionsDir: string,
  activityType: string,
  deviceName?: string | null,
): string {
  const parts: string[] = [];

  const commonPath = join(instructionsDir, "common.md");
  const actFile = activityTypeToFile(activityType);
  const actPath = join(instructionsDir, `${actFile}.md`);
  const devFile = deviceToFile(deviceName);
  const devPath = devFile ? join(instructionsDir, "devices", `${devFile}.md`) : null;

  if (existsSync(commonPath)) {
    parts.push(readFileSync(commonPath, "utf-8"));
  }
  if (existsSync(actPath)) {
    parts.push(readFileSync(actPath, "utf-8"));
  }
  if (devPath && existsSync(devPath)) {
    parts.push(readFileSync(devPath, "utf-8"));
  }

  return parts.join("\n\n---\n\n");
}

/** Extract activity type and device name from crunched JSON string */
export function extractActivityMeta(crunchedJson: string): { type: string; device: string | null } {
  try {
    const data = JSON.parse(crunchedJson);
    const type: string = data?.summary_card?.type ?? data?.activity_meta?.type ?? "Workout";
    const device: string | null = data?.summary_card?.device ?? data?.activity_meta?.device ?? null;
    return { type, device };
  } catch {
    return { type: "Workout", device: null };
  }
}


