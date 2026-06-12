import Crosmos from "crosmos";
import { getApiKey, getBaseUrl } from "./credentials.js";

export function createClient(timeoutMs: number): Crosmos | null {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    return new Crosmos({ apiKey, baseURL: getBaseUrl(), timeout: timeoutMs, maxRetries: 0 });
}
