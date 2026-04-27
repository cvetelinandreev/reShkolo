/**
 * Dev-oriented server logs. Wasp prints these on the Node process stdout
 * (the terminal where `wasp start` runs, or `logs/wasp-dev.log` if started via `npm run wasp:log`).
 */
const PREFIX = "[reShkolo]";

export function devServerLog(event: string, details?: Record<string, unknown>): void {
  if (details && Object.keys(details).length > 0) {
    console.log(PREFIX, event, details);
  } else {
    console.log(PREFIX, event);
  }
}
