import { createBrowserClient } from "https://esm.sh/@supabase/ssr@0.7.0?bundle";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let supabase;
let viewer;

const STORAGE_KEY = "woxradar-codedex-v2";

const basePosts = [
  {
    id: "a1", type: "Activity", title: "Designing with AI: maker session",
    detail: "Bring one unfinished idea. Leave with a small prototype and new collaborators.",
    time: "Fri · 4:30 PM", place: "Innovation Lab · Block C",
    tags: ["AI", "Design", "Build"], count: 7
  },
  {
    id: "a2", type: "Opportunity", title: "Hackathon team call: climate data",
    detail: "Two more people needed for data, product or frontend before Saturday's shortlist.",
    time: "Deadline · Thu", place: "Open to all schools",
    tags: ["Hackathon", "Data", "Team"]
  },
  {
    id: "a3", type: "Exchange", title: "Scientific calculator, available to borrow",
    detail: "Casio fx-991ES Plus. Free to borrow until Monday afternoon.",
    time: "Available now", place: "Library pickup",
    tags: ["Borrow", "Academic"]
  },
  {
    id: "a4", type: "Gig", title: "Need an event photographer for Saturday",
    detail: "Two hours at the entrepreneurship mixer. Paid student gig; send a portfolio link.",
    time: "Sat · 5:00 PM", place: "Central Quad",
    tags: ["Photography", "Paid"]
  }
];

const baseCircles = [
  { id: "c1", name: "AI Builders at Woxsen", description: "Share unfinished AI projects, find collaborators and build together every Friday.", visibility: "public", category: "Technology", creator: "Demo member", members: 42 },
  { id: "c2", name: "Weekend Photowalks", description: "Casual campus photo walks for beginners, phone photographers and camera users.", visibility: "public", category: "Creative", creator: "Demo member", members: 18 },
  { id: "c3", name: "Founders' Build Circle", description: "A small accountability circle for students actively validating or shipping an idea.", visibility: "private", category: "Entrepreneurship", creator: "Demo organiser", members: 12 },
  { id: "c4", name: "Research Paper Sprint", description: "Weekly focused sessions for students preparing literature reviews, experiments or papers.", visibility: "private", category: "Research", creator: "Demo member", members: 16 }
];

const demoMatches = [
  {
    id: "m1", name: "Demo student 1", initials: "D1", course: "Course hidden", year: "3", school: "Woxsen University",
    reasons: ["Both opted into this activity", "Shared circle: Founders' Build Circle", "Shared interests: AI, Product", "Available: Friday evening"],
    starter: "What are you hoping to prototype at the maker session?"
  },
  {
    id: "m2", name: "Demo student 2", initials: "D2", course: "Course hidden", year: "2", school: "Woxsen University",
    reasons: ["Both opted into this activity", "Shared interests: AI, Photography", "Comfortable with a small group"],
    starter: "Want to team up on the design side of the prototype?"
  },
  {
    id: "m3", name: "Demo student 3", initials: "D3", course: "Course hidden", year: "4", school: "Woxsen University",
    reasons: ["Both opted into this activity", "Available: Weekday evenings", "Both open to meeting across schools"],
    starter: "Would you like to meet near the Innovation Lab before it starts?"
  }
];

const profileSections = [
  {
    name: "About you",
    title: "A little campus context",
    copy: "Your display name, school, course and year appear on eligible match cards."
  },
  {
    name: "Entertainment",
    title: "What do you enjoy watching or listening to?",
    copy: "Choose a few. These answers are optional and only help create natural conversation starters.",
    key: "entertainment",
    choices: ["Comedy", "Thriller/mystery", "Action", "Romance", "Sci-fi/fantasy", "Drama", "Animation", "K-drama/anime"]
  },
  {
    name: "Interests & plans",
    title: "What would you enjoy doing with someone new?",
    copy: "Pick up to five interests that could become a reason to meet.",
    key: "interests",
    choices: ["AI", "Coding", "Entrepreneurship", "Sports", "Photography", "Music", "Research", "Design"]
  },
  {
    name: "Your communication",
    title: "What kind of first hello feels easiest?",
    copy: "You stay in control of how and when another student can contact you.",
    key: "communication",
    choices: ["Specific shared-interest question", "Meme/recommendation with context", "Clear small-plan invitation", "Simple hello", "Shared group introduction", "Short no-pressure message"]
  },
  {
    name: "Review & privacy",
    title: "Your introduction",
    copy: "Review your details and choose whether verified students can discover you."
  }
];

const defaultState = {
  tab: "explore",
  filter: "All",
  query: "",
  customPosts: [],
  customCircles: [],
  joinedCircles: [],
  pendingCircles: [],
  reactions: {},
  comments: {},
  selectedActivity: "a1",
  matchingJoined: false,
  requests: [],
  profileStep: 0,
  answers: { entertainment: [], interests: [], communication: [] },
  profile: {
    name: "Campus member",
    school: "",
    course: "",
    year: "",
    email: "",
    social: "",
    verified: false,
    discovery: false,
    shareInterests: true,
    languageMatching: false
  }
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? {
      ...defaultState,
      ...saved,
      profile: { ...defaultState.profile, ...(saved.profile || {}) },
      answers: { ...defaultState.answers, ...(saved.answers || {}) }
    } : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

let state = loadState();
let toastTimer;

async function request(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "WoxRadar could not complete that action.");
  return data;
}

function showAuthentication(message = "") {
  $("#appShell").hidden = true;
  const screen = $("#authScreen");
  screen.hidden = false;
  screen.innerHTML = `<section class="auth-card">
    <span class="auth-brand">${icon("compass")} WoxRadar · Woxsen pilot</span>
    <h1>Meet through something you both want to do.</h1>
    <p>Sign in with your Woxsen email, confirm the link in your inbox, and complete your introduction before accessing campus features.</p>
    <form id="authForm" class="auth-form">
      <label class="field">College email<input name="email" type="email" required autocomplete="email" placeholder="you@woxsen.edu.in"></label>
      <label class="field">Password<input name="password" type="password" required minlength="8" autocomplete="current-password" placeholder="Password (8+ characters)"></label>
      <button class="btn btn-dark" type="submit">Sign in or create account ${icon("arrow")}</button>
      <p id="authMessage" class="auth-message" ${message ? "" : "hidden"}>${esc(message)}</p>
      <button id="resendConfirmation" class="btn btn-outline" type="button">Resend confirmation email</button>
    </form>
    <div class="auth-features"><div class="auth-feature"><strong>Woxsen-only access</strong><p>Supabase confirms the college inbox before the account can enter.</p></div><div class="auth-feature"><strong>Consent-first discovery</strong><p>Discovery and contact sharing remain under each student's control.</p></div></div>
  </section>`;
  $("#authForm").addEventListener("submit", authenticate);
  $("#resendConfirmation").addEventListener("click", resendConfirmation);
}

function authMessage(message) {
  const output = $("#authMessage");
  output.textContent = message;
  output.hidden = false;
}

async function authenticate(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!email.endsWith("@woxsen.edu.in")) return authMessage("Use your @woxsen.edu.in email address.");
  if (password.length < 8) return authMessage("Use a password with at least 8 characters.");
  const button = $("button[type=submit]", event.currentTarget);
  button.disabled = true;
  try {
    const signedIn = await supabase.auth.signInWithPassword({ email, password });
    if (!signedIn.error && signedIn.data.session) return window.location.assign("/?setup=1");
    if (signedIn.error && !/invalid login credentials|email not confirmed/i.test(signedIn.error.message)) throw signedIn.error;
    const result = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    if (result.error) throw result.error;
    authMessage("Check your Woxsen inbox and open the confirmation link before signing in.");
  } catch (error) {
    authMessage(error.message || "Could not sign in. Please try again.");
  } finally {
    button.disabled = false;
  }
}

async function resendConfirmation() {
  const email = String(new FormData($("#authForm")).get("email") || "").trim().toLowerCase();
  if (!email.endsWith("@woxsen.edu.in")) return authMessage("Enter your Woxsen email first.");
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
  authMessage(error ? error.message : "A fresh confirmation link was sent. Check spam too.");
}

function applyViewer(profile) {
  viewer = profile;
  state.profile = {
    ...state.profile,
    name: profile.displayName || state.profile.name,
    school: profile.school || "",
    course: profile.course || "",
    year: profile.year || "",
    email: profile.collegeEmail || profile.email || "",
    social: profile.socialContacts?.[0]?.value || "",
    verified: Boolean(profile.collegeVerified),
    discovery: Boolean(profile.discoveryEnabled),
    shareInterests: Boolean(profile.preferences?.shareEntertainment),
    languageMatching: Boolean(profile.preferences?.languageMatchingOptIn)
  };
  state.profileStep = Number(profile.onboardingStep || 0);
  state.answers.entertainment = profile.preferences?.answers?.["11"] || [];
  state.answers.interests = profile.interests || [];
  state.answers.communication = profile.preferences?.answers?.["43"] || [];
  $("#userAvatar").textContent = profile.initials || "?";
}

async function boot() {
  try {
    const config = await request("/api/config");
    supabase = createBrowserClient(config.url, config.key);
    const profileResult = await fetch("/api/profile", { cache: "no-store" });
    if (profileResult.status === 401) return showAuthentication();
    const data = await profileResult.json();
    if (!profileResult.ok || !data.profile) throw new Error(data.error || "Could not load your account.");
    applyViewer(data.profile);
    $("#authScreen").hidden = true;
    $("#appShell").hidden = false;
    if (!data.profile.profileCompleted || new URLSearchParams(location.search).has("setup")) state.tab = "profile";
    await loadCampusData();
    updateChrome();
    renderCurrent();
  } catch (error) {
    showAuthentication(error.message || "WoxRadar could not start.");
  }
}

async function loadCampusData() {
  const results = await Promise.allSettled([
    request("/api/posts"),
    request("/api/circles"),
    request("/api/requests")
  ]);
  if (results[0].status === "fulfilled" && results[0].value.posts) {
    state.customPosts = results[0].value.posts.map(post => ({ ...post, tags: Array.isArray(post.tags) ? post.tags : JSON.parse(post.tags || "[]") }));
  }
  if (results[1].status === "fulfilled") {
    const data = results[1].value;
    state.customCircles = (data.circles || []).map(circle => ({ ...circle, creator: circle.creatorName, members: circle.memberCount }));
    state.joinedCircles = (data.memberships || []).filter(item => item.state === "accepted").map(item => item.circleId);
    state.pendingCircles = (data.memberships || []).filter(item => item.state === "pending").map(item => item.circleId);
  }
  if (results[2].status === "fulfilled") {
    const data = results[2].value;
    state.requests = [...(data.incoming || []), ...(data.outgoing || [])].map(item => ({
      ...item, person: item.direction === "incoming" ? item.senderName : item.recipientName,
      initials: (item.direction === "incoming" ? item.senderName : item.recipientName).split(/\s+/).map(part => part[0]).join("").slice(0,2).toUpperCase(),
      activity: item.activityTitle, message: item.openingMessage, status: item.state,
      shared: item.direction === "incoming" ? item.recipientSharedContact : item.senderSharedContact
    }));
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateChrome();
}

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function icon(name, className = "") {
  const paths = {
    compass: '<circle cx="12" cy="12" r="9"></circle><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"></path>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path>',
    messages: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"></path>',
    user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
    chart: '<path d="M4 19V9M10 19V5M16 19v-7M22 19V3"></path>',
    send: '<path d="m22 2-7 20-4-9-9-4 20-7Z"></path><path d="M22 2 11 13"></path>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
    upRight: '<path d="M7 17 17 7M7 7h10v10"></path>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 11h18"></path>',
    pin: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2"></circle>',
    comment: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"></path>',
    plus: '<path d="M12 5v14M5 12h14"></path>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>',
    globe: '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"></path>',
    check: '<path d="m5 12 4 4L19 6"></path>',
    clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
    contact: '<path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"></path><circle cx="12" cy="8" r="3"></circle><path d="M7 18a5 5 0 0 1 10 0"></path>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"></path><path d="m9 12 2 2 4-4"></path>',
    target: '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1"></circle>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"></path>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"></path><path d="M7 3v6h9V3M8 21v-8h8v8"></path>',
    eyeOff: '<path d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.6 10.6 0 0 1 12 4c7 0 10 8 10 8a16.2 16.2 0 0 1-2.1 3.2M6.6 6.6C3.5 8.6 2 12 2 12s3 8 10 8a9.6 9.6 0 0 0 3.4-.6"></path>',
    x: '<path d="m6 6 12 12M18 6 6 18"></path>'
  };
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.compass}</svg>`;
}

const navItems = [
  ["explore", "compass", "Explore"],
  ["circles", "users", "Circles"],
  ["matches", "users", "Find people"],
  ["requests", "messages", "Requests"],
  ["profile", "user", "My profile"],
  ["impact", "chart", "Pilot impact"]
];

function allPosts() { return [...state.customPosts, ...basePosts]; }
function allCircles() { return [...state.customCircles, ...baseCircles]; }
function selectedPost() { return allPosts().find(post => post.id === state.selectedActivity) || allPosts()[0]; }

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2300);
}

function hero(kicker, title, copy, actions = "", stat = "") {
  return `
    <section class="hero">
      <div class="hero-content">
        <p class="eyebrow">${esc(kicker)}</p>
        <h1>${esc(title)}</h1>
        <p class="hero-copy">${esc(copy)}</p>
        ${actions ? `<div class="hero-actions">${actions}</div>` : ""}
      </div>
      <span class="radar-ring" aria-hidden="true"></span>
      ${stat ? `<div class="hero-stat">${stat}</div>` : ""}
    </section>`;
}

function renderNav() {
  const pendingCount = state.requests.filter(item => item.status === "pending").length;
  const acceptedCircles = state.joinedCircles.length;
  const markup = navItems.map(([id, iconName, label]) => {
    const count = id === "requests" ? pendingCount : id === "circles" ? acceptedCircles : 0;
    return `<button class="nav-item ${state.tab === id ? "active" : ""}" type="button" data-nav="${id}">
      ${icon(iconName)}<span>${label}</span>${count ? `<span class="nav-count">${count}</span>` : ""}
    </button>`;
  }).join("");
  $("#desktopNav").innerHTML = markup;
  $("#mobileNav").innerHTML = markup;
  $$("[data-nav]").forEach(button => button.addEventListener("click", () => switchTab(button.dataset.nav)));
}

function updateChrome() {
  const pendingCount = state.requests.filter(item => item.status === "pending").length;
  const badge = $("#requestBadge");
  badge.textContent = pendingCount;
  badge.hidden = pendingCount === 0;
  $("#weeklyCount").textContent = state.requests.length;
  $("#globalSearch").value = state.query;
  renderNav();
}

function switchTab(tab) {
  state.tab = tab;
  save();
  renderCurrent();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderCurrent() {
  const renderers = {
    explore: renderExplore,
    circles: renderCircles,
    matches: renderMatches,
    requests: renderRequests,
    profile: renderProfile,
    impact: renderImpact
  };
  (renderers[state.tab] || renderExplore)();
}

function typeClass(type) { return "type-" + type.toLowerCase(); }

function renderExplore() {
  const posts = allPosts();
  const query = state.query.trim().toLowerCase();
  const filtered = posts.filter(post => {
    const matchesType = state.filter === "All" || post.type === state.filter;
    const haystack = `${post.title} ${post.detail} ${post.tags.join(" ")} ${post.place}`.toLowerCase();
    return matchesType && haystack.includes(query);
  });

  const actions = `
    <button class="btn btn-primary" type="button" id="heroFind">${icon("users")} Find someone to go with</button>
    <button class="btn btn-ghost-light" type="button" id="openComposer">${icon("send")} Post something</button>`;
  const stat = `<strong>${posts.length}</strong><small>open campus posts</small>`;

  $("#workspace").innerHTML = `<div class="view-stack">
    ${hero("Woxsen University · Pilot", "Do more than notice what is happening.", "Find the next campus activity that fits you, then make it easier to show up with someone new.", actions, stat)}
    <div class="section-heading">
      <div><p>Today at Woxsen</p><h2>Explore with a reason to act</h2></div>
      <div class="filter-row">
        ${["All", "Activity", "Opportunity", "Exchange", "Gig"].map(item =>
          `<button class="filter-chip ${state.filter === item ? "active" : ""}" type="button" data-filter="${item}">${item}</button>`
        ).join("")}
      </div>
    </div>
    ${filtered.length ? `<div class="post-grid">${filtered.map(postCard).join("")}</div>` : `
      <section class="empty-state">${icon("compass")}<h2>No posts match this search</h2><p>Try another keyword or clear the filters to see everything happening around campus.</p><button class="btn btn-outline" type="button" id="clearSearch">Clear search</button></section>`}
  </div>`;

  $("#heroFind").addEventListener("click", () => {
    state.selectedActivity = posts.find(post => post.type === "Activity")?.id || posts[0]?.id;
    switchTab("matches");
  });
  $("#openComposer").addEventListener("click", openComposer);
  $("#clearSearch")?.addEventListener("click", () => {
    state.query = ""; state.filter = "All"; save(); renderExplore();
  });
  $$("[data-filter]").forEach(button => button.addEventListener("click", () => {
    state.filter = button.dataset.filter; save(); renderExplore();
  }));
  $$("[data-open-post]").forEach(button => button.addEventListener("click", () => {
    openPost(allPosts().find(post => post.id === button.dataset.openPost));
  }));
  $$("[data-react]").forEach(button => button.addEventListener("click", async () => {
    const key = `${button.dataset.react}:${button.dataset.emoji}`;
    try {
      const data = await request("/api/interactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "reaction", postId: button.dataset.react, emoji: button.dataset.emoji }) });
      state.reactions[key] = Boolean(data.summaries?.[button.dataset.react]?.myReactions?.includes(button.dataset.emoji));
      save(); renderExplore();
    } catch (error) { showToast(error.message); }
  }));
  $$("[data-comments]").forEach(button => button.addEventListener("click", () => openComments(button.dataset.comments)));
  $$("[data-match-post]").forEach(button => button.addEventListener("click", () => {
    state.selectedActivity = button.dataset.matchPost; save(); switchTab("matches");
  }));
}

function postCard(post) {
  const emojis = ["👍", "❤️", "🎉", "🤝"];
  const comments = state.comments[post.id] || [];
  return `<article class="post-card">
    <div class="card-top">
      <span class="type-chip ${typeClass(post.type)}">${esc(post.type)}</span>
      <button class="open-card" type="button" data-open-post="${post.id}" aria-label="Open ${esc(post.title)}">${icon("upRight")}</button>
    </div>
    <h3>${esc(post.title)}</h3>
    <p class="card-description">${esc(post.detail)}</p>
    <div class="post-meta">
      <span>${icon("calendar")} ${esc(post.time)}</span>
      <span>${icon("pin")} ${esc(post.place)}</span>
    </div>
    <div class="tag-list">${post.tags.map(tag => `<span class="tag">${esc(tag)}</span>`).join("")}</div>
    <div class="card-bottom">
      <div class="reaction-row">
        ${emojis.map(emoji => {
          const active = state.reactions[`${post.id}:${emoji}`];
          return `<button class="reaction-button ${active ? "active" : ""}" type="button" data-react="${post.id}" data-emoji="${emoji}" aria-label="React ${emoji}">${emoji}${active ? " 1" : ""}</button>`;
        }).join("")}
        <button class="comment-button" type="button" data-comments="${post.id}">${icon("comment")} ${comments.length} comments</button>
      </div>
      ${post.type === "Activity"
        ? `<button class="btn btn-outline wide" type="button" data-match-post="${post.id}">${post.count || 1} people looking for company ${icon("arrow")}</button>`
        : `<button class="btn btn-outline wide" type="button" data-open-post="${post.id}">View details ${icon("arrow")}</button>`}
    </div>
  </article>`;
}

function renderCircles() {
  const circles = allCircles();
  const actions = `<button class="btn btn-primary" type="button" id="createCircle">${icon("plus")} Create circle</button>`;
  $("#workspace").innerHTML = `<div class="view-stack">
    ${hero("Circles", "Belong around an interest, not just a classroom.", "Join open communities instantly or request access to smaller private groups. Only accepted memberships can become match reasons.", actions)}
    <div class="circle-summary">
      <span class="summary-pill"><strong>${state.joinedCircles.length}</strong> joined</span>
      <span class="summary-pill"><strong>${state.pendingCircles.length}</strong> pending</span>
    </div>
    <div class="section-heading"><div><p>Discover communities</p><h2>Public and private circles</h2></div></div>
    <div class="circle-grid">
      ${circles.map(circle => {
        const joined = state.joinedCircles.includes(circle.id);
        const pending = state.pendingCircles.includes(circle.id);
        return `<article class="circle-card">
          <div class="card-top">
            <span class="privacy-chip privacy-${circle.visibility}">${icon(circle.visibility === "public" ? "globe" : "lock")} ${circle.visibility === "public" ? "Public" : "Private"}</span>
            <span class="tag">${esc(circle.category)}</span>
          </div>
          <h3>${esc(circle.name)}</h3>
          <p class="card-description">${esc(circle.description)}</p>
          <small>Created by ${esc(circle.creator)}</small>
          <div class="circle-footer">
            <span>${icon("users")} <strong>${circle.members + (joined ? 1 : 0)}</strong> members</span>
            <button class="btn ${joined || pending ? "btn-outline" : "btn-dark"}" type="button" data-circle="${circle.id}">
              ${joined ? "Leave" : pending ? "Request pending" : circle.visibility === "public" ? icon("plus") + " Join" : icon("lock") + " Request access"}
            </button>
          </div>
        </article>`;
      }).join("")}
    </div>
    <section class="content-card">
      <p class="eyebrow" style="color:#7b6994">Member approvals</p>
      <h2 style="margin-top:.5rem">Private access requests</h2>
      <p>No pending requests in your private circles. Any accepted member can review a request.</p>
    </section>
  </div>`;

  $("#createCircle").addEventListener("click", openCircleComposer);
  $$("[data-circle]").forEach(button => button.addEventListener("click", async () => {
    const circle = circles.find(item => item.id === button.dataset.circle);
    const joined = state.joinedCircles.includes(circle.id);
    const pending = state.pendingCircles.includes(circle.id);
    if (pending) return showToast("This access request is already pending.");
    try {
      await request("/api/circles/membership", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: joined ? "leave" : circle.visibility === "private" ? "request" : "join", circleId: circle.id }) });
      await loadCampusData(); save(); renderCircles();
      showToast(joined ? `You left ${circle.name}.` : circle.visibility === "private" ? "Private-circle request sent." : `Joined ${circle.name}.`);
    } catch (error) { showToast(error.message); }
  }));
}

function renderMatches() {
  const activity = selectedPost();
  const joined = state.matchingJoined;
  const actions = `<button class="btn btn-ghost-light" type="button" id="chooseActivity">${icon("back")} Choose another activity</button>`;
  $("#workspace").innerHTML = `<div class="view-stack">
    ${hero("Activity buddy", `People to meet at ${activity.title}`, "Candidates opt in, pass both students’ discovery settings and share a comfortable meeting format.", actions)}
    ${!state.profile.discovery ? `
      <section class="callout warning"><h2>Discovery is paused</h2><p>Turn discovery back on in your profile before joining an activity matching pool.</p><button class="btn btn-outline" type="button" id="openProfile" style="margin-top:.8rem">Open profile</button></section>
    ` : !joined ? `
      <section class="callout"><h2>Join this activity’s matching pool</h2><p>Only other students who also opt into this activity can be suggested. You can leave at any time.</p><button class="btn btn-dark" type="button" id="joinMatching" style="margin-top:.8rem">${icon("users")} I want someone to go with</button></section>
    ` : `
      <div class="match-header">
        <div><p>${demoMatches.length + 1} eligible in this pool</p><h2>Eligible people, ranked by context</h2></div>
        <button class="btn btn-outline" type="button" id="leaveMatching">${icon("x")} Leave matching</button>
      </div>
      <div class="person-list">
        ${demoMatches.map((person, index) => personCard(person, index)).join("")}
      </div>
    `}
  </div>`;

  $("#chooseActivity").addEventListener("click", () => switchTab("explore"));
  $("#openProfile")?.addEventListener("click", () => switchTab("profile"));
  $("#joinMatching")?.addEventListener("click", () => {
    state.matchingJoined = true; save(); renderMatches(); showToast("You joined this activity’s matching pool.");
  });
  $("#leaveMatching")?.addEventListener("click", () => {
    state.matchingJoined = false; save(); renderMatches(); showToast("You left this matching pool.");
  });
  $$("[data-invite]").forEach(button => button.addEventListener("click", () => sendInvite(button.dataset.invite)));
}

function personCard(person, index) {
  const existing = state.requests.find(item => item.personId === person.id && item.direction === "outgoing" && item.status === "pending");
  return `<article class="person-card">
    <span class="person-avatar">${person.initials}</span>
    <div class="person-main">
      <div class="person-title">
        <h3>${esc(person.name)}</h3>
        ${index === 0 ? '<span class="micro-chip strong-chip">Strongest context</span>' : ""}
        <span class="micro-chip example-chip">Example profile</span>
      </div>
      <p class="person-subtitle">${esc(person.course)} · Year ${person.year} · ${esc(person.school)}</p>
      <div class="reasons">${person.reasons.map(reason => `<span class="reason">${icon("check")} ${esc(reason)}</span>`).join("")}</div>
      <label class="message-label">Your first message
        <textarea id="message-${person.id}" maxlength="240">${esc(person.starter)}</textarea>
      </label>
    </div>
    <button class="btn btn-dark" type="button" data-invite="${person.id}" ${existing ? "disabled" : ""}>${existing ? icon("check") + " Sent" : icon("send") + " Invite"}</button>
  </article>`;
}

function sendInvite(personId) {
  const person = demoMatches.find(item => item.id === personId);
  if (!person) return;
  const message = $(`#message-${personId}`)?.value.trim() || person.starter;
  state.requests.unshift({
    id: "r-" + Date.now(),
    personId,
    person: person.name,
    initials: person.initials,
    activity: selectedPost().title,
    message,
    direction: "outgoing",
    status: "pending",
    shared: false,
    created: Date.now()
  });
  save(); renderMatches(); showToast(`Invitation sent to ${person.name}.`);
}

function renderRequests() {
  const incoming = state.requests.filter(item => item.direction === "incoming");
  const outgoing = state.requests.filter(item => item.direction === "outgoing");
  $("#workspace").innerHTML = `<div class="view-stack">
    ${hero("Your introductions", "Keep the first step low pressure.", "Accept or decline privately. College email and social contacts stay private until both people choose to share.")}
    ${state.requests.length === 0 ? `
      <section class="empty-state">${icon("users")}<h2>No invitations yet</h2><p>Start with an activity, then invite someone who has also chosen to join it.</p><button class="btn btn-outline" type="button" id="requestExplore">Explore activities ${icon("arrow")}</button></section>
    ` : `
      ${requestGroup("Incoming", "You decide whether this introduction moves forward.", incoming)}
      ${requestGroup("Sent by you", "The other student can answer without pressure.", outgoing)}
      <section class="callout"><div style="display:flex;gap:.7rem">${icon("shield")}<div><h2>Designed for consent</h2><p>Pending requests can be declined or cancelled. Contacts stay hidden unless both students choose to share.</p></div></div></section>
    `}
  </div>`;
  $("#requestExplore")?.addEventListener("click", () => switchTab("explore"));
  $$("[data-request-action]").forEach(button => button.addEventListener("click", async () => {
    const item = state.requests.find(request => request.id === button.dataset.requestId);
    const action = button.dataset.requestAction;
    if (!item) return;
    const serverAction = action === "share" ? (item.shared ? "revoke-contact" : "share-contact") : action;
    try {
      await request("/api/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: item.id, action: serverAction }) });
      await loadCampusData(); save(); renderRequests(); showToast("Invitation updated.");
    } catch (error) { showToast(error.message); }
  }));
}

function requestGroup(title, copy, requests) {
  if (!requests.length) return "";
  return `<section class="view-stack" style="gap:.75rem">
    <div class="section-heading"><div><h2>${title}</h2><p>${copy}</p></div></div>
    <div class="request-list">${requests.map(requestCard).join("")}</div>
  </section>`;
}

function requestCard(request) {
  const statusClass = request.status === "accepted" ? "status-accepted" : request.status === "pending" ? "status-pending" : "status-declined";
  const statusIcon = request.status === "accepted" ? "check" : request.status === "pending" ? "clock" : "x";
  return `<article class="request-card">
    <div class="request-layout">
      <span class="request-icon">${icon("messages")}</span>
      <div class="request-body">
        <span class="status-chip ${statusClass}">${icon(statusIcon)} ${esc(request.status[0].toUpperCase() + request.status.slice(1))}</span>
        <h3>${request.direction === "incoming" ? esc(request.person) + " invited you" : "Invitation to " + esc(request.person)}</h3>
        <p>${esc(request.activity)}</p>
        <blockquote class="quote">${esc(request.message)}</blockquote>
      </div>
      <div class="request-actions">
        ${request.status === "pending" && request.direction === "incoming" ? `
          <button class="btn btn-outline" type="button" data-request-action="decline" data-request-id="${request.id}">Decline</button>
          <button class="btn btn-dark" type="button" data-request-action="accept" data-request-id="${request.id}">Accept</button>
        ` : ""}
        ${request.status === "pending" && request.direction === "outgoing" ? `
          <button class="btn btn-outline" type="button" data-request-action="cancel" data-request-id="${request.id}">Cancel</button>
        ` : ""}
      </div>
    </div>
    ${request.status === "accepted" ? `
      <div class="callout" style="margin-top:1rem">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:.8rem;flex-wrap:wrap">
          <div><strong>Optional contact exchange</strong><p>${request.shared ? "You chose to share. Waiting for the other student." : "Contacts remain hidden until both students opt in."}</p></div>
          <button class="btn ${request.shared ? "btn-outline" : "btn-primary"}" type="button" data-request-action="share" data-request-id="${request.id}">${request.shared ? "Stop sharing" : icon("contact") + " Share my contacts"}</button>
        </div>
      </div>
    ` : ""}
  </article>`;
}

function renderProfile() {
  const step = state.profileStep;
  const section = profileSections[step];
  const tabs = profileSections.map((item, index) =>
    `<button class="step-tab ${index === step ? "active" : ""}" type="button" data-profile-step="${index}">${index + 1}. ${item.name}</button>`
  ).join("");
  const profileHero = `<section class="hero profile-hero">
    <div class="hero-content"><p class="eyebrow">Your WoxRadar introduction</p><h1>${section.name}</h1><p class="hero-copy">Pick what feels like you. No right or wrong answers. Entertainment and social questions are optional.</p><nav class="step-tabs" aria-label="Profile sections">${tabs}</nav></div>
  </section>`;

  $("#workspace").innerHTML = `<div class="view-stack">
    ${profileHero}
    <div class="progress-dots">${profileSections.map((_, index) => `<span class="${index <= step ? "done" : ""}"></span>`).join("")}</div>
    ${profileStepContent(step, section)}
    <div class="profile-actions">
      <button class="btn btn-outline" type="button" id="profileBack" ${step === 0 ? "disabled" : ""}>${icon("back")} Back</button>
      <div class="action-cluster">
        <button class="btn btn-outline" type="button" id="saveDraft">${icon("save")} Save draft</button>
        <button class="btn btn-dark" type="button" id="profileNext">${step === 4 ? icon("check") + " Finish introduction" : "Save & continue " + icon("arrow")}</button>
      </div>
    </div>
    <section class="content-card">
      <h2>Discovery and blocked students</h2>
      <p>Pause discovery whenever you want. Pending invitations remain visible, but you will not appear in new matches.</p>
      <button class="btn btn-outline" type="button" id="toggleDiscovery">${icon("eyeOff")} ${state.profile.discovery ? "Pause discovery" : "Resume discovery"}</button>
    </section>
  </div>`;

  $$("[data-profile-step]").forEach(button => button.addEventListener("click", () => {
    captureProfileFields(); state.profileStep = Number(button.dataset.profileStep); save(); renderProfile();
  }));
  $$("[data-choice]").forEach(button => button.addEventListener("click", () => {
    const key = button.dataset.choiceKey;
    const value = button.dataset.choice;
    const selected = state.answers[key] || [];
    state.answers[key] = selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value].slice(0, 5);
    save(); renderProfile();
  }));
  $("#profileBack").addEventListener("click", () => {
    captureProfileFields(); state.profileStep = Math.max(0, step - 1); save(); renderProfile();
  });
  $("#saveDraft").addEventListener("click", async () => {
    captureProfileFields();
    try { await saveProfile("draft"); showToast("Draft saved securely."); }
    catch (error) { showToast(error.message); }
  });
  $("#profileNext").addEventListener("click", async () => {
    captureProfileFields();
    if (step < 4) state.profileStep += 1;
    try {
      await saveProfile(step === 4 ? "complete" : "draft");
      renderProfile();
      showToast(step === 4 ? "Introduction completed." : "Profile section saved.");
    } catch (error) { showToast(error.message); }
  });
  $("#toggleDiscovery").addEventListener("click", async () => {
    state.profile.discovery = !state.profile.discovery;
    try { await saveProfile("draft"); renderProfile(); showToast(state.profile.discovery ? "Discovery resumed." : "Discovery paused."); }
    catch (error) { state.profile.discovery = !state.profile.discovery; showToast(error.message); }
  });
  ["profileDiscovery", "shareInterests", "languageMatching"].forEach(id => {
    $(`#${id}`)?.addEventListener("change", event => {
      const key = id === "profileDiscovery" ? "discovery" : id === "shareInterests" ? "shareInterests" : "languageMatching";
      state.profile[key] = event.target.checked; save();
    });
  });
}

function profileStepContent(step, section) {
  if (step === 0) {
    return `<section class="content-card">
      <h2>${section.title}</h2><p>${section.copy}</p>
      <div class="form-grid">
        <label class="field">What should people call you?<input id="profileName" value="${esc(state.profile.name)}" maxlength="70"></label>
        <label class="field">Which school are you in?
          <select id="profileSchool">
            ${["School of Technology", "School of Business", "School of Arts and Design", "School of Law", "School of Sciences"].map(item => `<option ${state.profile.school === item ? "selected" : ""}>${item}</option>`).join("")}
          </select>
        </label>
        <label class="field">Which course are you doing?<input id="profileCourse" value="${esc(state.profile.course)}"></label>
        <label class="field">Which year?
          <select id="profileYear">${["1","2","3","4","5"].map(item => `<option value="${item}" ${state.profile.year === item ? "selected" : ""}>Year ${item}</option>`).join("")}</select>
        </label>
      </div>
      <div class="callout" style="margin-top:1rem">
        <strong>College email · ${state.profile.verified ? "Verified" : "Not verified"}</strong>
        <p>${esc(state.profile.email)}</p>
      </div>
      <div class="form-grid">
        <label class="field">Social account<input id="profileSocial" value="${esc(state.profile.social)}" placeholder="@yourhandle"></label>
      </div>
      <p>Social contacts stay private until both students choose to share.</p>
    </section>`;
  }
  if (step > 0 && step < 4) {
    const selected = state.answers[section.key] || [];
    return `<section class="content-card">
      <h2>${section.title}</h2><p>${section.copy}</p>
      <div class="choice-grid">${section.choices.map(choice => `
        <button class="choice ${selected.includes(choice) ? "selected" : ""}" type="button" data-choice-key="${section.key}" data-choice="${esc(choice)}">${esc(choice)}</button>
      `).join("")}</div>
    </section>`;
  }
  return `<section class="content-card">
    <h2>${section.title}</h2><p>${section.copy}</p>
    <dl class="review-grid">
      <div><dt>Campus</dt><dd>${esc(state.profile.name)} · ${esc(state.profile.school)} · ${esc(state.profile.course)} · Year ${esc(state.profile.year)}</dd></div>
      <div><dt>College email</dt><dd>${state.profile.verified ? "Verified" : "Not verified"}</dd></div>
      <div><dt>Entertainment</dt><dd>${esc(state.answers.entertainment.join(", ") || "Not answered")}</dd></div>
      <div><dt>Here for</dt><dd>${esc(state.answers.interests.join(", ") || "Not answered")}</dd></div>
      <div><dt>First hello</dt><dd>${esc(state.answers.communication.join(", ") || "Not answered")}</dd></div>
      <div><dt>Private contact</dt><dd>${esc(state.profile.social || "Not added")}</dd></div>
    </dl>
  </section>
  <section class="content-card">
    <h2>Your choices, your privacy</h2>
    <p>Gender, background, communication answers and contacts are never displayed on match cards.</p>
    <label class="consent"><input id="profileDiscovery" type="checkbox" ${state.profile.discovery ? "checked" : ""}>Let verified students discover me in activities I join</label>
    <label class="consent"><input id="shareInterests" type="checkbox" ${state.profile.shareInterests ? "checked" : ""}>Use selected entertainment and hobbies as shared reasons</label>
    <label class="consent"><input id="languageMatching" type="checkbox" ${state.profile.languageMatching ? "checked" : ""}>Use my chatting languages for matching</label>
  </section>`;
}

function captureProfileFields() {
  if ($("#profileName")) state.profile.name = $("#profileName").value.trim() || state.profile.name;
  if ($("#profileSchool")) state.profile.school = $("#profileSchool").value;
  if ($("#profileCourse")) state.profile.course = $("#profileCourse").value.trim();
  if ($("#profileYear")) state.profile.year = $("#profileYear").value;
  if ($("#profileSocial")) state.profile.social = $("#profileSocial").value.trim();
}

function profilePayload(intent = "draft") {
  const social = state.profile.social.toLowerCase();
  const platform = social.includes("linkedin.com") ? "LinkedIn" : social.includes("snapchat.com") ? "Snapchat" : social.includes("threads.") ? "Threads" : social.startsWith("https://") && !social.includes("instagram.com") ? "Other" : "Instagram";
  const socialContacts = state.profile.social ? [{ platform, value: state.profile.social }] : [];
  const previous = viewer?.preferences || {};
  return {
    displayName: state.profile.name,
    school: state.profile.school,
    course: state.profile.course,
    year: state.profile.year,
    interests: state.answers.interests,
    skills: viewer?.skills || [],
    availability: viewer?.availability?.length ? viewer.availability : ["Friday evening"],
    meetingFormats: viewer?.meetingFormats?.length ? viewer.meetingFormats : ["Small group"],
    discoveryScope: viewer?.discoveryScope || "all",
    discoveryEnabled: state.profile.discovery,
    socialContacts,
    onboardingStep: state.profileStep,
    preferences: {
      ...previous,
      shareEntertainment: state.profile.shareInterests,
      languageMatchingOptIn: state.profile.languageMatching,
      answers: {
        ...(previous.answers || {}),
        "11": state.answers.entertainment,
        "43": state.answers.communication
      },
      goals: previous.goals || [], learnNext: previous.learnNext || [], socialEnergy: previous.socialEnergy || "",
      planStyle: previous.planStyle || "", groupSize: previous.groupSize || "", topics: previous.topics || [],
      icebreakerPrompt: previous.icebreakerPrompt || "", icebreakerAnswer: previous.icebreakerAnswer || "",
      shareIcebreaker: Boolean(previous.shareIcebreaker)
    },
    intent
  };
}

async function saveProfile(intent = "draft") {
  const data = await request("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profilePayload(intent))
  });
  applyViewer(data.profile);
  save();
}

function renderImpact() {
  const reactionTotal = Object.values(state.reactions).filter(Boolean).length;
  const commentTotal = Object.values(state.comments).reduce((sum, comments) => sum + comments.length, 0);
  const accepted = state.requests.filter(item => item.status === "accepted").length;
  const targets = [
    ["Completed profiles", state.profileStep === 4 ? 1 : 0, 1],
    ["Joined activity matching", state.matchingJoined ? 1 : 0, 1],
    ["Real invitations", state.requests.length, 3],
    ["Accepted introductions", accepted, 2],
    ["Campus interactions", reactionTotal + commentTotal, 5]
  ];
  const actions = state.requests.length + reactionTotal + commentTotal + state.joinedCircles.length;
  $("#workspace").innerHTML = `<div class="view-stack">
    ${hero("Pilot evidence", "Measure useful connections, not vanity.", "This static submission demonstrates the same evidence flow using actions saved in this browser.")}
    <section class="metric-grid">
      ${metricCard("users", state.joinedCircles.length + (state.matchingJoined ? 1 : 0), "Active participation")}
      ${metricCard("check", state.requests.length ? Math.round(accepted / state.requests.length * 100) + "%" : "—", "Invitation acceptance")}
      ${metricCard("shield", actions, "Saved demo actions")}
    </section>
    <section class="content-card">
      <div style="display:flex;align-items:center;gap:.65rem">${icon("target")}<div><h2>Minimum convincing pilot</h2><p style="margin:.2rem 0 0">Small enough to finish; strong enough to support the submission story.</p></div></div>
      <div class="target-list">
        ${targets.map(([label, value, target], index) => `<div class="target-row">
          <span class="target-number ${value >= target ? "done" : ""}">${value >= target ? icon("check") : index + 1}</span>
          <div><div class="target-label"><strong>${label}</strong><span>${value}/${target}</span></div><div class="target-bar"><div class="target-fill" style="width:${Math.min(100, value / target * 100)}%"></div></div></div>
        </div>`).join("")}
      </div>
    </section>
    <section class="callout warning"><h2>How to read this honestly</h2><p>This page counts only actions you perform in this HTML/CSS/JavaScript demo. The hosted full-stack version connects these flows to authenticated users and a database.</p></section>
  </div>`;
}

function metricCard(iconName, value, label) {
  return `<article class="metric-card"><span class="metric-icon">${icon(iconName)}</span><strong>${value}</strong><p>${label}</p></article>`;
}

function openModal(markup) {
  $("#modalContent").innerHTML = markup;
  $("#appModal").showModal();
}

function closeModal() { $("#appModal").close(); }

function openPost(post) {
  if (!post) return;
  openModal(`<div class="modal-head"><span class="type-chip ${typeClass(post.type)}">${esc(post.type)}</span><h2 style="margin-top:.8rem">${esc(post.title)}</h2><p>${esc(post.detail)}</p></div>
    <div class="post-meta" style="margin-top:1rem"><span>${icon("calendar")} ${esc(post.time)}</span><span>${icon("pin")} ${esc(post.place)}</span></div>
    <div class="tag-list">${post.tags.map(tag => `<span class="tag">${esc(tag)}</span>`).join("")}</div>
    <div class="modal-actions"><button class="btn btn-outline" type="button" data-modal-close>Close</button>${post.type === "Activity" ? `<button class="btn btn-dark" type="button" id="detailMatch">${icon("users")} Find people</button>` : ""}</div>`);
  $("[data-modal-close]").addEventListener("click", closeModal);
  $("#detailMatch")?.addEventListener("click", () => {
    state.selectedActivity = post.id; save(); closeModal(); switchTab("matches");
  });
}

async function openComments(postId) {
  const post = allPosts().find(item => item.id === postId);
  let comments = [];
  try { comments = (await request(`/api/interactions?postId=${encodeURIComponent(postId)}`)).comments || []; }
  catch (error) { showToast(error.message); }
  openModal(`<div class="modal-head"><h2>Comments</h2><p>${esc(post.title)}</p></div>
    <div class="comment-list">
      ${comments.length ? comments.map(comment => `<article class="comment"><span class="person-avatar">${esc(comment.authorInitials || "CM")}</span><div><strong>${esc(comment.authorName || "Campus member")}</strong><p>${esc(comment.body)}</p></div></article>`).join("") : `<section class="empty-state" style="padding:1.5rem">${icon("comment")}<h2>Start the conversation</h2><p>Ask a useful question or share something others should know.</p></section>`}
    </div>
    <form class="modal-form" id="commentForm">
      <label class="field">Add a comment<textarea id="commentText" required maxlength="400" placeholder="Write your comment…"></textarea></label>
      <div class="modal-actions"><button class="btn btn-outline" type="button" data-modal-close>Cancel</button><button class="btn btn-dark" type="submit">${icon("send")} Comment</button></div>
    </form>`);
  $("[data-modal-close]").addEventListener("click", closeModal);
  $("#commentForm").addEventListener("submit", async event => {
    event.preventDefault();
    const value = $("#commentText").value.trim();
    if (!value) return;
    try {
      await request("/api/interactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "comment", postId, body: value }) });
      closeModal(); renderExplore(); showToast("Comment added.");
    } catch (error) { showToast(error.message); }
  });
}

function openComposer() {
  openModal(`<div class="modal-head"><h2>Post to WoxRadar</h2><p>Add one specific activity, opportunity, exchange listing or small gig.</p></div>
    <form class="modal-form" id="postForm">
      <label class="field">Post type<select name="type"><option>Activity</option><option>Opportunity</option><option>Exchange</option><option>Gig</option></select></label>
      <label class="field">Title<input name="title" required maxlength="90" placeholder="What is happening?"></label>
      <label class="field">Details<textarea name="detail" required maxlength="360" placeholder="What should someone know before acting?"></textarea></label>
      <div class="form-grid" style="margin-top:0">
        <label class="field">Date, time or deadline<input name="time" required placeholder="Fri · 4:30 PM"></label>
        <label class="field">Venue or pickup area<input name="place" required placeholder="Innovation Lab"></label>
      </div>
      <label class="field">Tags<input name="tags" placeholder="AI, Design, Build"></label>
      <div class="modal-actions"><button class="btn btn-outline" type="button" data-modal-close>Cancel</button><button class="btn btn-dark" type="submit">${icon("send")} Publish post</button></div>
    </form>`);
  $("[data-modal-close]").addEventListener("click", closeModal);
  $("#postForm").addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const post = {
      id: "p-" + Date.now(),
      type: data.get("type"),
      title: data.get("title").trim(),
      detail: data.get("detail").trim(),
      time: data.get("time").trim(),
      place: data.get("place").trim(),
      tags: data.get("tags").split(",").map(item => item.trim()).filter(Boolean).slice(0, 5),
      count: 1
    };
    try {
      const data = await request("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(post) });
      state.customPosts.unshift(data.post);
      save(); closeModal(); renderExplore(); showToast("Post published to WoxRadar.");
    } catch (error) { showToast(error.message); }
  });
}

function openCircleComposer() {
  openModal(`<div class="modal-head"><h2>Create a circle</h2><p>Choose whether students can join immediately or must be approved.</p></div>
    <form class="modal-form" id="circleForm">
      <label class="field">Circle name<input name="name" required maxlength="70" placeholder="Circle name"></label>
      <label class="field">Description<textarea name="description" required maxlength="280" placeholder="What brings this group together?"></textarea></label>
      <div class="form-grid" style="margin-top:0">
        <label class="field">Category<select name="category"><option>Technology</option><option>Creative</option><option>Research</option><option>Entrepreneurship</option><option>Sports</option><option>General</option></select></label>
        <label class="field">Visibility<select name="visibility"><option value="public">Public · instant join</option><option value="private">Private · approval required</option></select></label>
      </div>
      <div class="modal-actions"><button class="btn btn-outline" type="button" data-modal-close>Cancel</button><button class="btn btn-dark" type="submit">${icon("plus")} Create circle</button></div>
    </form>`);
  $("[data-modal-close]").addEventListener("click", closeModal);
  $("#circleForm").addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const circle = {
      id: "c-" + Date.now(), name: data.get("name").trim(), description: data.get("description").trim(),
      category: data.get("category"), visibility: data.get("visibility"), creator: "You", members: 1
    };
    try {
      await request("/api/circles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(circle) });
      await loadCampusData(); save(); closeModal(); renderCircles(); showToast("Circle created.");
    } catch (error) { showToast(error.message); }
  });
}

$("#modalClose").addEventListener("click", closeModal);
$("#appModal").addEventListener("click", event => {
  if (event.target === $("#appModal")) closeModal();
});

$$("[data-go]").forEach(button => button.addEventListener("click", () => switchTab(button.dataset.go)));
$("#globalSearch").addEventListener("input", event => {
  state.query = event.target.value;
  state.tab = "explore";
  save();
  renderExplore();
});
$$("[data-quick]").forEach(button => button.addEventListener("click", () => {
  state.query = button.dataset.quick;
  state.tab = "explore";
  save();
  renderExplore();
}));

boot();
