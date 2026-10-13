using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Leqvor.Founder;

internal static class Protocol
{
    internal static readonly string[] Actions = ["REMOVE_FOUNDER_ROOT", "DISABLE_FOUNDER_PROTECTION", "TRANSFER_PLATFORM_OWNERSHIP", "REPLACE_FOUNDER_IDENTITY", "CHANGE_ROOT_POLICY", "CHANGE_ROOT_THRESHOLD", "TRANSFER_CRITICAL_INFRASTRUCTURE", "DELETE_GOVERNANCE_CONFIGURATION", "GOVERNANCE_FREEZE", "GOVERNANCE_UNFREEZE", "CANCEL_GOVERNANCE_REQUEST"];
    internal static void Require(bool ok, string error) { if (!ok) throw new InvalidDataException(error); }
    internal static JsonElement Read(string path)
    {
        Require(new FileInfo(path).Length <= 65536, "Public file exceeds size limit");
        using var document = JsonDocument.Parse(File.ReadAllBytes(path), new JsonDocumentOptions { MaxDepth = 24 });
        return document.RootElement.Clone();
    }
    internal static void Exact(JsonElement value, params string[] fields)
    {
        Require(value.ValueKind == JsonValueKind.Object, "Object required");
        var properties = value.EnumerateObject().Select(p => p.Name).ToArray();
        Require(properties.Length == fields.Length && properties.Distinct().Count() == properties.Length && fields.All(properties.Contains), "Unexpected or duplicate packet fields");
    }
    internal static string Text(JsonElement value, string field)
    {
        var property = value.GetProperty(field); Require(property.ValueKind == JsonValueKind.String, "Text required: " + field); return property.GetString()!;
    }
    internal static long Integer(JsonElement value, string field)
    {
        var property = value.GetProperty(field); Require(property.TryGetInt64(out long result) && result >= -9007199254740991L && result <= 9007199254740991L, "Safe integer required: " + field); return result;
    }
    private static uint? Index(string key) => uint.TryParse(key, NumberStyles.None, CultureInfo.InvariantCulture, out uint number) && number < uint.MaxValue && number.ToString(CultureInfo.InvariantCulture) == key ? number : null;
    internal static string Quote(string text)
    {
        var result = new StringBuilder("\"");
        for (int i = 0; i < text.Length; i++)
        {
            char c = text[i];
            if (char.IsHighSurrogate(c)) { Require(i + 1 < text.Length && char.IsLowSurrogate(text[i + 1]), "Invalid Unicode"); result.Append(c).Append(text[++i]); continue; }
            Require(!char.IsLowSurrogate(c), "Invalid Unicode");
            result.Append(c switch { '"' => "\\\"", '\\' => "\\\\", '\b' => "\\b", '\f' => "\\f", '\n' => "\\n", '\r' => "\\r", '\t' => "\\t", _ => c < 32 ? "\\u" + ((int)c).ToString("x4") : c.ToString() });
        }
        return result.Append('"').ToString();
    }
    internal static string Canonical(JsonElement value)
    {
        switch (value.ValueKind)
        {
            case JsonValueKind.Null: return "null";
            case JsonValueKind.True: return "true";
            case JsonValueKind.False: return "false";
            case JsonValueKind.String: return Quote(value.GetString()!);
            case JsonValueKind.Number:
                Require(value.TryGetInt64(out long number) && number >= -9007199254740991L && number <= 9007199254740991L, "Safe integers only"); return number.ToString(CultureInfo.InvariantCulture);
            case JsonValueKind.Array: return "[" + string.Join(',', value.EnumerateArray().Select(Canonical)) + "]";
            case JsonValueKind.Object:
                var properties = value.EnumerateObject().ToArray(); Require(properties.Select(p => p.Name).Distinct().Count() == properties.Length, "Duplicate keys");
                Array.Sort(properties, (a, b) => { uint? ai = Index(a.Name), bi = Index(b.Name); if (ai.HasValue && bi.HasValue) return ai.Value.CompareTo(bi.Value); if (ai.HasValue) return -1; if (bi.HasValue) return 1; return string.CompareOrdinal(a.Name, b.Name); });
                return "{" + string.Join(',', properties.Select(p => Quote(p.Name) + ":" + Canonical(p.Value))) + "}";
            default: throw new InvalidDataException("Unsupported canonical value");
        }
    }
    internal static string Digest(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));
    internal static string Hash(JsonElement value) => Digest(Encoding.UTF8.GetBytes(Canonical(value)));
    internal static bool Hex(string value) => System.Text.RegularExpressions.Regex.IsMatch(value, "\\A[a-f0-9]{64}\\z");
    internal static void Policy(JsonElement policy)
    {
        Exact(policy, "domain", "platform", "threshold", "cooling_ms", "credentials");
        Require(Text(policy, "domain") == "leqvor-founder-policy-v1" && Text(policy, "platform") == "leqvor.vercel.app" && Integer(policy, "threshold") == 2 && Integer(policy, "cooling_ms") == 259200000L, "Unsupported root policy");
        var pins = policy.GetProperty("credentials"); Require(pins.ValueKind == JsonValueKind.Array && pins.GetArrayLength() == 3, "Three independent credentials required");
        var slots = new HashSet<string>(); var ids = new HashSet<string>();
        foreach (var pin in pins.EnumerateArray())
        {
            Exact(pin, "slot", "key_id", "algorithm", "spki");
            string slot = Text(pin, "slot"), id = Text(pin, "key_id"), algorithm = Text(pin, "algorithm"), spki = Text(pin, "spki");
            Require(new[] { "A", "B", "C" }.Contains(slot) && slots.Add(slot) && ids.Add(id) && Hex(id) && spki.Length <= 2048, "Duplicate or invalid credential");
            byte[] der = Convert.FromBase64String(spki); Require(Convert.ToBase64String(der) == spki && Digest(der) == id, "Public fingerprint mismatch");
            if (algorithm == "RS256") { using var key = RSA.Create(); key.ImportSubjectPublicKeyInfo(der, out int read); Require(read == der.Length && key.KeySize >= 2048, "Invalid RSA key"); }
            else { Require(algorithm == "ES256", "Unsupported algorithm"); using var key = ECDsa.Create(); key.ImportSubjectPublicKeyInfo(der, out int read); Require(read == der.Length && key.ExportParameters(false).Curve.Oid.Value == "1.2.840.10045.3.1.7", "P-256 required"); }
        }
    }
    internal static JsonElement Credential(JsonElement policy, string slot) => policy.GetProperty("credentials").EnumerateArray().Single(p => Text(p, "slot") == slot);
    internal static void Request(JsonElement request, JsonElement policy, long version, long now)
    {
        Exact(request, "domain", "platform", "action", "target", "request_id", "nonce", "created_at", "expires_at", "governance_version", "policy_hash", "phase", "proposal_hash");
        Require(Text(request, "domain") == "leqvor-founder-request-v1" && Text(request, "platform") == Text(policy, "platform") && Actions.Contains(Text(request, "action")) && Hex(Text(request, "target")) && Hex(Text(request, "nonce")) && System.Text.RegularExpressions.Regex.IsMatch(Text(request, "request_id"), "\\A[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\\z") && Integer(request, "governance_version") == version && Text(request, "policy_hash") == Hash(policy), "Request does not match independent authority");
        string phase = Text(request, "phase"); Require(phase == "PROPOSE" ? request.GetProperty("proposal_hash").ValueKind == JsonValueKind.Null : phase == "CONFIRM" && Hex(Text(request, "proposal_hash")), "Invalid proposal binding");
        var created = DateTimeOffset.ParseExact(Text(request, "created_at"), "yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal);
        var expires = DateTimeOffset.ParseExact(Text(request, "expires_at"), "yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal);
        long start = created.ToUnixTimeMilliseconds(), end = expires.ToUnixTimeMilliseconds(); Require(start <= now + 30000 && end > now && end > start && end - start <= 600000, "Challenge expired or invalid");
    }
    internal static byte[] Commitment(JsonElement request, string keyId) => Encoding.UTF8.GetBytes("{\"domain\":\"leqvor-founder-approval-v1\",\"request\":" + Canonical(request) + ",\"signer_key_id\":" + Quote(keyId) + "}");
    internal static byte[] CheckpointCommitment(JsonElement checkpoint, string keyId) => Encoding.UTF8.GetBytes("{\"checkpoint\":" + Canonical(checkpoint) + ",\"domain\":\"leqvor-founder-checkpoint-approval-v1\",\"platform\":\"leqvor.vercel.app\",\"signer_key_id\":" + Quote(keyId) + "}");
    internal static byte[] Replacement(JsonElement policy, JsonElement state, JsonElement head, JsonElement packet, string slot, long now)
    {
        Policy(policy); Snapshot(state, head, policy); Exact(packet, "request", "target", "evidence");
        var request = packet.GetProperty("request"); var target = packet.GetProperty("target"); var pin = target.GetProperty("credential");
        long version = Integer(request, "governance_version"); Request(request, policy, version, now);
        Require(Text(request, "action") == "REPLACE_FOUNDER_IDENTITY" && Text(request, "phase") == "CONFIRM" && Integer(state, "version") == version + 1 && state.GetProperty("frozen").ValueKind == JsonValueKind.False, "Unfrozen final replacement authorization required");
        var record = state.GetProperty("requests").GetProperty(Text(request, "request_id"));
        Require(Text(record, "status") == "AUTHORIZED" && Hash(record.GetProperty("request")) == Hash(request), "Replacement differs from independently anchored authorization");
        Exact(target, "domain", "slot", "prior_key_id", "credential", "evidence_hash", "device_instance_hash");
        Require(Text(target, "domain") == "leqvor-founder-replacement-target-v1" && Text(target, "slot") == slot && Text(pin, "slot") == slot && Text(target, "prior_key_id") == Text(Credential(policy, slot), "key_id") && Hash(target) == Text(request, "target") && Hex(Text(target, "device_instance_hash")) && Hash(packet.GetProperty("evidence")) == Text(target, "evidence_hash"), "Replacement target/evidence mismatch");
        Require(!policy.GetProperty("credentials").EnumerateArray().Any(p => Text(p, "key_id") == Text(pin, "key_id")), "Replacement key must be new");
        using var candidate = JsonDocument.Parse("{\"domain\":\"leqvor-founder-policy-v1\",\"platform\":\"leqvor.vercel.app\",\"threshold\":2,\"cooling_ms\":259200000,\"credentials\":[" + string.Join(',', policy.GetProperty("credentials").EnumerateArray().Select(p => Canonical(Text(p, "slot") == slot ? pin : p))) + "]}"); Policy(candidate.RootElement);
        using var commitment = JsonDocument.Parse(JsonSerializer.Serialize(new { domain = "leqvor-founder-device-possession-v1", request_hash = Hash(request), policy_hash = Hash(policy), key_id = Text(pin, "key_id"), evidence_hash = Text(target, "evidence_hash") }));
        return Encoding.UTF8.GetBytes(Canonical(commitment.RootElement));
    }
    internal static void Snapshot(JsonElement state, JsonElement checkpoint, JsonElement policy)
    {
        Exact(state, "policy", "version", "frozen", "requests", "audit");
        Require(Hash(state.GetProperty("policy")) == Hash(policy) && Integer(state, "version") == Integer(checkpoint, "version") && state.GetProperty("frozen").ValueKind is JsonValueKind.True or JsonValueKind.False && state.GetProperty("requests").ValueKind == JsonValueKind.Object, "Snapshot authority mismatch");
        string content = "{\"frozen\":" + Canonical(state.GetProperty("frozen")) + ",\"policy\":" + Canonical(state.GetProperty("policy")) + ",\"requests\":" + Canonical(state.GetProperty("requests")) + ",\"version\":" + Integer(state, "version") + "}";
        Require(Digest(Encoding.UTF8.GetBytes(content)) == Text(checkpoint, "state_hash"), "Independent state checkpoint mismatch");
        var events = state.GetProperty("audit"); Require(events.ValueKind == JsonValueKind.Array && events.GetArrayLength() <= 10000 && events.GetArrayLength() == Integer(checkpoint, "sequence"), "Audit history length mismatch");
        string? previous = null; int index = 0;
        foreach (var item in events.EnumerateArray())
        {
            Exact(item, "domain", "id", "sequence", "previous_hash", "created_at", "event_type", "details", "event_hash");
            Require(Text(item, "domain") == "leqvor-governance-audit-v1" && Integer(item, "sequence") == ++index && (previous == null ? item.GetProperty("previous_hash").ValueKind == JsonValueKind.Null : Text(item, "previous_hash") == previous), "Audit chain mismatch");
            using var body = JsonDocument.Parse("{" + string.Join(',', item.EnumerateObject().Where(p => p.Name != "event_hash").Select(p => Quote(p.Name) + ":" + Canonical(p.Value))) + "}");
            Require(Hash(body.RootElement) == Text(item, "event_hash"), "Audit event changed"); previous = Text(item, "event_hash");
        }
        Require(previous == null ? checkpoint.GetProperty("event_hash").ValueKind == JsonValueKind.Null : Text(checkpoint, "event_hash") == previous, "Independent audit head mismatch");
    }
    internal static string Display(JsonElement value)
    {
        var safe = new StringBuilder(); foreach (char c in Canonical(value)) safe.Append(c is >= '\u202a' and <= '\u202e' or >= '\u2066' and <= '\u2069' or '\u200e' or '\u200f' ? "\\u" + ((int)c).ToString("x4") : c.ToString()); return safe.ToString();
    }
}
