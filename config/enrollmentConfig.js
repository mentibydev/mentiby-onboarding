// Enrollment Configuration - Fetched from Supabase
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Default values (fallback if fetch fails)
const DEFAULTS = {
  STARTING_ENROLLMENT_NUMBER: 2501,
  COHORT_TYPE: "Placement",
  COHORT_NUMBER: "2.0",
};

// Fetch enrollment config from Supabase
export async function getEnrollmentConfig() {
  try {
    const { data, error } = await supabase
      .from("enrollment_config")
      .select("starting_enrollment_number, cohort_type, cohort_number")
      .limit(1)
      .single();

    if (error) {
      console.error("Error fetching enrollment config:", error);
      return DEFAULTS;
    }

    return {
      STARTING_ENROLLMENT_NUMBER: data.starting_enrollment_number,
      COHORT_TYPE: data.cohort_type,
      COHORT_NUMBER: data.cohort_number,
    };
  } catch (err) {
    console.error("Failed to fetch enrollment config:", err);
    return DEFAULTS;
  }
}

// For backward compatibility - export defaults for static usage
export const STARTING_ENROLLMENT_NUMBER = DEFAULTS.STARTING_ENROLLMENT_NUMBER;
export const COHORT_TYPE = DEFAULTS.COHORT_TYPE;
export const COHORT_NUMBER = DEFAULTS.COHORT_NUMBER;
