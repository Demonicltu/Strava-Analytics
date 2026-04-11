// ─── Strava API Type Definitions ───
// Based on https://developers.strava.com/docs/reference/

// ─── OAuth ───
export interface TokenResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete?: AthleteSummary;
}

export interface AthleteSummary {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  city: string;
  state: string;
  country: string;
  sex: string;
  premium: boolean;
  created_at: string;
  updated_at: string;
  profile_medium: string;
  profile: string;
}

/** @deprecated Use AthleteSummary instead */
export type AthleteSmummary = AthleteSummary;

// ─── Activity Summary (from list endpoint) ───
export interface SummaryActivity {
  id: number;
  resource_state: number;
  external_id: string;
  upload_id: number;
  athlete: { id: number };
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  timezone: string;
  utc_offset: number;
  start_latlng: [number, number] | null;
  end_latlng: [number, number] | null;
  achievement_count: number;
  kudos_count: number;
  comment_count: number;
  athlete_count: number;
  photo_count: number;
  map: {
    id: string;
    summary_polyline: string;
    resource_state: number;
  };
  trainer: boolean;
  commute: boolean;
  manual: boolean;
  private: boolean;
  flagged: boolean;
  gear_id: string | null;
  from_accepted_tag: boolean;
  average_speed: number;
  max_speed: number;
  average_cadence?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  kilojoules?: number;
  device_watts?: boolean;
  has_heartrate: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  max_watts?: number;
  pr_count: number;
  total_photo_count: number;
  has_kudoed: boolean;
  suffer_score?: number;
  workout_type?: number;
  calories?: number;
  description?: string;
  device_name?: string;
  embed_token?: string;
  segment_leaderboard_opt_out?: boolean;
  leaderboard_opt_out?: boolean;
}

// ─── Detailed Activity (from single-activity endpoint) ───
export interface DetailedActivity extends SummaryActivity {
  description: string;
  calories: number;
  device_name: string;
  segment_efforts: SegmentEffort[];
  splits_metric: Split[];
  splits_standard: Split[];
  best_efforts: BestEffort[];
  gear: Gear | null;
  photos: {
    primary: PhotoPrimary | null;
    count: number;
  };
  stats_visibility: { type: string; visibility: string }[];
  hide_from_home: boolean;
  embed_token: string;
  available_zones: string[];
  similar_activities?: {
    effort_count: number;
    average_speed: number;
    min_average_speed: number;
    mid_average_speed: number;
    max_average_speed: number;
    pr_rank: number | null;
    frequency_milestone: number | null;
    trend: { speeds: number[]; current_activity_index: number; min_speed: number; mid_speed: number; max_speed: number; direction: number };
    resource_state: number;
  };
  perceived_exertion?: number;
  prefer_perceived_exertion?: boolean;
}

export interface SegmentEffort {
  id: number;
  resource_state: number;
  name: string;
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  start_date_local: string;
  distance: number;
  start_index: number;
  end_index: number;
  average_cadence?: number;
  average_watts?: number;
  device_watts?: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  segment: {
    id: number;
    resource_state: number;
    name: string;
    activity_type: string;
    distance: number;
    average_grade: number;
    maximum_grade: number;
    elevation_high: number;
    elevation_low: number;
    start_latlng: [number, number];
    end_latlng: [number, number];
    climb_category: number;
    city: string;
    state: string;
    country: string;
    private: boolean;
    hazardous: boolean;
    starred: boolean;
  };
  pr_rank: number | null;
  achievements: { type_id: number; type: string; rank: number }[];
  kom_rank: number | null;
  hidden: boolean;
}

export interface Split {
  distance: number;
  elapsed_time: number;
  elevation_difference: number;
  moving_time: number;
  split: number;
  average_speed: number;
  average_grade_adjusted_speed?: number;
  average_heartrate?: number;
  pace_zone: number;
}

export interface BestEffort {
  id: number;
  resource_state: number;
  name: string;
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  start_date_local: string;
  distance: number;
  start_index: number;
  end_index: number;
  pr_rank: number | null;
  achievements: { type_id: number; type: string; rank: number }[];
}

export interface Gear {
  id: string;
  primary: boolean;
  name: string;
  distance: number;
  resource_state: number;
}

export interface PhotoPrimary {
  id: number | null;
  unique_id: string;
  urls: Record<string, string>;
  source: number;
}

// ─── Laps ───
export interface Lap {
  id: number;
  resource_state: number;
  name: string;
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  start_date_local: string;
  distance: number;
  start_index: number;
  end_index: number;
  total_elevation_gain: number;
  average_speed: number;
  max_speed: number;
  average_cadence?: number;
  average_watts?: number;
  device_watts?: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  lap_index: number;
  split: number;
  pace_zone: number;
}

// ─── Zones ───
export interface ActivityZone {
  score: number;
  distribution_buckets: { min: number; max: number; time: number }[];
  type: string;
  resource_state: number;
  sensor_based: boolean;
  points: number;
  custom_zones: boolean;
  max?: number;
}

// ─── Streams ───
export interface StreamEntry {
  type: string;
  data: (number | [number, number] | boolean | null)[];
  series_type: string;
  original_size: number;
  resolution: string;
}

export type StreamKeys =
  | "time"
  | "distance"
  | "latlng"
  | "altitude"
  | "velocity_smooth"
  | "heartrate"
  | "cadence"
  | "watts"
  | "temp"
  | "moving"
  | "grade_smooth";

export type StreamSet = Partial<Record<StreamKeys, StreamEntry>>;

// ─── Combined enriched activity for AI ───
export interface EnrichedActivity {
  /** Full detailed activity data */
  activity: DetailedActivity;
  /** Lap data */
  laps: Lap[];
  /** Heart-rate / power zones */
  zones: ActivityZone[];
  /** Time-series stream data */
  streams: StreamSet;
}

// ─── Athlete Stats ───
export interface AthleteStats {
  biggest_ride_distance: number;
  biggest_climb_elevation_gain: number;
  recent_ride_totals: ActivityTotal;
  recent_run_totals: ActivityTotal;
  recent_swim_totals: ActivityTotal;
  ytd_ride_totals: ActivityTotal;
  ytd_run_totals: ActivityTotal;
  ytd_swim_totals: ActivityTotal;
  all_ride_totals: ActivityTotal;
  all_run_totals: ActivityTotal;
  all_swim_totals: ActivityTotal;
}

export interface ActivityTotal {
  count: number;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  elevation_gain: number;
  achievement_count?: number;
}

// ─── Full export payload ───
export interface StravaExport {
  exported_at: string;
  athlete: AthleteSmummary;
  athlete_stats: AthleteStats | null;
  activities: EnrichedActivity[];
}

