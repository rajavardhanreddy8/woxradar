export const socialPlatforms = ["Instagram", "WhatsApp", "Snapchat", "Threads", "LinkedIn", "Other"];
export function socialHref(contact) {
    const raw = contact.value.trim();
    if (contact.platform === "WhatsApp") {
        let phone = raw.replace(/[\s()+-]/g, "");
        if (raw.startsWith("https://")) {
            try {
                const u = new URL(raw);
                if (u.hostname === "wa.me")
                    phone = u.pathname.slice(1);
                else if (u.hostname === "api.whatsapp.com" && u.pathname === "/send")
                    phone = u.searchParams.get("phone") ?? "";
                else
                    return null;
            }
            catch {
                return null;
            }
        }
        return /^[1-9]\d{6,14}$/.test(phone) ? `https://wa.me/${phone}` : null;
    }
    const handles = { Instagram: { host: "www.instagram.com", path: "/", test: /^[a-zA-Z0-9_][a-zA-Z0-9._]{0,29}$/ }, Snapchat: { host: "www.snapchat.com", path: "/add/", test: /^[a-zA-Z][a-zA-Z0-9._-]{1,13}[a-zA-Z0-9]$/ }, Threads: { host: "www.threads.com", path: "/@", test: /^[a-zA-Z0-9_][a-zA-Z0-9._]{0,29}$/ } };
    if (!raw.startsWith("https://")) {
        const h = handles[contact.platform], name = raw.replace(/^@/, "");
        return h && h.test.test(name) ? `https://${h.host}${h.path}${encodeURIComponent(name)}` : null;
    }
    try {
        const u = new URL(raw);
        if (u.protocol !== "https:" || u.username || u.password || u.port)
            return null;
        const host = u.hostname.toLowerCase().replace(/^www\./, "");
        if (contact.platform === "LinkedIn")
            return host === "linkedin.com" && /^\/in\/[a-zA-Z0-9_%.-]+\/?$/.test(u.pathname) ? `https://www.linkedin.com${u.pathname}` : null;
        const h = handles[contact.platform];
        if (h) {
            const hosts = contact.platform === "Threads" ? ["threads.com", "threads.net"] : [h.host.replace(/^www\./, "")];
            if (!hosts.includes(host))
                return null;
            const prefix = h.path, name = u.pathname.slice(prefix.length).replace(/\/$/, "");
            return u.pathname.startsWith(prefix) && h.test.test(name) ? `https://${h.host}${prefix}${encodeURIComponent(name)}` : null;
        }
        if (contact.platform === "Other" && host.includes(".") && !/^(localhost|127\.|0\.|169\.254\.|10\.|192\.168\.)/.test(host))
            return u.href;
        return null;
    }
    catch {
        return null;
    }
}
