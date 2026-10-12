export function getTrustedDeviceSummary() {
  return {
    status: "UNAVAILABLE",
    trusted: false,
    activeDevices: null,
    trustedDeviceLabel: "Verified device enrollment unavailable",
    method: null,
  };
}
