/**
 * Update a Strava activity's description and/or private notes.
 *
 * Usage:
 *   npm run update                             → interactive (pick crunched file, preview, confirm)
 *   npx tsx src/update_strava.ts <activity_id>  → direct update for a specific activity
 */
import { createInterface } from "readline";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { loadConfig } from "./config.js";
import { getAccessToken } from "./auth.js";
import { createStravaClient } from "./client.js";
import { buildDescription, buildPrivateNotes } from "./format.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ANALYSIS_DIR = join(__dirname, "..", "analysis");

// ─── Helpers ───

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

// ─── Main ───

async function main() {
  console.log("\n📝 Strava Activity Updater\n");

  // 1. Find crunched files
  if (!existsSync(ANALYSIS_DIR)) { console.error("❌ No analysis/ directory. Run 'npm run crunch' first."); process.exit(1); }
  const crunchedFiles = readdirSync(ANALYSIS_DIR).filter(f => f.endsWith("_crunched.json")).sort().reverse();

  if (crunchedFiles.length === 0) {
    console.error("❌ No crunched files. Run 'npm run crunch' first.");
    process.exit(1);
  }

  console.log("📁 Available pre-analyzed activities:\n");
  for (let i = 0; i < crunchedFiles.length; i++) {
    const name = crunchedFiles[i].replace("activity_", "").replace("_crunched.json", "").replace(/_/g, " ");
    console.log(`  ${i + 1}. ${name}`);
  }

  console.log("");
  const input = await prompt(`👉 Pick activity (1-${crunchedFiles.length}): `);
  const num = parseInt(input, 10);
  if (isNaN(num) || num < 1 || num > crunchedFiles.length) { console.log("❌ Invalid."); process.exit(1); }

  const selectedFile = crunchedFiles[num - 1];
  const filePath = join(ANALYSIS_DIR, selectedFile);
  const crunched = JSON.parse(readFileSync(filePath, "utf-8"));

  // Extract activity ID from filename
  const idMatch = selectedFile.match(/activity_(\d+)/);
  if (!idMatch) { console.error("❌ Can't find activity ID in filename."); process.exit(1); }
  const activityId = idMatch[1];

  // Check if there's a corresponding analysis markdown
  const analysisPath = filePath.replace("_crunched.json", "_analysis.md");
  const analysisExists = existsSync(analysisPath);
  const analysis = analysisExists ? readFileSync(analysisPath, "utf-8") : null;

  // 2. Build description and private notes
  const description = buildDescription(crunched, analysis);
  const privateNotes = buildPrivateNotes(crunched, analysis);

  // 3. Preview
  console.log("\n" + "═".repeat(60));
  console.log("📋 DESCRIPTION (public — full analysis):");
  console.log("─".repeat(60));
  console.log(description);
  console.log("\n" + "═".repeat(60));
  console.log("🔒 PRIVATE NOTES (short tips — mobile-friendly):");
  console.log("─".repeat(60));
  console.log(privateNotes);
  console.log("═".repeat(60));

  console.log(`\n📊 Activity ID: ${activityId}`);
  console.log(`   Description: ${description.length} chars`);
  console.log(`   Private notes: ${privateNotes.length} chars`);

  // 4. Confirm
  console.log("\nWhat would you like to update?");
  console.log("  1. Both description AND private notes");
  console.log("  2. Only description (public)");
  console.log("  3. Only private notes");
  console.log("  q. Cancel");

  const choice = await prompt("\n👉 Choice: ");

  if (choice === "q" || choice === "") {
    console.log("👋 Cancelled.");
    return;
  }

  const updateDescription = choice === "1" || choice === "2";
  const updateNotes = choice === "1" || choice === "3";

  if (!updateDescription && !updateNotes) {
    console.log("❌ Invalid choice.");
    return;
  }

  // 5. Authenticate and update
  console.log("\n🔑 Authenticating with Strava...");
  const config = loadConfig();
  const { accessToken } = await getAccessToken(config.clientId, config.clientSecret, config.refreshToken);
  const client = createStravaClient(accessToken);

  const updateData: any = {};
  if (updateDescription) updateData.description = description;
  if (updateNotes) updateData.private_note = privateNotes;

  console.log(`\n📤 Updating activity ${activityId}...`);

  try {
    const response = await client.put(`/activities/${activityId}`, updateData);
    console.log(`\n✅ Activity updated successfully!`);
    console.log(`   📋 ${response.data.name}`);
    if (updateDescription) console.log(`   ✏️ Description updated (${description.length} chars — full analysis)`);
    if (updateNotes) console.log(`   🔒 Private notes updated (${privateNotes.length} chars — short tips)`);
    console.log(`\n🔗 View on Strava: https://www.strava.com/activities/${activityId}`);
  } catch (err: any) {
    console.error(`\n❌ Failed to update activity: ${err.message}`);
    if (err.response?.data) {
      console.error("   API response:", JSON.stringify(err.response.data, null, 2));
    }
    if (err.response?.status === 401) {
      console.error("\n💡 Your token may not have 'activity:write' scope. Re-authorize with:");
      console.error(`   https://www.strava.com/oauth/authorize?client_id=${config.clientId}&response_type=code&redirect_uri=http://localhost&scope=read_all,activity:read_all,activity:write,profile:read_all&approval_prompt=force`);
    }
  }
}

main().catch((err) => { console.error("\n❌ Fatal:", err.message); process.exit(1); });

