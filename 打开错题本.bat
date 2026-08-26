@echo off
cd /d "%~dp0"
title 拾题 · 错题本
set PORT=8732

REM 检查 python 是否可用（Windows 需要 Python 3）
where python >nul 2>nul
if %errorlevel%==0 goto :python_ok
where py >nul 2>nul
if %errorlevel%==0 goto :py_launcher
echo [错误] 未找到 Python。请先安装 Python 3：https://www.python.org/downloads/
echo 安装时勾选 "Add Python to PATH"，然后重新双击本文件。
pause
exit /b 1

:py_launcher
start "" http://127.0.0.1:%PORT%/index.html
py -m http.server %PORT%
exit /b 0

:python_ok
start "" http://127.0.0.1:%PORT%/index.html
python -m http.server %PORT%
