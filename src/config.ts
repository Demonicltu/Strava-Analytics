import "dotenv/config";

export interface Config {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  pageSize: number;
}

export interface RiderConfig {
  weightKg: number | null;
  ftpW: number | null;
  rFtpW: number | null;
  maxHr: number | null;       // RIDER_MAX_HR (cycling)
  runnerMaxHr: number | null; // RUNNER_MAX_HR
  lthr: number | null;        // RIDER_LTHR (cycling)
  runnerLthr: number | null;  // RUNNER_LTHR
  restHr: number | null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Missing required environment variable: ${name}`);
    console.error(`   Copy .env.example to .env and fill in your Strava API credentials.`);
    process.exit(1);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    clientId: requireEnv("STRAVA_CLIENT_ID"),
    clientSecret: requireEnv("STRAVA_CLIENT_SECRET"),
    refreshToken: requireEnv("STRAVA_REFRESH_TOKEN"),
    pageSize: parseInt(process.env["PAGE_SIZE"] || "10", 10),
  };
}

export function loadRiderConfig(): RiderConfig {
  const w = process.env["RIDER_WEIGHT_KG"];
  const ftp = process.env["RIDER_FTP_W"];
  const rFtp = process.env["RUNNER_RFTP_W"];
  const maxHr = process.env["RIDER_MAX_HR"];
  const runnerMaxHr = process.env["RUNNER_MAX_HR"];
  const lthr = process.env["RIDER_LTHR"];
  const runnerLthr = process.env["RUNNER_LTHR"];
  const restHr = process.env["RIDER_REST_HR"];
  return {
    weightKg: w ? parseFloat(w) : null,
    ftpW: ftp ? parseFloat(ftp) : null,
    rFtpW: rFtp ? parseFloat(rFtp) : null,
    maxHr: maxHr ? parseInt(maxHr, 10) : null,
    runnerMaxHr: runnerMaxHr ? parseInt(runnerMaxHr, 10) : null,
    lthr: lthr ? parseInt(lthr, 10) : null,
    runnerLthr: runnerLthr ? parseInt(runnerLthr, 10) : null,
    restHr: restHr ? parseInt(restHr, 10) : null,
  };
}

