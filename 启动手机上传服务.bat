@echo off
chcp 65001 >nul
set "SHITI_DATA_ROOT=E:\错题本数据"
cd /d "%~dp0"
"D:\Program Files\nodejs\node.exe" mobile-server.js
