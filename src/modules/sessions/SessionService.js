import { getTrustedDeviceSummary } from "./DeviceTrust";

export const sessionService = {
  getTrustedDeviceState() {
    const summary = getTrustedDeviceSummary();
    return {
      ...summary,
      risk: "Unavailable",
    };
  },
};
