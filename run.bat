@echo off
REM 启动 Python 服务器
start "" python server.py

REM 等待服务器启动
ping 127.0.0.1 -n 3 > nul

REM 在 Chrome 浏览器中打开网页
start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" http://localhost:8000

REM 保持命令行窗口打开
pause