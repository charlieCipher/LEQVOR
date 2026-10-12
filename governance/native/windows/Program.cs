using System.Text;
using System.Text.Json;

namespace Leqvor.Founder;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "--check-protocol") { Check(args[1]); return; }
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
        Add(buttons, "Approve with Windows Hello", async () => { Inspect(); if (MessageBox.Show(details.Text + "\r\n\r\nSign this exact approval?", "Founder authorization", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return; export = null; export = await HelloSigner.Approve(bundle!.Value.GetProperty("request"), policy!.Value, Protocol.Integer(checkpoint!.Value, "version")); details.Text = "Local public approval signed. Export its signature packet. No root action executed."; });
        Add(buttons, "Sign verified audit checkpoint", async () => { Protocol.Require(snapshot.HasValue && checkpoint.HasValue && policy.HasValue, "Import independent authority first"); Protocol.Snapshot(snapshot!.Value, checkpoint!.Value, policy!.Value); details.Text = "AUDIT CHECKPOINT ONLY\r\n" + Protocol.Display(checkpoint.Value) + "\r\nNo root action authorization."; if (MessageBox.Show(details.Text + "\r\nSign this exact checkpoint?", "Public audit evidence", MessageBoxButtons.YesNo) != DialogResult.Yes) return; export = null; export = await HelloSigner.ApproveCheckpoint(checkpoint.Value, policy.Value); details.Text = "Checkpoint signature ready for export. No root action authorized or executed."; });
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
