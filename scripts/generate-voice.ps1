# Rebuild bundled Mandarin race narration with Windows' locally installed TTS.
# This is synthesized speech, not a human voice performance. No network calls.
# The file intentionally uses ASCII source with JSON Unicode escapes so it also
# works in Windows PowerShell 5.1 regardless of the host's script encoding.
[CmdletBinding()]
param([string]$VoiceName = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$raceProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$raceAudioPath = [IO.Path]::GetFullPath((Join-Path $raceProjectRoot 'public\audio'))
if (-not $raceAudioPath.StartsWith($raceProjectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Output path must remain inside this project.'
}
[IO.Directory]::CreateDirectory($raceAudioPath) | Out-Null
$raceSpeaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $raceVoices = @($raceSpeaker.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'zh-CN' })
    if ($VoiceName) {
        $raceSpeaker.SelectVoice($VoiceName)
    } else {
        # Desktop voices expose the reliable SAPI 5 interface used by System.Speech.
        $raceChosen = $raceVoices | Where-Object { $_.VoiceInfo.Name -match 'Desktop' } | Select-Object -First 1
        if (-not $raceChosen) { $raceChosen = $raceVoices | Select-Object -First 1 }
        if (-not $raceChosen) { throw 'No Mandarin Windows speech voice is installed. The game can use browser speech synthesis instead.' }
        $raceSpeaker.SelectVoice($raceChosen.VoiceInfo.Name)
    }
    $raceLines = '{"welcome":"\u6b22\u8fce\u6765\u5230\u9010\u5149\u6d77\u5cb8\u3002\u4eab\u53d7\u9a7e\u9a76\u3002","ready":"\u5f15\u64ce\u5c31\u7eea\uff0c\u51c6\u5907\u8d77\u8dd1\u3002","three":"\u4e09","two":"\u4e8c","one":"\u4e00","go":"\u51fa\u53d1\uff01","finalLap":"\u6700\u540e\u4e00\u5708\uff0c\u4fdd\u6301\u8282\u594f\u3002","finish":"\u6bd4\u8d5b\u5b8c\u6210\u3002\u6f02\u4eae\u7684\u9a7e\u9a76\uff01","reset":"\u5df2\u8fd4\u56de\u8d5b\u9053\u3002","overtake":"\u6f02\u4eae\u7684\u8d85\u8f66\uff01"}' | ConvertFrom-Json
    $raceFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(24000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $raceSpeaker.Volume = 90
    foreach ($raceLine in $raceLines.PSObject.Properties) {
        $raceSpeaker.Rate = if ($raceLine.Name -in @('three', 'two', 'one', 'go')) { 2 } else { 1 }
        $raceFile = Join-Path $raceAudioPath ($raceLine.Name + '.wav')
        $raceSpeaker.SetOutputToWaveFile($raceFile, $raceFormat)
        $raceSpeaker.Speak([string]$raceLine.Value)
        $raceSpeaker.SetOutputToNull()
        [pscustomobject]@{ Key = $raceLine.Name; Voice = $raceSpeaker.Voice.Name; Bytes = (Get-Item -LiteralPath $raceFile).Length }
    }
} finally {
    $raceSpeaker.Dispose()
}
