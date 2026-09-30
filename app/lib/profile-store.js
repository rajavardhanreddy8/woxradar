import { env } from "@/lib/runtime-env";
import { INTRODUCTION_VERSION, parseList, parsePreferences } from "./introduction";
import { socialHref } from "./social-contacts";
export const profileColumns = `user_id AS userId, email, display_name AS displayName, initials, school, course, year,
  interests, skills, availability, meeting_formats AS meetingFormats, discovery_scope AS discoveryScope,
  discovery_enabled AS discoveryEnabled, profile_completed AS profileCompleted, preferences,
  onboarding_version AS onboardingVersion, onboarding_step AS onboardingStep,social_contacts AS socialContacts,EXISTS(SELECT 1 FROM college_verifications v WHERE v.user_id=profiles.user_id AND v.verified_email IS NOT NULL) AS collegeVerified`;
export function readProfile(userId) {
    return env.DB.prepare(`SELECT ${profileColumns} FROM profiles WHERE user_id = ? LIMIT 1`).bind(userId).first();
}
export function hydrateProfile(row) {
    let contacts = [];
    try {
        const p = JSON.parse(row.socialContacts ?? "[]");
        if (Array.isArray(p))
            contacts = p.filter(c => c && typeof c.value === "string" && socialHref(c));
    }
    catch { /* Legacy contacts are empty. */ }
    return { ...row, socialContacts: contacts, interests: parseList(row.interests), skills: parseList(row.skills), availability: parseList(row.availability),
        meetingFormats: parseList(row.meetingFormats), preferences: parsePreferences(row.preferences),
        discoveryEnabled: Boolean(row.discoveryEnabled), collegeVerified: Boolean(row.collegeVerified), profileCompleted: Boolean(row.profileCompleted) && Boolean(row.collegeVerified) && row.onboardingVersion === INTRODUCTION_VERSION };
}
