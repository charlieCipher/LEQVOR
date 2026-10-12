const fields = new Set([
  "event_code",
  "request_id",
  "record_id",
  "device_id",
  "timestamp",
  "severity",
  "operation",
]);
export function sanitizeEvent(input) {
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!fields.has(key)) continue;
    if (typeof value !== "string") continue;
    if (key === "severity" && !["INFO", "WARNING", "CRITICAL"].includes(value))
      continue;
    if (
      /^(record|device|request)_id$/.test(key) &&
      !/^[-a-zA-Z0-9]{1,64}$/.test(value)
    )
      continue;
    if (
      ["event_code", "operation"].includes(key) &&
      !/^[-A-Z_]{1,64}$/.test(value)
    )
      continue;
    if (key === "timestamp" && !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value))
      continue;
    out[key] = value;
  }
  return out;
}
export class AurevaError extends Error {
  constructor(code, message = "This operation could not be completed safely.") {
    super(message);
    this.name = "AurevaError";
    this.code = code;
  }
}
export function safeFailure(error) {
  if (['40001','PT409'].includes(error?.code))
    return 'This record changed in another session. Reload the latest version before making changes.';
  if (error instanceof AurevaError) return error.message;
  if (error?.name === "OperationError")
    return "The secret is incorrect or this encrypted information could not be verified.";
  if (/schema cache|does not exist|PGRST205/.test(error?.message || ""))
    return "Your vault database needs an update. Contact the account administrator.";
  return "This operation could not be completed. Check your connection and try again.";
}
