package com.lenvor.leqvor.founder;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import org.json.JSONObject;
import org.json.JSONArray;
import android.content.Context;
import java.security.KeyFactory;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.SecureRandom;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;

final class HardwareSigner {
    private static final String ALIAS="leqvor-founder-slot-B-v1";
    private static KeyStore store() throws Exception {KeyStore s=KeyStore.getInstance("AndroidKeyStore");s.load(null);return s;}
    static synchronized JSONObject existingPublicEvidence(Context context) throws Exception {Protocol.require(store().containsAlias(ALIAS),"Existing phone key required; test never creates a key");return createOrInspect(context);}
    static synchronized JSONObject createOrInspect(Context context) throws Exception {
        KeyStore s=store();
        if(!s.containsAlias(ALIAS)) {
            byte[] challenge=new byte[32];new SecureRandom().nextBytes(challenge);
            KeyPairGenerator generator=KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC,"AndroidKeyStore");
            generator.initialize(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setUserAuthenticationRequired(true)
                .setUserAuthenticationParameters(0,KeyProperties.AUTH_BIOMETRIC_STRONG|KeyProperties.AUTH_DEVICE_CREDENTIAL)
                .setAttestationChallenge(challenge)
                .build());
            generator.generateKeyPair();
            Protocol.require(context.getSharedPreferences("public-key-evidence",Context.MODE_PRIVATE).edit().putString("challenge",Base64.getEncoder().encodeToString(challenge)).commit(),"Local public challenge metadata could not be saved; existing key retained");
        }
        assertHardware(s);
        byte[] publicKey=s.getCertificate(ALIAS).getPublicKey().getEncoded();
        JSONObject pin=new JSONObject().put("slot","B").put("algorithm","ES256").put("spki",Base64.getEncoder().encodeToString(publicKey)).put("key_id",Protocol.digest(publicKey));
        JSONArray certificates=new JSONArray();for(java.security.cert.Certificate certificate:s.getCertificateChain(ALIAS))certificates.put(Base64.getEncoder().encodeToString(certificate.getEncoded()));
        return new JSONObject().put("domain","leqvor-founder-device-evidence-v1").put("credential",pin).put("attestation_challenge",context.getSharedPreferences("public-key-evidence",Context.MODE_PRIVATE).getString("challenge",null)).put("certificate_chain",certificates).put("independently_verified",false);
    }
    private static void assertHardware(KeyStore s) throws Exception {
        PrivateKey key=(PrivateKey)s.getKey(ALIAS,null);
        KeyInfo info=KeyFactory.getInstance(key.getAlgorithm(),"AndroidKeyStore").getKeySpec(key,KeyInfo.class);
        int level=info.getSecurityLevel(),type=info.getUserAuthenticationType(),allowed=KeyProperties.AUTH_BIOMETRIC_STRONG|KeyProperties.AUTH_DEVICE_CREDENTIAL;
        String name=level==KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT?"TEE":level==KeyProperties.SECURITY_LEVEL_STRONGBOX?"STRONGBOX":"UNVERIFIED("+level+")";
        HardwarePolicy.require(level==KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT||level==KeyProperties.SECURITY_LEVEL_STRONGBOX,info.isUserAuthenticationRequired(),info.getUserAuthenticationValidityDurationSeconds(),info.isUserAuthenticationRequirementEnforcedBySecureHardware(),key.getEncoded()!=null,(type&allowed)!=0&&(type&~allowed)==0,name,type);
    }
    static Signature prepare(String expectedKeyId) throws Exception {
        KeyStore s=store();Protocol.require(s.containsAlias(ALIAS),"Create and independently enroll the phone key first");assertHardware(s);
        Protocol.require(Protocol.digest(s.getCertificate(ALIAS).getPublicKey().getEncoded()).equals(expectedKeyId),"Local key does not match independent policy");
        Signature signature=Signature.getInstance("SHA256withECDSA");signature.initSign((PrivateKey)s.getKey(ALIAS,null));return signature;
    }
    static byte[] p1363(byte[] der) {
        // Encoding conversion only: ECDSA itself is performed by Android Keystore.
        Protocol.require(der.length>=8 && der.length<=72 && (der[0]&255)==48 && (der[1]&255)==der.length-2,"Invalid DER signature");
        byte[] output=new byte[64];int offset=2;
        for(int component=0;component<2;component++) {
            Protocol.require(offset+2<=der.length && (der[offset++]&255)==2,"Invalid signature component");
            int length=der[offset++]&255;Protocol.require(length>0 && length<=33 && offset+length<=der.length,"Invalid signature length");
            Protocol.require((der[offset]&128)==0,"Negative signature component");
            if(length>1 && der[offset]==0){Protocol.require((der[offset+1]&128)!=0,"Noncanonical signature");offset++;length--;}
            Protocol.require(length<=32,"Oversized signature component");
            System.arraycopy(der,offset,output,component*32+32-length,length);offset+=length;
        }
        Protocol.require(offset==der.length,"Trailing signature data");return output;
    }
}
