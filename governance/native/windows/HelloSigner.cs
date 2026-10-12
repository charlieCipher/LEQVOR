using System.Security.Cryptography;
using System.Text.Json;
using Windows.Security.Credentials;
using Windows.Security.Cryptography;
using Windows.Security.Cryptography.Core;

namespace Leqvor.Founder;

internal static class HelloSigner
{
    private const string Alias = "LEQVOR-Founder-Slot-A-v1";
    private static byte[] Bytes(Windows.Storage.Streams.IBuffer buffer) { CryptographicBuffer.CopyToByteArray(buffer, out byte[] bytes); return bytes; }
    private static async Task<KeyCredential> Open(bool create)
    {
        Protocol.Require(await KeyCredentialManager.IsSupportedAsync(), "Windows Hello unavailable. No software fallback.");
        var result = await KeyCredentialManager.OpenAsync(Alias);
        if (result.Status == KeyCredentialStatus.NotFound && create) result = await KeyCredentialManager.RequestCreateAsync(Alias, KeyCredentialCreationOption.FailIfExists);
        Protocol.Require(result.Status == KeyCredentialStatus.Success, "Local Windows Hello key unavailable or operation cancelled");
        return result.Credential;
    }
    private static async Task<KeyCredentialAttestationResult> Evidence(KeyCredential credential)
    {
        var evidence = await credential.GetAttestationAsync();
        Protocol.Require(evidence.Status == KeyCredentialAttestationStatus.Success && evidence.AttestationBuffer.Length > 0 && evidence.CertificateChainBuffer.Length > 0, "TPM attestation unavailable. Signing blocked; no software fallback.");
        // Successful OS status is not independent certificate-chain/TPM-blob validation.
        return evidence;
    }
    internal static async Task<byte[]> PublicEnrollment()
    {
        var key = await Open(true); var evidence = await Evidence(key);
        byte[] publicKey = Bytes(key.RetrievePublicKey(CryptographicPublicKeyBlobType.X509SubjectPublicKeyInfo));
        return JsonSerializer.SerializeToUtf8Bytes(new { domain = "leqvor-founder-device-evidence-v1", credential = new { slot = "A", algorithm = "RS256", spki = Convert.ToBase64String(publicKey), key_id = Protocol.Digest(publicKey) }, attestation = Convert.ToBase64String(Bytes(evidence.AttestationBuffer)), certificate_chain = Convert.ToBase64String(Bytes(evidence.CertificateChainBuffer)), independently_verified = false });
    }
    internal static async Task<byte[]> Approve(JsonElement request, JsonElement policy, long version)
    {
        var key = await Open(false); await Evidence(key);
        byte[] publicKey = Bytes(key.RetrievePublicKey(CryptographicPublicKeyBlobType.X509SubjectPublicKeyInfo));
        string keyId = Protocol.Digest(publicKey); var pin = Protocol.Credential(policy, "A");
        Protocol.Require(Protocol.Text(pin, "algorithm") == "RS256" && Protocol.Text(pin, "key_id") == keyId, "Local key differs from independent root policy");
        Protocol.Request(request, policy, version, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        byte[] bytes = Protocol.Commitment(request, keyId);
        var result = await key.RequestSignAsync(CryptographicBuffer.CreateFromByteArray(bytes));
        Protocol.Require(result.Status == KeyCredentialStatus.Success, "Windows Hello approval cancelled or unavailable");
        Protocol.Request(request, policy, version, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        byte[] signature = Bytes(result.Result);
        using var verifier = RSA.Create(); verifier.ImportSubjectPublicKeyInfo(publicKey, out _);
        Protocol.Require(verifier.VerifyData(bytes, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1), "Windows Hello signature format failed verification");
        return JsonSerializer.SerializeToUtf8Bytes(new { slot = "A", key_id = keyId, signature = Convert.ToBase64String(signature) });
    }
    internal static async Task<byte[]> ApproveCheckpoint(JsonElement checkpoint, JsonElement policy)
    {
        var key = await Open(false); await Evidence(key);
        byte[] publicKey = Bytes(key.RetrievePublicKey(CryptographicPublicKeyBlobType.X509SubjectPublicKeyInfo));
        string keyId = Protocol.Digest(publicKey); var pin = Protocol.Credential(policy, "A");
        Protocol.Require(Protocol.Text(pin, "algorithm") == "RS256" && Protocol.Text(pin, "key_id") == keyId, "Local key differs from independent root policy");
        byte[] bytes = Protocol.CheckpointCommitment(checkpoint, keyId);
        var result = await key.RequestSignAsync(CryptographicBuffer.CreateFromByteArray(bytes));
        Protocol.Require(result.Status == KeyCredentialStatus.Success, "Windows Hello checkpoint approval cancelled or unavailable");
        byte[] signature = Bytes(result.Result);
        using var verifier = RSA.Create(); verifier.ImportSubjectPublicKeyInfo(publicKey, out _);
        Protocol.Require(verifier.VerifyData(bytes, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1), "Checkpoint signature format failed verification");
        return JsonSerializer.SerializeToUtf8Bytes(new { checkpoint, approval = new { slot = "A", key_id = keyId, signature = Convert.ToBase64String(signature) } });
    }
}
