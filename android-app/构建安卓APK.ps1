$ErrorActionPreference='Stop'
$sdk='E:\Android\Sdk'
$gradle='E:\Android\gradle\gradle-8.9\bin\gradle.bat'
$toolsZip='E:\AI-Workspace\cache\commandlinetools-win-latest.zip'
$gradleZip='E:\AI-Workspace\cache\gradle-8.9-bin.zip'

New-Item -ItemType Directory -Force -Path $sdk,'E:\Android\gradle' | Out-Null
if(-not (Test-Path $gradle)) { Expand-Archive -LiteralPath $gradleZip -DestinationPath 'E:\Android\gradle' -Force }
if(-not (Test-Path "$sdk\cmdline-tools\latest\bin\sdkmanager.bat")) {
    $tmp='E:\Android\cmdline-tools-extract'
    if(Test-Path $tmp){Remove-Item -LiteralPath $tmp -Recurse -Force}
    Expand-Archive -LiteralPath $toolsZip -DestinationPath $tmp -Force
    New-Item -ItemType Directory -Force -Path "$sdk\cmdline-tools\latest" | Out-Null
    Get-ChildItem -LiteralPath "$tmp\cmdline-tools" -Force | Move-Item -Destination "$sdk\cmdline-tools\latest" -Force
}
$env:ANDROID_HOME=$sdk; $env:ANDROID_SDK_ROOT=$sdk; $env:GRADLE_USER_HOME='E:\AI-Workspace\cache\gradle-home'
$sdkManager="$sdk\cmdline-tools\latest\bin\sdkmanager.bat"
$licenseCmd='(for /l %i in (1,1,30) do @echo y) | "' + $sdkManager + '" --sdk_root="' + $sdk + '" --licenses'
& $env:COMSPEC /d /s /c $licenseCmd | Out-Null
& $sdkManager --sdk_root=$sdk 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0'
& $gradle --no-daemon assembleDebug
$apk=Get-Item '.\app\build\outputs\apk\debug\app-debug.apk'
Copy-Item -LiteralPath $apk.FullName -Destination 'E:\错题本数据\拾题手机端-debug.apk' -Force
Write-Output 'APK_READY=E:\错题本数据\拾题手机端-debug.apk'
