package com.lenvor.leqvor.founder;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import org.json.JSONObject;
import org.json.JSONArray;

/** Runs on the build JVM with public test vectors; never calls Android Keystore. */
public final class NativeAcceptance {
    public static void main(String[] args) throws Exception {
        JSONObject fixture=new JSONObject(Files.readString(Path.of(args[0])));
        JSONObject policy=fixture.getJSONObject("policy"),request=fixture.getJSONObject("request");
        Protocol.validatePolicy(policy);Protocol.validateRequest(request,policy,1,fixture.getLong("now"));
        Protocol.require(Protocol.hash(policy).equals(fixture.getString("policy_hash")),"Policy hash interoperability failed");
        Protocol.require(new String(Protocol.commitment(request,fixture.getString("key_id")),java.nio.charset.StandardCharsets.UTF_8).equals(fixture.getString("commitment")),"Approval bytes interoperability failed");
        JSONObject state=fixture.getJSONObject("state"),head=fixture.getJSONObject("checkpoint");Protocol.snapshot(state,head,policy);
        Protocol.require(new String(Protocol.checkpointCommitment(head,fixture.getString("key_id")),java.nio.charset.StandardCharsets.UTF_8).equals(fixture.getString("checkpoint_commitment")),"Checkpoint bytes interoperability failed");
        JSONObject corrupt=new JSONObject(state.toString());corrupt.put("frozen",true);boolean corruptDenied=false;try{Protocol.snapshot(corrupt,head,policy);}catch(Exception e){corruptDenied=true;}Protocol.require(corruptDenied,"Modified snapshot accepted");
        JSONArray cases=fixture.getJSONArray("canonical");
        for(int i=0;i<cases.length();i++){JSONObject test=cases.getJSONObject(i);Protocol.require(Protocol.canonical(test.get("input")).equals(test.getString("expected")),"Canonical vector failed "+i);}
        Protocol.require(Base64.getEncoder().encodeToString(HardwareSigner.p1363(Base64.getDecoder().decode(fixture.getString("der_signature")))).equals(fixture.getString("raw_signature")),"Native ECDSA encoding failed");
        for(byte[] broken:new byte[][]{new byte[]{48,0},new byte[]{48,6,2,1,(byte)128,2,1,1},new byte[]{48,7,2,2,0,1,2,1,1}}){boolean rejected=false;try{HardwareSigner.p1363(broken);}catch(Exception e){rejected=true;}Protocol.require(rejected,"Malformed signature accepted");}
        boolean denied=false;try{Protocol.validateRequest(request,policy,2,fixture.getLong("now"));}catch(Exception e){denied=true;}Protocol.require(denied,"Wrong independent version accepted");
        denied=false;try{Protocol.validateRequest(request,policy,1,fixture.getLong("now")+600000);}catch(Exception e){denied=true;}Protocol.require(denied,"Expired request accepted");
        Protocol.require(Protocol.display("target\u202ereversed").contains("\\u202e"),"Directional text not escaped");
        System.out.println("Native public-protocol acceptance passed: canonical bytes, policy pins, mixed keys, signature encoding, version, expiry, display and malformed input. Hardware not enrolled or tested.");
    }
}
