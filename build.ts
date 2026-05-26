// @ts-nocheck — this file runs via tsx, not tsc
import { build } from "esbuild";
import { readFileSync, mkdirSync, existsSync, copyFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();
const distDir = join(rootDir, "dist");
const releaseDir = join(rootDir, "release");
if (!existsSync(distDir)) mkdirSync(distDir);
if (!existsSync(releaseDir)) mkdirSync(releaseDir);
const releaseDist = join(releaseDir, "dist");
if (!existsSync(releaseDist)) mkdirSync(releaseDist);

/** Load all instruction files from instructions/ folder into a keyed object */
function loadEmbeddedInstructions(): Record<string, string> {
  const instrDir = join(rootDir, "instructions");
  const result: Record<string, string> = {};
  if (!existsSync(instrDir)) {
    // Fallback: embed legacy monolithic file if present
    const legacy = join(rootDir, "AI_ANALYSIS_INSTRUCTIONS.md");
    if (existsSync(legacy)) result["__legacy__"] = readFileSync(legacy, "utf-8");
    return result;
  }
  // Load top-level .md files (common, cycling, running, walk, surf, workout)
  for (const f of readdirSync(instrDir)) {
    if (f.endsWith(".md")) {
      const key = f.replace(".md", "").toLowerCase();
      result[key] = readFileSync(join(instrDir, f), "utf-8");
    }
  }
  // Load devices/ subfolder
  const devDir = join(instrDir, "devices");
  if (existsSync(devDir)) {
    for (const f of readdirSync(devDir)) {
      if (f.endsWith(".md")) {
        const key = f.replace(".md", "").toLowerCase();
        result[key] = readFileSync(join(devDir, f), "utf-8");
      }
    }
  }
  return result;
}

const embeddedInstructions = loadEmbeddedInstructions();

const ENTRIES: { name: string; src: string }[] = [
  { name: "strava",    src: "src/fast.ts"        },
  { name: "bulk",      src: "src/bulk_fetch.ts"  },
  { name: "recrunch",  src: "src/recrunch.ts"    },
  { name: "compare",   src: "src/compare.ts"     },
  { name: "digest",    src: "src/digest.ts"      },
  { name: "records",   src: "src/records.ts"     },
  { name: "dashboard", src: "src/dashboard.ts"   },
];

async function buildEntry(name: string, src: string): Promise<number> {
  const outfile = join(distDir, `${name}.cjs`);
  await build({
    entryPoints: [join(rootDir, src)],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    outfile,
    minify: false,
    sourcemap: false,
    external: [],
    define: {
      "import.meta.url": "__importMetaUrl",
      "process.env.EMBEDDED_AI_INSTRUCTIONS": JSON.stringify(embeddedInstructions),
    },
    banner: { js: "const __importMetaUrl = require('url').pathToFileURL(__filename).href;" },
  });
  const kb = Math.round(readFileSync(outfile).length / 1024);
  console.log(`  ✅ dist/${name}.cjs  (${kb} KB)`);
  return kb;
}

// Generate a .bat launcher for each script
function makeBat(name: string, description: string): string {
  return `@echo off
REM ${description}
cd /d "%~dp0"
node dist\\${name}.cjs %*
pause
`;
}

async function main() {
  console.log("\n🔨 Building all scripts...\n");

  for (const { name, src } of ENTRIES) {
    await buildEntry(name, src);
    copyFileSync(join(distDir, `${name}.cjs`), join(releaseDist, `${name}.cjs`));
  }

  // Copy .env / docs
  const copyIfExists = (from: string, to: string) => {
    if (existsSync(join(rootDir, from))) copyFileSync(join(rootDir, from), join(releaseDir, to));
  };

  copyIfExists(".env",                          ".env");
  copyIfExists(".env.example",                  ".env.example");
  copyIfExists("METRICS.md",                    "METRICS.md");
  copyIfExists("COMMANDS.md",                   "COMMANDS.md");
  copyIfExists("AI_ANALYSIS_INSTRUCTIONS.md",   "AI_ANALYSIS_INSTRUCTIONS.md"); // legacy reference copy
  copyIfExists("AI_COMPARE_INSTRUCTIONS.md",    "AI_COMPARE_INSTRUCTIONS.md");
  copyIfExists("AI_DIGEST_INSTRUCTIONS.md",     "AI_DIGEST_INSTRUCTIONS.md");

  // Copy instructions/ folder (split per-type files)
  const srcInstr = join(rootDir, "instructions");
  const releaseInstr = join(releaseDir, "instructions");
  if (existsSync(srcInstr)) {
    if (!existsSync(releaseInstr)) mkdirSync(releaseInstr);
    for (const f of readdirSync(srcInstr)) {
      if (f.endsWith(".md")) copyFileSync(join(srcInstr, f), join(releaseInstr, f));
    }
    const devSrc = join(srcInstr, "devices");
    const devDest = join(releaseInstr, "devices");
    if (existsSync(devSrc)) {
      if (!existsSync(devDest)) mkdirSync(devDest);
      for (const f of readdirSync(devSrc)) {
        if (f.endsWith(".md")) copyFileSync(join(devSrc, f), join(devDest, f));
      }
    }
    const instrFiles = Object.keys(embeddedInstructions);
    console.log(`  📋 Copied instructions/ (${instrFiles.length} files: ${instrFiles.join(", ")})`);
  }

  // Write .bat launchers
  const bats: { file: string; desc: string }[] = [
    { file: "strava.bat",     desc: "Fast mode — fetch + crunch + AI + push to Strava" },
    { file: "bulk.bat",       desc: "Bulk fetch 2 years of Strava history (no AI)" },
    { file: "recrunch.bat",   desc: "Re-crunch all output files (pick up new metrics, no API calls)" },
    { file: "compare.bat",    desc: "AI fitness trend comparison" },
    { file: "digest.bat",     desc: "Weekly training digest + overtraining check" },
    { file: "records.bat",    desc: "Personal records tracker" },
    { file: "dashboard.bat",  desc: "Generate static HTML dashboard" },
  ];

  for (const { file, desc } of bats) {
    const name = file.replace(".bat", "");
    writeFileSync(join(releaseDir, file), makeBat(name, desc));
  }

  // Sync analysis/_crunched.json files into release/analysis/
  const srcAnalysis = join(rootDir, "analysis");
  const releaseAnalysis = join(releaseDir, "analysis");
  if (!existsSync(releaseAnalysis)) mkdirSync(releaseAnalysis);
  if (existsSync(srcAnalysis)) {
    const crunchedFiles = readdirSync(srcAnalysis).filter(f => f.endsWith("_crunched.json"));
    for (const f of crunchedFiles) {
      copyFileSync(join(srcAnalysis, f), join(releaseAnalysis, f));
    }
    // Also copy garmin_wellness.json and personal_records.json if present
    for (const extra of ["garmin_wellness.json", "personal_records.json"]) {
      if (existsSync(join(srcAnalysis, extra))) {
        copyFileSync(join(srcAnalysis, extra), join(releaseAnalysis, extra));
      }
    }
    console.log(`  📁 Synced ${crunchedFiles.length} crunched files → release/analysis/`);
  } else {
    console.log("  📁 Created release/analysis/ (run 'npm run bulk' to populate)");
  }

  console.log(`\n📦 Release folder ready: release/`);
  console.log(`   release/`);
  console.log(`   ├── strava.bat         ← main: activity fetch + AI + Strava push`);
  console.log(`   ├── bulk.bat           ← bulk: fetch 2-year history`);
  console.log(`   ├── compare.bat        ← AI trend report`);
  console.log(`   ├── digest.bat         ← weekly digest + overtraining check`);
  console.log(`   ├── records.bat        ← personal records tracker`);
  console.log(`   ├── dashboard.bat      ← generate dashboard.html`);
  console.log(`   ├── dist/              ← bundled .cjs files (Node.js required)`);
  console.log(`   ├── .env               ← edit your credentials here`);
  console.log(`   └── *.md               ← documentation`);
  console.log(`\n   ⚠️  Edit .env with your Strava credentials before use!`);
  console.log(`   ℹ️  Requires Node.js 18+ to run. Python 3 + garminconnect for Garmin sync.\n`);
}

main().catch((err) => { console.error("❌ Build failed:", err.message); process.exit(1); });
