package com.lenvor.leqvor.founder;

import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.KeyFactory;
import java.security.interfaces.ECPublicKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;

/** Public protocol only; neither parses nor exports a private key. */
public final class Protocol {
    private Protocol() {}
    public static final List<String> ACTIONS = Arrays.asList(
        "REMOVE_FOUNDER_ROOT", "DISABLE_FOUNDER_PROTECTION", "TRANSFER_PLATFORM_OWNERSHIP",
        "REPLACE_FOUNDER_IDENTITY", "CHANGE_ROOT_POLICY", "CHANGE_ROOT_THRESHOLD",
        "TRANSFER_CRITICAL_INFRASTRUCTURE", "DELETE_GOVERNANCE_CONFIGURATION",
        "GOVERNANCE_FREEZE", "GOVERNANCE_UNFREEZE", "CANCEL_GOVERNANCE_REQUEST");
    public static void require(boolean ok, String message) { if (!ok) throw new IllegalArgumentException(message); }
    public static void exact(JSONObject value, String... fields) {
        require(value.length() == fields.length, "Unexpected packet fields");
        for (String field : fields) require(value.has(field), "Missing field: " + field);
    }
    public static String string(JSONObject value, String key) throws Exception {
        Object v = value.get(key); require(v instanceof String, "Expected text: " + key); return (String)v;
    }
    public static long integer(JSONObject value, String key) throws Exception {
        Object v = value.get(key); require(v instanceof Integer || v instanceof Long, "Expected integer: " + key);
        long n = ((Number)v).longValue(); require(Math.abs(n) <= 9007199254740991L, "Unsafe integer"); return n;
    }
    private static long index(String key) {
        try { long n = Long.parseLong(key); return n >= 0 && n < 4294967295L && Long.toString(n).equals(key) ? n : -1; }
        catch (NumberFormatException e) { return -1; }
    }
    public static String quote(String text) {
        StringBuilder out = new StringBuilder("\"");
        for (int i=0; i<text.length(); i++) {
            char c=text.charAt(i);
            if (Character.isHighSurrogate(c)) {
                require(i+1<text.length() && Character.isLowSurrogate(text.charAt(i+1)), "Invalid Unicode");
                out.append(c).append(text.charAt(++i)); continue;
            }
            require(!Character.isLowSurrogate(c), "Invalid Unicode");
            switch(c) {
                case '"': out.append("\\\""); break;
                case '\\': out.append("\\\\"); break;
                case '\b': out.append("\\b"); break;
                case '\f': out.append("\\f"); break;
                case '\n': out.append("\\n"); break;
                case '\r': out.append("\\r"); break;
                case '\t': out.append("\\t"); break;
                default: if(c<32) out.append(String.format("\\u%04x",(int)c)); else out.append(c);
            }
        }
        return out.append('"').toString();
    }
    public static String canonical(Object value) throws Exception {
        if(value==null || value==JSONObject.NULL) return "null";
        if(value instanceof String) return quote((String)value);
        if(value instanceof Boolean) return value.toString();
        if(value instanceof Integer || value instanceof Long) {
            long n=((Number)value).longValue(); require(Math.abs(n)<=9007199254740991L,"Unsafe integer"); return Long.toString(n);
        }
        if(value instanceof JSONArray) {
            JSONArray array=(JSONArray)value; List<String> parts=new ArrayList<>();
            for(int i=0;i<array.length();i++) parts.add(canonical(array.get(i)));
            return "["+String.join(",",parts)+"]";
        }
        require(value instanceof JSONObject,"Unsupported canonical value");
        JSONObject object=(JSONObject)value; List<String> keys=new ArrayList<>(); object.keys().forEachRemaining(keys::add);
        keys.sort((a,b)-> {long ai=index(a),bi=index(b); if(ai>=0 && bi>=0)return Long.compare(ai,bi); if(ai>=0)return -1;if(bi>=0)return 1;return a.compareTo(b);});
        List<String> parts=new ArrayList<>(); for(String key:keys)parts.add(quote(key)+":"+canonical(object.get(key)));
        return "{"+String.join(",",parts)+"}";
    }
    public static String digest(byte[] bytes) throws Exception {
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(bytes); StringBuilder out=new StringBuilder();
        for(byte b:hash)out.append(String.format("%02x",b&255)); return out.toString();
    }
    public static String hash(Object value) throws Exception { return digest(canonical(value).getBytes(StandardCharsets.UTF_8)); }
    public static boolean hex(String value) {return value.matches("[a-f0-9]{64}");}
    public static void validatePolicy(JSONObject policy) throws Exception {
        exact(policy,"domain","platform","threshold","cooling_ms","credentials");
        require(string(policy,"domain").equals("leqvor-founder-policy-v1") && string(policy,"platform").equals("leqvor.vercel.app") && integer(policy,"threshold")==2 && integer(policy,"cooling_ms")==259200000L,"Unsupported root policy");
        JSONArray credentials=policy.getJSONArray("credentials"); require(credentials.length()==3,"Three independent keys required");
        HashSet<String> slots=new HashSet<>(),ids=new HashSet<>();
        for(int i=0;i<3;i++) {
            JSONObject pin=credentials.getJSONObject(i); exact(pin,"slot","key_id","algorithm","spki");
            String slot=string(pin,"slot"),id=string(pin,"key_id"),algorithm=string(pin,"algorithm"),spki=string(pin,"spki");
            require(Arrays.asList("A","B","C").contains(slot) && slots.add(slot) && ids.add(id) && hex(id),"Duplicate or invalid pin");
            require(spki.length()<=2048 && Arrays.asList("ES256","RS256").contains(algorithm),"Unsupported key");
            byte[] der=Base64.getDecoder().decode(spki);
            require(Base64.getEncoder().encodeToString(der).equals(spki) && digest(der).equals(id),"Invalid public fingerprint");
            java.security.PublicKey key=KeyFactory.getInstance(algorithm.equals("ES256")?"EC":"RSA").generatePublic(new X509EncodedKeySpec(der));
            if(algorithm.equals("ES256")) {
                ECPublicKey ec=(ECPublicKey)key;
                require(ec.getParams().getCurve().getField().getFieldSize()==256 && ec.getParams().getOrder().toString(16).equals("ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551"),"P-256 required");
            } else require(((RSAPublicKey)key).getModulus().bitLength()>=2048,"RSA key too small");
        }
    }
    public static JSONObject credential(JSONObject policy,String slot) throws Exception {
        JSONArray pins=policy.getJSONArray("credentials");for(int i=0;i<pins.length();i++)if(string(pins.getJSONObject(i),"slot").equals(slot))return pins.getJSONObject(i);
        throw new IllegalArgumentException("Unregistered slot");
    }
    public static void validateRequest(JSONObject request,JSONObject policy,long version,long now) throws Exception {
        exact(request,"domain","platform","action","target","request_id","nonce","created_at","expires_at","governance_version","policy_hash","phase","proposal_hash");
        require(string(request,"domain").equals("leqvor-founder-request-v1") && string(request,"platform").equals(string(policy,"platform")) && ACTIONS.contains(string(request,"action")) && hex(string(request,"target")) && hex(string(request,"nonce")) && string(request,"request_id").matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}") && integer(request,"governance_version")==version && string(request,"policy_hash").equals(hash(policy)),"Request does not match current authority");
        String phase=string(request,"phase");require((phase.equals("PROPOSE")&&request.isNull("proposal_hash"))||(phase.equals("CONFIRM")&&hex(string(request,"proposal_hash"))),"Invalid proposal binding");
        String created=string(request,"created_at"),expires=string(request,"expires_at");
        require(created.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z") && expires.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z"),"Invalid timestamp format");
        long start=Instant.parse(created).toEpochMilli(),end=Instant.parse(expires).toEpochMilli();
        require(start<=now+30000 && end>now && end>start && end-start<=600000,"Approval challenge expired or invalid");
    }
    public static byte[] commitment(JSONObject request,String keyId) throws Exception {
        JSONObject value=new JSONObject();value.put("domain","leqvor-founder-approval-v1");value.put("request",request);value.put("signer_key_id",keyId);
        return canonical(value).getBytes(StandardCharsets.UTF_8);
    }
    public static void snapshot(JSONObject state,JSONObject checkpoint,JSONObject policy) throws Exception {
        exact(state,"policy","version","frozen","requests","audit");
        require(hash(state.get("policy")).equals(hash(policy))&&integer(state,"version")==integer(checkpoint,"version")&&state.get("frozen") instanceof Boolean,"Snapshot authority mismatch");
        state.getJSONObject("requests");
        JSONObject content=new JSONObject().put("policy",state.get("policy")).put("version",state.get("version")).put("frozen",state.get("frozen")).put("requests",state.get("requests"));
        require(hash(content).equals(string(checkpoint,"state_hash")),"Independent state checkpoint mismatch");
        JSONArray events=state.getJSONArray("audit");require(events.length()<=10000&&events.length()==integer(checkpoint,"sequence"),"Audit history length mismatch");
        String previous=null;
        for(int i=0;i<events.length();i++){
            JSONObject event=events.getJSONObject(i);exact(event,"domain","id","sequence","previous_hash","created_at","event_type","details","event_hash");
            require(string(event,"domain").equals("leqvor-governance-audit-v1")&&integer(event,"sequence")==i+1&&(previous==null?event.isNull("previous_hash"):string(event,"previous_hash").equals(previous)),"Audit chain mismatch");
            JSONObject body=new JSONObject(event.toString());body.remove("event_hash");require(hash(body).equals(string(event,"event_hash")),"Audit event changed");previous=string(event,"event_hash");
        }
        require(previous==null?checkpoint.isNull("event_hash"):previous.equals(string(checkpoint,"event_hash")),"Independent audit head mismatch");
    }
    public static byte[] checkpointCommitment(JSONObject checkpoint,String keyId) throws Exception {
        return canonical(new JSONObject().put("domain","leqvor-founder-checkpoint-approval-v1").put("platform","leqvor.vercel.app").put("checkpoint",checkpoint).put("signer_key_id",keyId)).getBytes(StandardCharsets.UTF_8);
    }
    public static String display(Object value) throws Exception {
        String text=canonical(value); StringBuilder safe=new StringBuilder();
        for(int i=0;i<text.length();i++){char c=text.charAt(i);if((c>=0x202a&&c<=0x202e)||(c>=0x2066&&c<=0x2069)||c==0x200e||c==0x200f)safe.append(String.format("\\u%04x",(int)c));else safe.append(c);}return safe.toString();
    }
}
