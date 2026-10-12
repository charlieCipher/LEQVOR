param(
  [string]$Sdk = "$env:LOCALAPPDATA\Android\Sdk",
  [string]$Java = 'C:\Program Files\Android\Android Studio\jbr\bin',
  [string]$Output = "$PSScriptRoot\..\..\..\.local-release\founder-android"
)
$ErrorActionPreference = 'Stop'
$platform = Join-Path $Sdk 'platforms\android-36\android.jar'
$build = Join-Path $Sdk 'build-tools\36.0.0'
$classes = Join-Path $Output 'classes'
$dex = Join-Path $Output 'dex'
New-Item -ItemType Directory -Force -Path $classes,$dex | Out-Null
$sources = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'src') -Recurse -Filter '*.java' | ForEach-Object FullName
& (Join-Path $Java 'javac.exe') --release 17 -classpath $platform -d $classes @sources
if ($LASTEXITCODE -ne 0) { throw 'Java compilation failed' }
$classFiles = Get-ChildItem -LiteralPath $classes -Recurse -Filter '*.class' | ForEach-Object FullName
& (Join-Path $Java 'java.exe') -classpath (Join-Path $build 'lib\d8.jar') com.android.tools.r8.D8 --lib $platform --min-api 31 --output $dex @classFiles
if ($LASTEXITCODE -ne 0) { throw 'DEX conversion failed' }
$apk = Join-Path $Output 'leqvor-founder-unsigned.apk'
& (Join-Path $build 'aapt2.exe') link -o $apk -I $platform --manifest (Join-Path $PSScriptRoot 'AndroidManifest.xml') --min-sdk-version 31 --target-sdk-version 36
if ($LASTEXITCODE -ne 0) { throw 'Manifest packaging failed' }
& (Join-Path $Java 'jar.exe') --update --file $apk -C $dex classes.dex
if ($LASTEXITCODE -ne 0) { throw 'APK packaging failed' }
Get-FileHash -LiteralPath $apk -Algorithm SHA256 | Select-Object Path,Hash
Write-Output 'Unsigned build only. No application installed, founder key created, or release identity signed.'
