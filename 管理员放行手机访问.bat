@echo off
chcp 65001 >nul
net session >nul 2>&1
if not %errorlevel%==0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -Command "$name='拾题手机端局域网上传'; Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule; New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Protocol TCP -LocalPort 17332 -Profile Any -RemoteAddress LocalSubnet | Out-Null"
powershell -NoProfile -Command "$name='拾题手机端自动发现'; Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule; New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Protocol UDP -LocalPort 17333 -Profile Any -RemoteAddress LocalSubnet | Out-Null"
echo.
echo 已允许专用局域网设备访问 TCP 17332 和 UDP 17333。
pause
