package com.lenvor.leqvor.founder;

/** Public capability checks only. No private keys, device IDs or bypass. */
final class HardwarePolicy {
    static void require(boolean secureLevel,boolean authenticationRequired,int validitySeconds,boolean hardwareEnforced,boolean privateExportable,boolean acceptedAuthenticationType,String level,int authenticationType){
        // KeyInfo's legacy documentation says -1, but Android 15 Keystore2
        // initializes this value to 0 when AUTH_TIMEOUT is absent and returns
        // it unchanged. Both represent per-operation auth; positive timeouts
        // grant an authentication window and remain forbidden here.
        if(secureLevel&&authenticationRequired&&(validitySeconds==-1||validitySeconds==0)&&hardwareEnforced&&!privateExportable&&acceptedAuthenticationType)return;
        throw new IllegalArgumentException("Hardware checks failed: level="+level+", auth_required="+authenticationRequired+", validity_seconds="+validitySeconds+", auth_hardware_enforced="+hardwareEnforced+", private_exportable="+privateExportable+", auth_type="+authenticationType+", accepted_auth_type="+acceptedAuthenticationType+". Signing remains blocked; no software fallback.");
    }
}
