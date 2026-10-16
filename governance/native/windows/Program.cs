using System.Text;
using System.Text.Json;

namespace Leqvor.Founder;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "--check-protocol") { Check(args[1]); return; }
        if (args.Length == 1 && args[0] == "--check-device") { Console.WriteLine(HelloSigner.DeviceReadiness().GetAwaiter().GetResult()); return; }
        if(args.Length==2&&args[0]=="--inspect-device-test")
        {
            try{var packet=Protocol.Read(args[1]);Protocol.Exact(packet,"request","evidence");using var current=JsonDocument.Parse(HelloSigner.ExistingPublicEvidence().GetAwaiter().GetResult());Protocol.WindowsDeviceTest(packet.GetProperty("request"),packet.GetProperty("evidence"),current.RootElement,DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());Console.WriteLine("Existing key and certificate chain match retained evidence; exact isolated request is valid. No signing, authentication prompt, key creation or enrollment performed. Independent TPM verification remains pending.");}
            catch{Console.Error.WriteLine("Read-only device-test inspection blocked. Check public input, key/chain, retained evidence and expiry. Nothing signed or enrolled.");Environment.ExitCode=1;}
            return;
        }
        if (args.Length == 2 && args[0] == "--export-existing-public-evidence")
        {
            try { byte[] packet = HelloSigner.ExistingPublicEvidence().GetAwaiter().GetResult(); Protocol.Require(packet.Length <= 65536, "Public evidence exceeds reviewed capacity"); using var file = new FileStream(args[1], FileMode.CreateNew, FileAccess.Write, FileShare.None); file.Write(packet); file.Flush(true); Console.WriteLine("Existing public evidence saved locally. No key created, replaced or signed; no founder enrollment or activation."); }
            catch { Console.Error.WriteLine("Existing public evidence export failed. No key was created or replaced. Check local credential availability, attestation and new output path."); Environment.ExitCode = 1; }
            return;
        }
        if (args.Length != 0) throw new InvalidDataException("No background signing arguments are supported");
        ApplicationConfiguration.Initialize(); Application.Run(new FounderForm());
    }
    private static void Check(string path)
    {
        var vectors = Protocol.Read(path); var policy = vectors.GetProperty("policy"); var request = vectors.GetProperty("request");
        Protocol.Policy(policy); Protocol.Request(request, policy, 1, Protocol.Integer(vectors, "now"));
        Protocol.Require(Protocol.Hash(policy) == Protocol.Text(vectors, "policy_hash") && Encoding.UTF8.GetString(Protocol.Commitment(request, Protocol.Text(vectors, "key_id"))) == Protocol.Text(vectors, "commitment"), "Windows protocol interoperability failed");
        foreach (var test in vectors.GetProperty("canonical").EnumerateArray()) Protocol.Require(Protocol.Canonical(test.GetProperty("input")) == Protocol.Text(test, "expected"), "Windows canonical vector failed");
        var state = vectors.GetProperty("state"); var head = vectors.GetProperty("checkpoint");
        Protocol.Snapshot(state, head, policy);
        Protocol.Require(Encoding.UTF8.GetString(Protocol.CheckpointCommitment(head, Protocol.Text(vectors, "key_id"))) == Protocol.Text(vectors, "checkpoint_commitment"), "Checkpoint signature bytes interoperability failed");
        using var altered = JsonDocument.Parse(Protocol.Canonical(state).Replace("\"frozen\":false", "\"frozen\":true", StringComparison.Ordinal));
        bool corrupt = false; try { Protocol.Snapshot(altered.RootElement, head, policy); } catch (InvalidDataException) { corrupt = true; } Protocol.Require(corrupt, "Changed state accepted");
        bool denied = false; try { Protocol.Request(request, policy, 2, Protocol.Integer(vectors, "now")); } catch (InvalidDataException) { denied = true; } Protocol.Require(denied, "Wrong independent version accepted");
        denied = false; try { Protocol.Request(request, policy, 1, Protocol.Integer(vectors, "now") + 600000); } catch (InvalidDataException) { denied = true; } Protocol.Require(denied, "Expired challenge accepted");
        foreach(var f in vectors.GetProperty("device_tests").EnumerateArray())
        {
            var r=f.GetProperty("request");string slot=Protocol.Text(f,"slot"),key=Protocol.Text(f,"key_id"),evidence=Protocol.Text(f,"evidence_hash");long time=Protocol.Integer(vectors,"now");
            Protocol.Require(Encoding.UTF8.GetString(Protocol.DeviceTest(r,slot,key,evidence,time))==Protocol.Text(f,"commitment"),"Device test bytes differ");
            for(int failure=0;failure<4;failure++){using var changed=JsonDocument.Parse(failure==0?Protocol.Canonical(r).Replace("PROVE_DEVICE_KEY_ONLY","REMOVE_FOUNDER_ROOT",StringComparison.Ordinal):Protocol.Canonical(r));bool blocked=false;try{Protocol.DeviceTest(changed.RootElement,failure==1?"C":slot,key,failure==2?new string('0',64):evidence,failure==3?time+600000:time);}catch(InvalidDataException){blocked=true;}Protocol.Require(blocked,"Unsafe device test accepted");}
        }
        var windowsTest=vectors.GetProperty("windows_device_test");var retainedEvidence=windowsTest.GetProperty("retained");var currentEvidence=windowsTest.GetProperty("current");var testRequest=windowsTest.GetProperty("request");long testTime=Protocol.Integer(vectors,"now");
        Protocol.Require(Protocol.WindowsDeviceTest(testRequest,retainedEvidence,currentEvidence,testTime).SequenceEqual(Protocol.DeviceTest(testRequest,"A",Protocol.Text(testRequest,"key_id"),Protocol.Hash(retainedEvidence),testTime)),"Regenerated attestation blocked unchanged Windows key/chain");
        foreach(string field in new[]{"attestation","certificate_chain","key_id","domain"})
        {
            using var changed=JsonDocument.Parse(Protocol.Canonical(currentEvidence).Replace(field=="attestation"?"Ag==":field=="certificate_chain"?"AQID":field=="key_id"?Protocol.Text(currentEvidence.GetProperty("credential"),"key_id"):"leqvor-founder-device-evidence-v1",field=="key_id"?new string('0',64):field=="attestation"?"":field=="certificate_chain"?"BAUG":"changed",StringComparison.Ordinal));
            bool blocked=false;try{Protocol.WindowsDeviceTest(testRequest,retainedEvidence,changed.RootElement,testTime);}catch(Exception e)when(e is InvalidDataException or FormatException){blocked=true;}Protocol.Require(blocked,"Changed or missing current Windows evidence accepted: "+field);
        }
        using var alteredRetained=JsonDocument.Parse(Protocol.Canonical(retainedEvidence).Replace("AQ==","Aw==",StringComparison.Ordinal));
        denied=false;try{Protocol.WindowsDeviceTest(testRequest,alteredRetained.RootElement,currentEvidence,testTime);}catch(InvalidDataException){denied=true;}Protocol.Require(denied,"Substituted retained evidence accepted");
        var executionPacket=vectors.GetProperty("execution_packet");Protocol.ExecutionJournal(policy,executionPacket);Protocol.Require(Encoding.UTF8.GetString(Protocol.ExecutionCheckpointCommitment(executionPacket.GetProperty("checkpoint"),Protocol.Text(vectors,"key_id")))==Protocol.Text(vectors,"execution_commitment"),"Execution checkpoint bytes differ");
        foreach(var failure in new[]{"event","head","reservation"}){using var changed=JsonDocument.Parse(Protocol.Canonical(executionPacket).Replace(failure=="event"?"ATTEMPTED":failure=="head"?"leqvor-execution-checkpoint-v1":"synthetic-journal-only",failure=="event"?"APPLIED":failure=="head"?"leqvor-founder-checkpoint-approval-v1":"changed",StringComparison.Ordinal));bool blocked=false;try{Protocol.ExecutionJournal(policy,changed.RootElement);}catch(InvalidDataException){blocked=true;}Protocol.Require(blocked,"Execution journal substitution accepted");}
        foreach (var f in vectors.GetProperty("replacements").EnumerateArray())
        {
            var packet = f.GetProperty("packet"); string slot = Protocol.Text(f,"slot");
            Protocol.Require(Encoding.UTF8.GetString(Protocol.Replacement(policy,f.GetProperty("state"),f.GetProperty("checkpoint"),packet,slot,Protocol.Integer(f,"now"))) == Protocol.Text(f,"commitment"), "Replacement possession bytes differ");
            using var changed = JsonDocument.Parse(Protocol.Canonical(packet).Replace("synthetic-native-test-evidence", "changed-native-test-evidence", StringComparison.Ordinal));
            denied = false; try { Protocol.Replacement(policy,f.GetProperty("state"),f.GetProperty("checkpoint"),changed.RootElement,slot,Protocol.Integer(f,"now")); } catch (InvalidDataException) { denied = true; } Protocol.Require(denied,"Changed replacement evidence accepted");
            denied = false; try { Protocol.Replacement(policy,f.GetProperty("state"),f.GetProperty("checkpoint"),packet,slot == "A" ? "B" : "A",Protocol.Integer(f,"now")); } catch (InvalidDataException) { denied = true; } Protocol.Require(denied,"Wrong replacement slot accepted");
            denied = false; try { Protocol.Replacement(policy,f.GetProperty("state"),f.GetProperty("checkpoint"),packet,slot,Protocol.Integer(f,"now")+600000); } catch (InvalidDataException) { denied = true; } Protocol.Require(denied,"Expired possession proof accepted");
        }
        Console.WriteLine("Windows public-protocol acceptance passed. Windows Hello/TPM was not invoked or enrolled.");
    }
}

internal sealed class FounderForm : Form
{
    private readonly TextBox details = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, Dock = DockStyle.Fill, Font = new Font("Segoe UI", 12), Text = "LEQVOR Founder Console — local device A.\r\nNo root authority is enrolled. No customer vault access.\r\nImport independently retained policy/checkpoint separately from each request." };
    private JsonElement? policy, checkpoint, snapshot, bundle;
    private byte[]? export;
    private bool busy;
    internal FounderForm()
    {
        Text = "LEQVOR Founder Console"; Width = 900; Height = 700; MinimumSize = new Size(600, 500);
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
        Controls.Add(details); Controls.Add(buttons);
        Add(buttons, "Create / inspect Hello key", async () => { if (MessageBox.Show("Create a non-exportable Windows Hello key A if none exists? This does not enroll root authority or replace an existing key.", "Local key creation", MessageBoxButtons.YesNo) != DialogResult.Yes) return; export = await HelloSigner.PublicEnrollment(); details.Text = "Public key and TPM evidence ready for independent verification. The OS status alone does not validate the attestation chain. No private key exported."; });
        Add(buttons, "Import policy + checkpoint", () => { var parsed = Pick(); policy = null; checkpoint = null; snapshot = null; bundle = null; export = null; Protocol.Exact(parsed, "policy", "checkpoint", "state"); var p = parsed.GetProperty("policy"); var c = parsed.GetProperty("checkpoint"); var s = parsed.GetProperty("state"); Protocol.Policy(p); Protocol.Exact(c, "policy_hash", "state_hash", "version", "sequence", "event_hash"); Protocol.Require(Protocol.Text(c, "policy_hash") == Protocol.Hash(p) && Protocol.Hex(Protocol.Text(c, "state_hash")) && Protocol.Integer(c, "version") >= 1 && Protocol.Integer(c, "sequence") >= 0 && (Protocol.Integer(c, "sequence") == 0 ? c.GetProperty("event_hash").ValueKind == JsonValueKind.Null : Protocol.Hex(Protocol.Text(c, "event_hash"))), "Invalid independent checkpoint"); Protocol.Snapshot(s,c,p); policy = p; checkpoint = c; snapshot = s; details.Text = "Verified snapshot. Independently verify the policy/checkpoint's provenance.\r\nPolicy pin: " + Protocol.Hash(p); return Task.CompletedTask; });
        Add(buttons, "Import request + target", () => { var parsed = Pick(); Protocol.Exact(parsed, "request", "target"); bundle = parsed; export = null; Inspect(); return Task.CompletedTask; });
        Add(buttons, "Inspect exact action", () => { Inspect(); return Task.CompletedTask; });
        Add(buttons,"Run isolated device-key test",async()=>{export=null;var packet=Pick();Protocol.Exact(packet,"request","evidence");var request=packet.GetProperty("request");var retained=packet.GetProperty("evidence");Protocol.Require(Protocol.Hash(retained)==Protocol.Text(request,"evidence_hash"),"Retained evidence differs from issued request");details.Text="ISOLATED DEVICE-KEY TEST ONLY\r\n"+Protocol.Display(request)+"\r\nRequest fingerprint: "+Protocol.Hash(request)+"\r\nRetained public evidence: "+Protocol.Hash(retained)+"\r\nNo root approval, enrollment, ownership or vault access. This tests key possession, not independent TPM provenance. Compare fingerprints with the request issued on your laptop.";if(MessageBox.Show(details.Text+"\r\nTest the existing local key with Windows Hello?","Isolated device test",MessageBoxButtons.YesNo,MessageBoxIcon.Information)!=DialogResult.Yes)return;export=await HelloSigner.TestExistingDevice(request,retained);details.Text="Isolated device-key proof ready for public export. No root action or enrollment occurred.";});
        Add(buttons, "Prove replacement key possession", async () => { Protocol.Require(policy.HasValue && snapshot.HasValue && checkpoint.HasValue, "Import independent authority first"); var packet = Pick(); Protocol.Replacement(policy!.Value, snapshot!.Value, checkpoint!.Value, packet, "A", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()); details.Text = "REPLACEMENT KEY POSSESSION ONLY\r\n" + Protocol.Display(packet.GetProperty("target")) + "\r\nRequest: " + Protocol.Hash(packet.GetProperty("request")) + "\r\nProves this new key; does not approve or execute replacement. Hardware evidence still requires independent verification."; if (MessageBox.Show(details.Text + "\r\nSign this exact possession proof?", "Replacement possession", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return; export = null; export = await HelloSigner.ProveReplacement(policy.Value, snapshot.Value, checkpoint.Value, packet); details.Text = "Public possession proof ready. No device enrolled or root policy changed."; });
        Add(buttons, "Approve with Windows Hello", async () => { Inspect(); if (MessageBox.Show(details.Text + "\r\n\r\nSign this exact approval?", "Founder authorization", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return; export = null; export = await HelloSigner.Approve(bundle!.Value.GetProperty("request"), policy!.Value, Protocol.Integer(checkpoint!.Value, "version")); details.Text = "Local public approval signed. Export its signature packet. No root action executed."; });
        Add(buttons, "Sign verified audit checkpoint", async () => { Protocol.Require(snapshot.HasValue && checkpoint.HasValue && policy.HasValue, "Import independent authority first"); Protocol.Snapshot(snapshot!.Value, checkpoint!.Value, policy!.Value); details.Text = "AUDIT CHECKPOINT ONLY\r\n" + Protocol.Display(checkpoint.Value) + "\r\nNo root action authorization."; if (MessageBox.Show(details.Text + "\r\nSign this exact checkpoint?", "Public audit evidence", MessageBoxButtons.YesNo) != DialogResult.Yes) return; export = null; export = await HelloSigner.ApproveCheckpoint(checkpoint.Value, policy.Value); details.Text = "Checkpoint signature ready for export. No root action authorized or executed."; });
        Add(buttons,"Sign execution journal checkpoint",async()=>{export=null;Protocol.Require(policy.HasValue&&checkpoint.HasValue&&snapshot.HasValue,"Import independent authority first");Protocol.Snapshot(snapshot!.Value,checkpoint!.Value,policy!.Value);var packet=Pick();Protocol.ExecutionJournal(policy.Value,packet);details.Text="EXECUTION JOURNAL EVIDENCE ONLY\r\n"+Protocol.Display(packet.GetProperty("checkpoint"))+"\r\nFull journal fingerprint: "+Protocol.Hash(packet.GetProperty("snapshot"))+"\r\nNot a provider receipt verification, retry permission or root action approval.";if(MessageBox.Show(details.Text+"\r\nSign this exact journal checkpoint?","Execution evidence",MessageBoxButtons.YesNo,MessageBoxIcon.Information)!=DialogResult.Yes)return;export=await HelloSigner.ApproveExecutionCheckpoint(packet,policy.Value);details.Text="Execution journal checkpoint signature ready. No execution or root action authorized.";});
        Add(buttons, "Export public packet", () => { Protocol.Require(export != null, "Nothing to export"); using var picker = new SaveFileDialog { Filter = "Public JSON|*.json", FileName = "leqvor-founder-public-packet.json" }; if (picker.ShowDialog() == DialogResult.OK) File.WriteAllBytes(picker.FileName, export!); return Task.CompletedTask; });
        Add(buttons, "Clear session", () => { policy = null; checkpoint = null; snapshot = null; bundle = null; export = null; details.Text = "Session cleared."; return Task.CompletedTask; });
    }
    private void Add(FlowLayoutPanel panel, string label, Func<Task> action)
    {
        var button = new Button { Text = label, AutoSize = true, MinimumSize = new Size(120, 44) };
        button.Click += async (_, _) => { if (busy) return; busy = true; panel.Enabled = false; try { await action(); } catch (Exception error) { export = null; details.Text = "Blocked: " + error.Message; } finally { busy = false; panel.Enabled = true; } }; panel.Controls.Add(button);
    }
    private static JsonElement Pick() { using var picker = new OpenFileDialog { Filter = "Public JSON|*.json" }; Protocol.Require(picker.ShowDialog() == DialogResult.OK, "Import cancelled"); return Protocol.Read(picker.FileName); }
    private void Inspect()
    {
        Protocol.Require(policy.HasValue && checkpoint.HasValue && bundle.HasValue, "Import independent policy/checkpoint and request separately");
        var p = policy!.Value; var b = bundle!.Value; var c = checkpoint!.Value; var request = b.GetProperty("request"); long version = Protocol.Integer(c, "version");
        Protocol.Policy(p); Protocol.Request(request, p, version, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()); Protocol.Require(Protocol.Hash(b.GetProperty("target")) == Protocol.Text(request, "target"), "Target artifact changed");
        details.Text = "YOU ARE APPROVING:\r\n" + Protocol.Text(request, "action") + "\r\n\r\nExact target:\r\n" + Protocol.Display(b.GetProperty("target")) + "\r\n\r\nPolicy pin: " + Protocol.Hash(p) + "\r\nKey A: " + Protocol.Text(Protocol.Credential(p, "A"), "key_id") + "\r\nVersion: " + version + "\r\nPhase: " + Protocol.Text(request, "phase") + "\r\nExpires: " + Protocol.Text(request, "expires_at") + "\r\n\r\nCompare with independently retained policy and history. This is an approval, not an execution receipt.";
    }
}
