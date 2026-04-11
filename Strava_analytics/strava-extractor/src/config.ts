import "dotenv/config";

export interface Config {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  pageSize: number;
  maxPages: number;
  afterDate: Date | null;
}

export interface RiderConfig {
  weightKg: number | null;
  ftpW: number | null;
  maxHr: number | null;
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
  const afterDateStr = process.env["AFTER_DATE"];

  return {
    clientId: requireEnv("STRAVA_CLIENT_ID"),
    clientSecret: requireEnv("STRAVA_CLIENT_SECRET"),
    refreshToken: requireEnv("STRAVA_REFRESH_TOKEN"),
    pageSize: parseInt(process.env["PAGE_SIZE"] || "50", 10),
    maxPages: parseInt(process.env["MAX_PAGES"] || "10", 10),
    afterDate: afterDateStr ? new Date(afterDateStr) : null,
  };
}

export function loadRiderConfig(): RiderConfig {
  const w = process.env["RIDER_WEIGHT_KG"];
  const ftp = process.env["RIDER_FTP_W"];
  const maxHr = process.env["RIDER_MAX_HR"];
  const restHr = process.env["RIDER_REST_HR"];
  return {
    weightKg: w ? parseFloat(w) : null,
    ftpW: ftp ? parseFloat(ftp) : null,
    maxHr: maxHr ? parseInt(maxHr, 10) : null,
    restHr: restHr ? parseInt(restHr, 10) : null,
  };
}

