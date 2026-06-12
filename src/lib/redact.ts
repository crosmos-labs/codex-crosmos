const PATTERNS = [
    /csk_[A-Za-z0-9_-]{12,}/g,
    /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g,
    /\bbearer\s+[\w.-]+/gi,
    /\b(?:api[-_]?key|authorization|token|secret|password)\b\s*[:=]\s*\S+/gi,
];

export function redact(text: string): string {
    let out = text;
    for (const re of PATTERNS) out = out.replace(re, "[redacted]");
    return out;
}

export function hasSecret(text: string): boolean {
    return PATTERNS.some((re) => {
        re.lastIndex = 0;
        return re.test(text);
    });
}
