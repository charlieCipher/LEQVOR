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
        HardwarePolicy.require(true,true,-1,true,false,true,"TEE",1);
        HardwarePolicy.require(true,true,-1,true,false,true,"STRONGBOX",1);
        HardwarePolicy.require(true,true,0,true,false,true,"TEE",3);
        HardwarePolicy.require(true,true,0,true,false,true,"STRONGBOX",3);
        for(int failure=0;failure<6;failure++){
            for(int representation:new int[]{-1,0}){boolean blocked=false;try{HardwarePolicy.require(failure!=0,failure!=1,failure==2?30:representation,failure!=3,failure==4,failure!=5,"SYNTHETIC",1);}catch(IllegalArgumentException e){blocked=e.getMessage().contains("auth_hardware_enforced=")&&e.getMessage().contains("Signing remains blocked");}Protocol.require(blocked,"Hardware policy accepted failed check "+failure);}
        }
        for(int timeout:new int[]{Integer.MIN_VALUE,-2,1,5,30,Integer.MAX_VALUE}){boolean blocked=false;try{HardwarePolicy.require(true,true,timeout,true,false,true,"TEE",3);}catch(IllegalArgumentException e){blocked=true;}Protocol.require(blocked,"Hardware policy accepted timed/unknown authentication "+timeout);}
        JSONArray deviceTests=fixture.getJSONArray("device_tests");
        for(int i=0;i<deviceTests.length();i++){
            JSONObject f=deviceTests.getJSONObject(i),r=f.getJSONObject("request");String slot=f.getString("slot"),key=f.getString("key_id"),evidence=f.getString("evidence_hash");long time=fixture.getLong("now");
            Protocol.require(new String(Protocol.deviceTest(r,slot,key,evidence,time),java.nio.charset.StandardCharsets.UTF_8).equals(f.getString("commitment")),"Device test bytes differ");
            for(int failure=0;failure<4;failure++){boolean blocked=false;JSONObject changed=new JSONObject(r.toString());if(failure==0)changed.put("purpose","REMOVE_FOUNDER_ROOT");try{Protocol.deviceTest(changed,failure==1?"C":slot,key,failure==2?"0".repeat(64):evidence,failure==3?time+600000:time);}catch(Exception e){blocked=true;}Protocol.require(blocked,"Unsafe device test accepted");}
        }
        JSONObject executionPacket=fixture.getJSONObject("execution_packet");Protocol.executionJournal(policy,executionPacket);Protocol.require(new String(Protocol.executionCheckpointCommitment(executionPacket.getJSONObject("checkpoint"),fixture.getString("key_id")),java.nio.charset.StandardCharsets.UTF_8).equals(fixture.getString("execution_commitment")),"Execution checkpoint bytes differ");
        for(String failure:new String[]{"event","head","reservation"}){JSONObject changed=new JSONObject(executionPacket.toString());if(failure.equals("event"))changed.getJSONObject("snapshot").getJSONArray("events").getJSONObject(0).put("event_type","APPLIED");else if(failure.equals("head"))changed.getJSONObject("checkpoint").put("domain","leqvor-founder-checkpoint-approval-v1");else changed.getJSONObject("snapshot").getJSONObject("reservation").put("target",new JSONObject().put("changed",true));boolean blocked=false;try{Protocol.executionJournal(policy,changed);}catch(Exception e){blocked=true;}Protocol.require(blocked,"Execution journal substitution accepted");}
        JSONArray replacements=fixture.getJSONArray("replacements");
        for(int i=0;i<replacements.length();i++){
            JSONObject f=replacements.getJSONObject(i),packet=f.getJSONObject("packet");String slot=f.getString("slot");
            byte[] proof=Protocol.replacement(policy,f.getJSONObject("state"),f.getJSONObject("checkpoint"),packet,slot,f.getLong("now"));
            Protocol.require(new String(proof,java.nio.charset.StandardCharsets.UTF_8).equals(f.getString("commitment")),"Replacement possession bytes differ");
            JSONObject changed=new JSONObject(packet.toString());changed.getJSONObject("evidence").put("changed",true);
            denied=false;try{Protocol.replacement(policy,f.getJSONObject("state"),f.getJSONObject("checkpoint"),changed,slot,f.getLong("now"));}catch(Exception e){denied=true;}Protocol.require(denied,"Changed replacement evidence accepted");
            denied=false;try{Protocol.replacement(policy,f.getJSONObject("state"),f.getJSONObject("checkpoint"),packet,slot.equals("A")?"B":"A",f.getLong("now"));}catch(Exception e){denied=true;}Protocol.require(denied,"Wrong replacement slot accepted");
            denied=false;try{Protocol.replacement(policy,f.getJSONObject("state"),f.getJSONObject("checkpoint"),packet,slot,f.getLong("now")+600000);}catch(Exception e){denied=true;}Protocol.require(denied,"Expired possession proof accepted");
        }
        System.out.println("Native public-protocol acceptance passed: canonical bytes, policy pins, mixed keys, signature encoding, version, expiry, display and malformed input. Hardware not enrolled or tested.");
    }
}
