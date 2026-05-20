// Date helpers, all anchored to 3DTS's home timezone (Pacific time).
// SQLite's CURRENT_TIMESTAMP stamps in UTC; we convert to Pacific
// for display so the user never sees a date that's "off by one".

export const PROJECT_TZ = "America/Los_Angeles";

const dateFmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: PROJECT_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
});

const dateTimeFmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: PROJECT_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
});

/** Today's date in YYYY-MM-DD form, evaluated in Pacific time. */
export function todayIso(): string {
    return dateFmt.format(new Date());
}

/**
 * Convert a SQLite-style UTC timestamp ("2026-05-20 04:30:15") to a
 * California date "YYYY-MM-DD". Returns "" on bad/empty input.
 */
export function caDate(utcTimestamp: string | null | undefined): string {
    if (!utcTimestamp) return "";
    const d = parseSqliteUtc(utcTimestamp);
    return d ? dateFmt.format(d) : "";
}

/** Same as caDate but includes time: "YYYY-MM-DD HH:MM". */
export function caDateTime(utcTimestamp: string | null | undefined): string {
    if (!utcTimestamp) return "";
    const d = parseSqliteUtc(utcTimestamp);
    return d ? dateTimeFmt.format(d) : "";
}

function parseSqliteUtc(s: string): Date | null {
    // "2026-05-20 04:30:15" → "2026-05-20T04:30:15Z" so the Date
    // constructor parses it as UTC and not as the host's local time.
    const iso = s.includes("T") ? s : s.replace(" ", "T");
    const withZ = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + "Z";
    const d = new Date(withZ);
    return isNaN(d.getTime()) ? null : d;
}
