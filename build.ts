// @ts-nocheck — this file runs via tsx, not tsc
import { build } from "esbuild";
import { readFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();
const distDir = join(rootDir, "dist");
const releaseDir = join(rootDir, "release");
if (!existsSync(distDir)) mkdirSync(distDir);

// Read AI instructions to embed as string constant
const instructionsPath = join(rootDir, "AI_ANALYSIS_INSTRUCTIONS.md");
const instructions = existsSync(instructionsPath) ? readFileSync(instructionsPath, "utf-8") : "";

async function main() {
  await build({
    entryPoints: [join(rootDir, "src", "fast.ts")],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    outfile: join(distDir, "strava.cjs"),
    minify: false,
    sourcemap: false,
    external: [],
    define: {
      "process.env.EMBEDDED_AI_INSTRUCTIONS": JSON.stringify(instructions),
    },
  });

  const size = (readFileSync(join(distDir, "strava.cjs")).length / 1024).toFixed(0);
  console.log(`✅ Built: dist/strava.cjs (${size} KB)`);

  // ─── Create release folder ───
  if (!existsSync(releaseDir)) mkdirSync(releaseDir);
  const releaseDist = join(releaseDir, "dist");
  if (!existsSync(releaseDist)) mkdirSync(releaseDist);

  copyFileSync(join(distDir, "strava.cjs"), join(releaseDist, "strava.cjs"));
  copyFileSync(join(rootDir, "strava.bat"), join(releaseDir, "strava.bat"));
  copyFileSync(join(rootDir, ".env"), join(releaseDir, ".env"));
  copyFileSync(join(rootDir, ".env.example"), join(releaseDir, ".env.example"));
  if (existsSync(join(rootDir, "METRICS.md"))) copyFileSync(join(rootDir, "METRICS.md"), join(releaseDir, "METRICS.md"));
  if (existsSync(join(rootDir, "COMMANDS.md"))) copyFileSync(join(rootDir, "COMMANDS.md"), join(releaseDir, "COMMANDS.md"));
  if (existsSync(join(rootDir, "AI_ANALYSIS_INSTRUCTIONS.md"))) copyFileSync(join(rootDir, "AI_ANALYSIS_INSTRUCTIONS.md"), join(releaseDir, "AI_ANALYSIS_INSTRUCTIONS.md"));

  console.log(`📦 Release folder ready: release/`);
  console.log(`   release/`);
  console.log(`   ├── strava.bat                    ← double-click to run`);
  console.log(`   ├── dist/strava.cjs               ← bundled app (${size} KB)`);
  console.log(`   ├── .env                          ← edit credentials here`);
  console.log(`   ├── .env.example                  ← reference`);
  console.log(`   ├── METRICS.md                    ← metrics guide`);
  console.log(`   ├── COMMANDS.md                   ← usage guide`);
  console.log(`   └── AI_ANALYSIS_INSTRUCTIONS.md   ← AI analysis prompt`);
  console.log(`\n   ⚠️  Update .env with your friend's Strava credentials before sharing!`);
}

main().catch((err) => { console.error("❌ Build failed:", err.message); process.exit(1); });
