import { z } from "zod";
import { studentQuestions } from "./student-questions";
import { socialHref, socialPlatforms } from "./social-contacts";
export const INTRODUCTION_VERSION = 3;
export const interestOptions = ["AI", "Design", "Product", "Entrepreneurship", "Photography", "Research", "Sports", "Music", "Finance", "Sustainability", "Coding", "Public speaking", "Books", "Films", "Gaming", "Dance", "Art", "Writing", "Food", "Volunteering", "Fitness", "Travel"];
export const goalOptions = ["Activity buddies", "Friends beyond my course", "Study partners", "Build something together", "Try a new hobby", "Skill swaps"];
export const availabilityOptions = ["Weekday mornings", "Weekday afternoons", "Weekday evenings", "Friday evening", "Saturday", "Sunday"];
export const meetingOptions = ["Campus event", "Small group", "Study session", "Project collaboration", "Coffee or walk", "Online first"];
export const energyOptions = ["I like to ease in", "It depends on the day", "I enjoy starting conversations"];
export const planOptions = ["Plan ahead", "Spontaneous is fine", "Either works"];
export const groupOptions = ["One person", "2–4 people", "5+ people", "Flexible"];
export const topicOptions = ["Big ideas", "Everyday campus life", "Creative projects", "Sports and games", "Books, films and music", "Career and learning"];
export const icebreakerPrompts = ["A small thing I could talk about for hours…", "Something I would love to try at Woxsen…", "Teach me one thing about…", "My ideal break between classes…", "An underrated book, film, game or song…"];
export const steps = ["Campus & connections", "Hobbies & curiosity", "Your social rhythm", "A plan that fits", "Review & privacy"];
const list = (options, max) => z.array(z.string()).max(max).refine(items => new Set(items).size === items.length && items.every(item => options.includes(item)), "Choose from the available options without repeats.");
const choice = (options) => z.string().refine(value => value === "" || options.includes(value), "Choose an available option.");
export const preferencesSchema = z.object({
    shareEntertainment: z.boolean().default(false),
    languageMatchingOptIn: z.boolean().default(false),
    answers: z.record(z.string(), z.array(z.string().trim().max(240)).max(12)).default({}).superRefine((answers, ctx) => {
        for (const [id, values] of Object.entries(answers)) {
            const question = studentQuestions.find(q => q.id === id);
            const genderCustom = id === "51" && values.length === 1 && (values[0].startsWith("Describe in your own words") || ["Man", "Woman", "Non-binary"].includes(values[0]));
            const legacyComfort = id === "52" && values.length === 1 && ["Comfortable chatting with anyone, regardless of gender", "Usually more comfortable with people of my own gender", "Comfortable with a different gender, but prefer a group first", "Comfortable with a different gender, but prefer texting first", "Depends on the person and situation"].includes(values[0]);
            if (!question || values.length > question.max || new Set(values).size !== values.length || (!question.text && !genderCustom && !legacyComfort && values.some(v => !question.options.includes(v))))
                ctx.addIssue({ code: "custom", message: "Choose available answers without repeats.", path: [id] });
        }
    }),
    goals: list(goalOptions, 3).default([]),
    learnNext: list(interestOptions, 3).default([]),
    socialEnergy: choice(energyOptions).default(""),
    planStyle: choice(planOptions).default(""),
    groupSize: choice(groupOptions).default(""),
    topics: list(topicOptions, 3).default([]),
    icebreakerPrompt: choice(icebreakerPrompts).default(""),
    icebreakerAnswer: z.string().trim().max(160).default(""),
    shareIcebreaker: z.boolean().default(false),
});
export const emptyPreferences = () => preferencesSchema.parse({});
export const profileInputSchema = z.object({
    socialContacts: z.array(z.object({ platform: z.enum(socialPlatforms), value: z.string().trim().min(1).max(240) }).refine(v => Boolean(socialHref(v)), "Use a valid handle or HTTPS profile link; WhatsApp needs an international number or wa.me link.")).max(6).default([]),
    displayName: z.string().trim().max(70), school: z.string().trim().max(80),
    course: z.string().trim().max(70), year: choice(["1", "2", "3", "4", "5", "6+", "research", "exchange", "alumni"]),
    interests: list(interestOptions, 8), skills: z.array(z.string().trim().min(1).max(40)).max(12),
    availability: list(availabilityOptions, 6), meetingFormats: list(meetingOptions, 6),
    discoveryScope: z.enum(["all", "same-school", "same-year"]),
    discoveryEnabled: z.boolean(), preferences: preferencesSchema,
    onboardingStep: z.number().int().min(0).max(4), intent: z.enum(["draft", "complete"]),
});
export function readinessErrors(p) {
    const errors = [];
    if (!p.displayName || !p.course || !p.year)
        errors.push("Add your display name, course and year.");
    if (!p.socialContacts.length)
        errors.push("Add at least one social handle or profile link. It stays private until you choose to share.");
    if (p.discoveryEnabled && !p.meetingFormats.length)
        errors.push("Choose a comfortable first-hello format before enabling discovery.");
    if (p.preferences.answers["5"]?.includes("Under 18"))
        errors.push("WoxRadar is currently for students aged 18 or older.");
    if (p.preferences.shareIcebreaker && (!p.preferences.icebreakerPrompt || !p.preferences.icebreakerAnswer))
        errors.push("Add a prompt and answer, or turn off sharing your icebreaker.");
    return errors;
}
export function parseList(value) {
    try {
        const p = JSON.parse(value);
        return Array.isArray(p) ? p.filter((v) => typeof v === "string") : [];
    }
    catch {
        return [];
    }
}
export function parsePreferences(value) {
    try {
        const raw = JSON.parse(value);
        const answers = raw?.answers && typeof raw.answers === "object" ? raw.answers : {};
        const migrated = {};
        for (const [id, unknownValues] of Object.entries(answers)) {
            const question = studentQuestions.find(item => item.id === id);
            if (!question || !Array.isArray(unknownValues))
                continue;
            const values = unknownValues.filter((item) => typeof item === "string").map(item => legacyAnswer(id, item));
            migrated[id] = [...new Set(values.filter(item => question.text || question.options.includes(item) || id === "51" && (item.startsWith("Describe in your own words") || ["Man", "Woman", "Non-binary"].includes(item))))].slice(0, question.max);
        }
        const p = preferencesSchema.safeParse({ ...raw, answers: migrated });
        return p.success ? p.data : emptyPreferences();
    }
    catch {
        return emptyPreferences();
    }
}
function legacyAnswer(id, value) {
    const aliases = {
        "10": { "Telugu cinema": "Telugu", "English-language/Hollywood": "Hollywood", "Kannada cinema": "Kannada", "Tamil cinema": "Tamil", "Malayalam cinema": "Malayalam", "Marathi cinema": "Marathi", "Other Indian cinema": "Other Indian", "Korean films": "Korean", "Japanese films/anime": "Japanese/anime", "Other international cinema": "Other international", "Anything good, language doesn't matter": "Any language" },
        "11": { "Sci-fi": "Sci-fi/fantasy", "Fantasy": "Sci-fi/fantasy", "Feel-good/slice of life": "Feel-good", "Musicals": "Musical" },
        "16": { "Watch alone, discuss later": "Watch alone, discuss later", "Watch with one friend": "With one friend", "A small group watch": "Small group", "Online watch together": "Online watch-together", "No fixed preference": "No preference" },
        "17": { "Telugu film songs": "Telugu songs", "Hindi film songs": "Hindi songs", "English-language pop": "English pop", "Lo-fi/instrumental": "Lo-fi", "A mix of everything": "Mix of everything" },
        "25": { "Casual mobile games": "Mobile games", "Multiplayer with friends": "Multiplayer", "Competitive games": "Competitive games", "Story-based games": "Story games", "Sports/racing games": "Sports/racing", "Strategy/puzzle games": "Strategy/puzzle", "Board/card games": "Board/card games", "Watching gaming streams": "Watching gaming streams", "I'd like to try gaming": "Want to try gaming", "Gaming isn't my thing": "Not my thing" },
        "28": { "Watching cricket": "Watch cricket", "Playing cricket": "Play cricket", "Watching football": "Watch football", "Playing football": "Play football", "Just join when friends play": "Join when friends play", "Sports aren't my thing": "Not my thing" },
        "29": { "A reason to say hi to someone new": "A reason to say hi", "Friends outside my class": "Friends outside class", "People to join a plan with": "Join a plan", "A comfortable small group": "Comfortable small group", "A study/project buddy": "Study/project buddy" },
        "31": { "Trying food places": "Food places", "Walking/exploring": "Walking/exploring", "Sport/fitness": "Sports/fitness", "Tech/coding/making things": "Coding/making", "Organizing events": "Events", "Talking and hanging out": "Talking/hanging out", "Resting with no fixed activity": "Resting" },
        "34": { "Depends who I'm with": "Depends on company" },
        "35": { "One person I can get to know": "One person to know", "A small familiar group": "Small familiar group", "A group around a shared interest": "Shared-interest group", "Different people for different activities": "Different people for activities", "Someone to chat with online": "Online chat first", "I'm not sure yet": "Not sure" },
        "43": { "A specific question about a shared interest": "Specific shared-interest question", "A meme or recommendation with some context": "Meme/recommendation with context", "A clear small-plan invitation": "Clear small-plan invitation", "A simple hello and introduction": "Simple hello", "An introduction through a shared group": "Shared group introduction", "A short message with no pressure to reply quickly": "Short no-pressure message", "Depends on the person": "Depends on person" },
        "52": { "Comfortable chatting with anyone, regardless of gender": "Comfortable meeting one-on-one", "Usually more comfortable with people of my own gender": "Depends on the person", "Comfortable with a different gender, but prefer a group first": "Prefer a group first", "Comfortable with a different gender, but prefer texting first": "Prefer texting before meeting", "Depends on the person and situation": "Depends on the person", "Still figuring it out": "Still figuring it out" }
    };
    return aliases[id]?.[value] ?? value;
}
