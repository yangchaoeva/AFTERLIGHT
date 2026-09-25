# 声音

`src/audio.js` 提供 Web Audio 引擎基音/谐波、负载响应、换挡过渡、风噪、轮胎滑移、倒计时与完赛提示音。

`public/audio` 中十段 WAV 使用本机 Microsoft Huihui Desktop 中文语音通过 System.Speech 生成。24 kHz、16-bit、mono，全部随游戏提供，播放不依赖语音云服务。若文件缺失则尝试浏览器语音合成。

生成命令（Windows PowerShell 5.1）：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/generate-voice.ps1
```

声音仅在点击开始或鉴赏后启动。暂停会挂起 AudioContext，全部静音与语音静音分别控制。本地播报是合成语音，不冒充真人或任何公众人物。
