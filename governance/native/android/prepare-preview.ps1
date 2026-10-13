param([switch]$CreatePreviewPublisher)
$ErrorActionPreference = 'Stop'
# Local preview distribution only. This software publisher is not a founder
# credential, production release identity, attestation verifier or activation.
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$publisher = Join-Path $workspace '.local-release/founder-preview-publisher'
$keystore = Join-Path $publisher 'preview-publisher.p12'
$protectedPassword = Join-Path $publisher 'password.dpapi'
$java = 'C:\Program Files\Android\Android Studio\jbr\bin'
$buildTools = Join-Path $env:LOCALAPPDATA 'Android/Sdk/build-tools/36.0.0'
$unsigned = Join-Path $workspace '.local-release/founder-android/leqvor-founder-unsigned.apk'
foreach ($tool in @((Join-Path $java 'keytool.exe'),(Join-Path $java 'java.exe'),(Join-Path $buildTools 'zipalign.exe'),(Join-Path $buildTools 'lib/apksigner.jar'),$unsigned)) {
    if (!(Test-Path -LiteralPath $tool -PathType Leaf)) { throw 'Required local build/signing tool or unsigned package is missing.' }
}
if (!(Test-Path -LiteralPath $keystore) -or !(Test-Path -LiteralPath $protectedPassword)) {
    if (!$CreatePreviewPublisher) { throw 'Explicit local preview publisher creation required.' }
    if ((Test-Path -LiteralPath $keystore) -or (Test-Path -LiteralPath $protectedPassword)) { throw 'Incomplete publisher state; refusing replacement. Review it locally.' }
    New-Item -ItemType Directory -Force -Path $publisher | Out-Null
    $publisherSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $publisher /inheritance:r /grant:r "*${publisherSid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Publisher directory access protection failed.' }
    $publisherRandom = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($publisherRandom)
    $env:LEQVOR_PREVIEW_PUBLISHER_PASSWORD = [Convert]::ToBase64String($publisherRandom)
    try {
        $publisherSecret = ConvertTo-SecureString $env:LEQVOR_PREVIEW_PUBLISHER_PASSWORD -AsPlainText -Force
        [IO.File]::WriteAllText($protectedPassword, (ConvertFrom-SecureString $publisherSecret))
        & (Join-Path $java 'keytool.exe') -genkeypair -alias leqvor-local-preview -keyalg RSA -keysize 3072 -sigalg SHA256withRSA -validity 3650 -dname 'CN=LEQVOR Local Preview, O=LENVOR' -storetype PKCS12 -keystore $keystore -storepass:env LEQVOR_PREVIEW_PUBLISHER_PASSWORD -keypass:env LEQVOR_PREVIEW_PUBLISHER_PASSWORD 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Local preview publisher generation failed; partial state retained for review.' }
    } finally { Remove-Item Env:LEQVOR_PREVIEW_PUBLISHER_PASSWORD -ErrorAction SilentlyContinue }
}
$output = Join-Path $workspace ('.local-release/founder-android-preview-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $output | Out-Null
$aligned = Join-Path $output 'leqvor-founder-aligned.apk'
$signed = Join-Path $output 'LEQVOR-Founder-Approval-Preview.apk'
& (Join-Path $buildTools 'zipalign.exe') -p 4 $unsigned $aligned
if ($LASTEXITCODE -ne 0) { throw 'APK alignment failed.' }
$publisherSecure = ConvertTo-SecureString ([IO.File]::ReadAllText($protectedPassword))
$publisherPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($publisherSecure)
try {
    $env:LEQVOR_PREVIEW_PUBLISHER_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($publisherPointer)
    & (Join-Path $java 'java.exe') -jar (Join-Path $buildTools 'lib/apksigner.jar') sign --ks $keystore --ks-key-alias leqvor-local-preview --ks-pass env:LEQVOR_PREVIEW_PUBLISHER_PASSWORD --key-pass env:LEQVOR_PREVIEW_PUBLISHER_PASSWORD --v4-signing-enabled false --out $signed $aligned
    if ($LASTEXITCODE -ne 0) { throw 'Preview signing failed.' }
} finally {
    Remove-Item Env:LEQVOR_PREVIEW_PUBLISHER_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($publisherPointer)
}
& (Join-Path $java 'java.exe') -jar (Join-Path $buildTools 'lib/apksigner.jar') verify --verbose --print-certs -Werr $signed
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
& (Join-Path $buildTools 'zipalign.exe') -c -p 4 $signed
if ($LASTEXITCODE -ne 0) { throw 'Signed APK alignment verification failed.' }
$manifest = [ordered]@{ purpose='local-physical-device-preview-only'; package='com.lenvor.leqvor.founder'; apk=$signed; sha256=(Get-FileHash -LiteralPath $signed -Algorithm SHA256).Hash.ToLowerInvariant(); founder_authority_active=$false; independently_reviewed=$false; publisher_is_founder_key=$false }
[IO.File]::WriteAllText((Join-Path $output 'preview-manifest.json'),($manifest | ConvertTo-Json))
$manifest | ConvertTo-Json
