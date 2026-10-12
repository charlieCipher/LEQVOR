export function getShieldStatus() {
  return {
    status: "Unavailable",
    enabled: false,
    label: "Shield approvals unavailable",
    notes: ["A general server-enforced Shield approval policy is not configured."],
  };
}
