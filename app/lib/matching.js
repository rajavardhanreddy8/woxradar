import { INTRODUCTION_VERSION } from "./introduction";
export function overlap(a, b) { const right = new Set(b.map(v => v.trim().toLowerCase())); return [...new Set(a)].filter(v => right.has(v.trim().toLowerCase())); }
function scopeAllows(a, b) { return a.discoveryScope === "same-school" ? a.school.trim().toLowerCase() === b.school.trim().toLowerCase() : a.discoveryScope === "same-year" ? a.year === b.year : a.discoveryScope === "all"; }
const answer = (p, id) => p.preferences.answers[id] ?? [];
const concrete = (v) => !/^(Other|Depends|Anything good|A mix|A bit|Still|No preference|I don't|I'm only|Not making|Nothing specific|It changes|Prefer not)/i.test(v);
export function sharedFormats(a, b) {
    let formats = overlap(a.meetingFormats, b.meetingFormats);
    const normalize = (v) => v === "Man" ? "Male" : v === "Woman" ? "Female" : v, ga = normalize(answer(a, "51")[0] ?? ""), gb = normalize(answer(b, "51")[0] ?? ""), known = ["Male", "Female"];
    if (known.includes(ga) && known.includes(gb) && ga === gb)
        return formats;
    for (const p of [a, b]) {
        const comfort = (answer(p, "52")[0] ?? "").toLowerCase();
        if (comfort.includes("prefer a group first"))
            formats = formats.filter(v => v === "Small group");
        if (comfort.includes("prefer texting") && comfort.includes("first"))
            formats = formats.filter(v => v === "Online first");
    }
    return formats;
}
export function pairEligible(a, b) { return a.userId !== b.userId && a.profileCompleted && b.profileCompleted && a.collegeVerified && b.collegeVerified && a.discoveryEnabled && b.discoveryEnabled && a.onboardingVersion === INTRODUCTION_VERSION && b.onboardingVersion === INTRODUCTION_VERSION && scopeAllows(a, b) && scopeAllows(b, a) && sharedFormats(a, b).length > 0; }
function dice(a, b) { return a.length + b.length ? 2 * overlap(a, b).length / (a.length + b.length) : 0; }
// These weights are pilot hypotheses. No character or psychological score is calculated.
export function rankContext(a, b, aCircles, bCircles) {
    let points = 0, weight = 0;
    const reasons = ["Both opted into this activity"], sharedTopics = [];
    const stableGroups = [["10", "11"], ["17"], ["25"], ["27"], ["28"], ["31"]], fits = [];
    for (const group of stableGroups) {
        const detailFits = [];
        for (const id of group) {
            const av = answer(a, id).filter(concrete), bv = answer(b, id).filter(concrete);
            if (av.length && bv.length) {
                detailFits.push(dice(av, bv));
                sharedTopics.push(...overlap(av, bv));
            }
        }
        if (detailFits.length)
            fits.push(detailFits.reduce((x, y) => x + y, 0) / detailFits.length);
    }
    if (a.interests.length && b.interests.length) {
        fits.push(dice(a.interests, b.interests));
        sharedTopics.push(...overlap(a.interests, b.interests));
    }
    if (fits.length) {
        points += 35 * fits.reduce((x, y) => x + y, 0) / fits.length;
        weight += 35;
    }
    const plansA = answer(a, "29").filter(concrete), plansB = answer(b, "29").filter(concrete), plans = overlap(plansA, plansB);
    if (plansA.length && plansB.length) {
        points += 25 * dice(plansA, plansB);
        weight += 25;
    }
    const times = overlap(a.availability, b.availability), formats = sharedFormats(a, b);
    if (a.availability.length && b.availability.length) {
        points += 25 * Number(times.length > 0);
        weight += 25;
    }
    const languageA = answer(a, "6"), languageB = answer(b, "6"), languages = overlap(languageA, languageB);
    if (a.preferences.languageMatchingOptIn && b.preferences.languageMatchingOptIn && languageA.length && languageB.length) {
        weight += 10;
        points += 10 * Number(languages.length > 0);
        if (languages.length)
            reasons.push(`Both comfortable chatting in ${languages[0]}`);
    }
    const feedA = answer(a, "21").filter(concrete), feedB = answer(b, "21").filter(concrete), feeds = overlap(feedA, feedB);
    if (feedA.length && feedB.length) {
        weight += 5;
        points += 5 * dice(feedA, feedB);
    }
    const disclose = a.preferences.shareEntertainment && b.preferences.shareEntertainment;
    if (disclose && sharedTopics.length)
        reasons.push(`Something in common: ${[...new Set(sharedTopics)].slice(0, 3).join(", ")}`);
    if (disclose && plans.length)
        reasons.push(`A reason you both picked: ${plans[0]}`);
    if (disclose && !sharedTopics.length && feeds.length)
        reasons.push(`A shared feed topic: ${feeds[0]}`);
    reasons.push(times.length ? `A shared time window: ${times[0]}` : "Agree a time together; availability is not confirmed");
    reasons.push(`Start with ${formats[0]?.toLowerCase() ?? "a format you both choose"}`);
    const circles = [...aCircles].filter(([id]) => bCircles.has(id)).map(([, name]) => name);
    if (circles.length)
        reasons.push(`Shared public circle: ${circles[0]}`);
    const titles = disclose ? overlap(answer(a, "12"), answer(b, "12")) : [];
    const conversationStarter = titles.length ? `What did you enjoy about ${titles[0]}?` : disclose && sharedTopics.some(v => /cinema|movie|thriller|comedy|drama|horror/i.test(v)) ? "Watched anything good lately?" : disclose && sharedTopics.length ? `What have you enjoyed lately around ${sharedTopics[0].toLowerCase()}?` : "What made you curious about this activity?";
    const icebreaker = b.preferences.shareIcebreaker && b.preferences.icebreakerPrompt && b.preferences.icebreakerAnswer ? { prompt: b.preferences.icebreakerPrompt, answer: b.preferences.icebreakerAnswer } : null;
    return { rankScore: weight ? points / weight : 0, evidenceCoverage: weight, reasons, conversationStarter, icebreaker };
}
