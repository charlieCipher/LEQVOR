package com.lenvor.leqvor.founder;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.view.WindowManager;
import android.view.MotionEvent;
import android.view.WindowInsets;
import android.graphics.Insets;
import android.graphics.Rect;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.Signature;
import java.util.Base64;

/** Offline companion. Imported request files never replace the independently held policy. */
public final class FounderActivity extends Activity {
    private TextView details;
    private JSONObject policy,checkpoint,snapshot,bundle;
    private byte[] export;
    private CancellationSignal cancellation;
    private boolean busy,transferring,foreground,keyWorkInProgress;
    private int sessionGeneration;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);getWindow().setHideOverlayWindows(true);
        int spacing=Math.round(16*getResources().getDisplayMetrics().density);
        LinearLayout column=new LinearLayout(this);column.setOrientation(LinearLayout.VERTICAL);column.setPadding(spacing,spacing,spacing,spacing);
        ScrollView scroll=new ScrollView(this);scroll.addView(column);setContentView(scroll);
        scroll.setOnApplyWindowInsetsListener((view,insets)->{Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});scroll.requestApplyInsets();
        TextView title=new TextView(this);title.setText("LEQVOR Founder Approval — local device B · preview 0.1.2");title.setTextSize(22);column.addView(title);
        details=new TextView(this);details.setText("Inactive: no root authority is enrolled. This offline companion does not access customer vaults. Import the independently verified public policy separately from each request.");details.setTextSize(17);details.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);column.addView(details);
        button(column,"Create / inspect hardware key",()->{export=null;show("Key inspection selected. Confirm the local operation in the dialog; nothing is enrolled on a server.");new AlertDialog.Builder(this).setTitle("Create local founder key B?").setMessage("A new non-exportable Android Keystore key will be created only if one does not already exist. Its public fingerprint and attestation chain must be checked independently. No server enrollment occurs.").setNegativeButton("Cancel",null).setPositiveButton("Create / inspect",(d,w)->safe(this::inspectHardwareAsync)).show();});
        button(column,"Import independent policy + checkpoint",()->pick(1));
        button(column,"Import request + target",()->pick(2));
        button(column,"Inspect exact action",()->safe(this::inspect));
        button(column,"Prove replacement key possession",()->pick(4));
        button(column,"Approve shown action locally",()->safe(()->{inspect();new AlertDialog.Builder(this).setTitle("Sign this exact governance action?").setMessage("Review the full target above. This authorizes a founder approval; it does not directly execute the action.").setNegativeButton("Cancel",null).setPositiveButton("Approve with biometric / PIN",(d,w)->safe(()->sign(false))).show();}));
        button(column,"Sign verified audit checkpoint",()->safe(()->{Protocol.require(policy!=null&&checkpoint!=null&&snapshot!=null,"Import independent authority first");Protocol.snapshot(snapshot,checkpoint,policy);show("AUDIT CHECKPOINT ONLY\n"+Protocol.display(checkpoint)+"\nNo root action authorization. Independently verify this head before signing.");new AlertDialog.Builder(this).setTitle("Sign verified audit checkpoint?").setMessage("This signature attests the displayed public history and state. It grants no root action.").setNegativeButton("Cancel",null).setPositiveButton("Sign with biometric / PIN",(d,w)->safe(()->sign(true))).show();}));
        button(column,"Export public key / signed approval",()->{if(busy)return;if(export==null){show("Nothing to export");return;}transferring=true;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.setType("application/json");i.addCategory(Intent.CATEGORY_OPENABLE);i.putExtra(Intent.EXTRA_TITLE,"leqvor-founder-public-packet.json");startActivityForResult(i,3);});
    }
    private interface Work {void run() throws Exception;}
    private void safe(Work work){try{if(busy)throw new IllegalStateException("Authentication in progress");work.run();}catch(Exception e){export=null;show("Blocked: "+e.getMessage());}}
    private void button(LinearLayout column,String label,Runnable action){Button b=new Button(this){@Override public boolean onFilterTouchEventForSecurity(MotionEvent event){boolean accepted=super.onFilterTouchEventForSecurity(event);if(!accepted&&event.getActionMasked()==MotionEvent.ACTION_DOWN)show("Touch blocked because another window obscures this app. Close floating windows covering it, then try again. No security check was disabled.");return accepted;}};b.setText(label);b.setMinHeight(Math.round(48*getResources().getDisplayMetrics().density));b.setFilterTouchesWhenObscured(true);b.setOnClickListener(v->{if(keyWorkInProgress||busy){show("A local key or authentication operation is still in progress. Please wait; do not keep tapping.");return;}try{action.run();}catch(Exception e){export=null;show("Blocked: "+e.getClass().getSimpleName()+". No approval exported. Try again when the app is in the foreground.");}});column.addView(b);}
    private void inspectHardwareAsync(){
        if(keyWorkInProgress)throw new IllegalStateException("Local key inspection already in progress");
        final int generation=sessionGeneration;keyWorkInProgress=true;export=null;show("Checking Android Keystore hardware… please wait. Existing keys are inspected, not replaced. No server enrollment occurs.");
        new Thread(()->{
            byte[] packet=null;String failure=null;
            try{packet=Protocol.canonical(HardwareSigner.createOrInspect(getApplicationContext())).getBytes(StandardCharsets.UTF_8);if(packet.length>65536)throw new IllegalStateException("Public evidence exceeds size limit");}
            catch(Exception e){failure="Hardware inspection blocked ("+e.getClass().getSimpleName()+"). "+(e instanceof IllegalArgumentException?e.getMessage():"Device hardware/attestation or secure screen-lock requirements were not satisfied. No software fallback is used.");}
            final byte[] result=packet;final String error=failure;
            runOnUiThread(()->{keyWorkInProgress=false;if(!foreground||isFinishing()||isDestroyed()||generation!=sessionGeneration)return;export=error==null?result:null;show(error==null?"Public phone key and evidence ready for independent verification. Tap Export public key / signed approval. No private key exported and no root authority enrolled.":error);});
        },"FounderHardwareInspection").start();
    }
    private void show(String text){details.setText(text);details.post(()->details.requestRectangleOnScreen(new Rect(0,0,details.getWidth(),details.getHeight()),false));}
    private void pick(int code){if(busy)return;transferring=true;Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("application/json");i.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,code);}
    @Override protected void onActivityResult(int code,int result,Intent data){super.onActivityResult(code,result,data);transferring=false;if(result!=RESULT_OK||data==null||data.getData()==null)return;safe(()->{
        if(code==3){try(OutputStream stream=getContentResolver().openOutputStream(data.getData(),"wt")){if(stream==null||export==null)throw new IllegalStateException("Export unavailable");stream.write(export);}show("Public packet exported. Nothing sent to a server.");return;}
        if(code==1){policy=null;checkpoint=null;snapshot=null;bundle=null;}
        byte[] raw;try(InputStream stream=getContentResolver().openInputStream(data.getData())){if(stream==null)throw new IllegalStateException("File unavailable");raw=stream.readNBytes(65537);}Protocol.require(raw.length<=65536,"Public file too large");
        JSONObject parsed=new JSONObject(new String(raw,StandardCharsets.UTF_8));export=null;
        if(code==1){Protocol.exact(parsed,"policy","checkpoint","state");JSONObject p=parsed.getJSONObject("policy"),c=parsed.getJSONObject("checkpoint"),s=parsed.getJSONObject("state");Protocol.validatePolicy(p);Protocol.exact(c,"policy_hash","state_hash","version","sequence","event_hash");Protocol.require(Protocol.string(c,"policy_hash").equals(Protocol.hash(p))&&Protocol.hex(Protocol.string(c,"state_hash"))&&Protocol.integer(c,"version")>=1&&Protocol.integer(c,"sequence")>=0,"Invalid independent checkpoint");Protocol.require(Protocol.integer(c,"sequence")==0?c.isNull("event_hash"):Protocol.hex(Protocol.string(c,"event_hash")),"Invalid audit checkpoint");Protocol.snapshot(s,c,p);policy=p;checkpoint=c;snapshot=s;bundle=null;show("Policy, checkpoint and audit verified for this session only. Verify their provenance independently. Policy pin:\n"+Protocol.hash(policy)+"\nVersion: "+Protocol.integer(checkpoint,"version"));}
        else if(code==2){Protocol.exact(parsed,"request","target");bundle=parsed;inspect();}
        else if(code==4){Protocol.replacement(policy,snapshot,checkpoint,parsed,"B",System.currentTimeMillis());show("REPLACEMENT KEY POSSESSION ONLY\n"+Protocol.display(parsed.get("target"))+"\nRequest: "+Protocol.hash(parsed.get("request"))+"\nProves this new key; does not approve or execute replacement. Hardware evidence still needs independent verification.");new AlertDialog.Builder(this).setTitle("Sign this exact possession proof?").setMessage("Review the full replacement target above. This does not enroll the device or change root policy.").setNegativeButton("Cancel",null).setPositiveButton("Sign with biometric / PIN",(d,w)->safe(()->sign(false,parsed))).show();}
    });}
    private void inspect() throws Exception {
        Protocol.require(policy!=null&&checkpoint!=null&&bundle!=null,"Import independent policy/checkpoint and request separately first");
        JSONObject request=bundle.getJSONObject("request");long version=Protocol.integer(checkpoint,"version");
        Protocol.validatePolicy(policy);Protocol.validateRequest(request,policy,version,System.currentTimeMillis());
        Protocol.require(Protocol.hash(bundle.get("target")).equals(Protocol.string(request,"target")),"Target artifact was changed");
        JSONObject pin=Protocol.credential(policy,"B");Protocol.require(Protocol.string(pin,"algorithm").equals("ES256"),"Phone requires P-256 key B");
        show("YOU ARE APPROVING\n"+Protocol.string(request,"action")+"\n\nExact target:\n"+Protocol.display(bundle.get("target"))+"\n\nPolicy pin: "+Protocol.hash(policy)+"\nKey B: "+Protocol.string(pin,"key_id")+"\nVersion: "+version+"\nPhase: "+Protocol.string(request,"phase")+"\nExpires: "+Protocol.string(request,"expires_at")+"\n\nCompare version and policy with independently retained records. No server supplied policy may replace them.");
    }
    private void sign(boolean auditOnly) throws Exception {
        sign(auditOnly,null);
    }
    private void sign(boolean auditOnly,JSONObject possession) throws Exception {
        final JSONObject proof=possession==null?null:new JSONObject(possession.toString());
        if(proof!=null)Protocol.replacement(policy,snapshot,checkpoint,proof,"B",System.currentTimeMillis());else if(auditOnly)Protocol.snapshot(snapshot,checkpoint,policy);else inspect();export=null;
        final JSONObject request=auditOnly?null:new JSONObject((proof!=null?proof:bundle).getJSONObject("request").toString());
        final JSONObject head=new JSONObject(checkpoint.toString());
        final long version=Protocol.integer(checkpoint,"version");
        final JSONObject pinnedPolicy=new JSONObject(policy.toString());
        final JSONObject pinnedState=new JSONObject(snapshot.toString());
        final JSONObject pin=proof!=null?proof.getJSONObject("target").getJSONObject("credential"):Protocol.credential(policy,"B");
        Protocol.require(Protocol.string(pin,"algorithm").equals("ES256"),"Phone requires P-256 replacement key B");
        final String keyId=Protocol.string(pin,"key_id");
        final Signature signature=HardwareSigner.prepare(keyId);final byte[] bytes=proof!=null?Protocol.replacement(pinnedPolicy,pinnedState,head,proof,"B",System.currentTimeMillis()):auditOnly?Protocol.checkpointCommitment(head,keyId):Protocol.commitment(request,keyId);
        cancellation=new CancellationSignal();busy=true;
        BiometricPrompt prompt=new BiometricPrompt.Builder(this).setTitle("LEQVOR founder approval").setSubtitle(proof!=null?"REPLACEMENT POSSESSION ONLY":auditOnly?"AUDIT CHECKPOINT ONLY":Protocol.string(request,"action")).setDescription("Sign only the exact public content inspected in this app.").setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG|BiometricManager.Authenticators.DEVICE_CREDENTIAL).build();
        prompt.authenticate(new BiometricPrompt.CryptoObject(signature),cancellation,getMainExecutor(),new BiometricPrompt.AuthenticationCallback(){
            @Override public void onAuthenticationError(int code,CharSequence message){busy=false;export=null;show("Authentication cancelled or unavailable. Nothing signed.");}
            @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result){busy=false;safe(()->{
                Protocol.require(foreground&&cancellation!=null&&!cancellation.isCanceled()&&!getSystemService(android.app.KeyguardManager.class).isDeviceLocked(),"App backgrounded or device locked; approval cancelled");
                if(proof!=null)Protocol.replacement(pinnedPolicy,pinnedState,head,proof,"B",System.currentTimeMillis());else if(!auditOnly)Protocol.validateRequest(request,pinnedPolicy,version,System.currentTimeMillis());
                Protocol.require(result.getCryptoObject()!=null&&result.getCryptoObject().getSignature()==signature,"Unexpected authentication operation");
                signature.update(bytes);byte[] signed=HardwareSigner.p1363(signature.sign());
                JSONObject approval=new JSONObject().put("slot","B").put("key_id",keyId).put("signature",Base64.getEncoder().encodeToString(signed));
                export=Protocol.canonical(auditOnly?new JSONObject().put("checkpoint",head).put("approval",approval):approval).getBytes(StandardCharsets.UTF_8);show(proof!=null?"Public possession proof ready. No device enrolled or root policy changed.":"Local approval signed. Export the public signature packet. The private key stayed in Android Keystore; no root action was executed.");
            });}
        });
    }
    @Override protected void onStart(){super.onStart();foreground=true;}
    @Override protected void onStop(){super.onStop();foreground=false;sessionGeneration++;if(cancellation!=null)cancellation.cancel();busy=false;if(!transferring){policy=null;checkpoint=null;snapshot=null;bundle=null;export=null;show("Session cleared. Reimport independently verified policy/checkpoint and request. If a local key inspection was interrupted, inspect the existing key again; do not reinstall or clear app data.");}}
}
