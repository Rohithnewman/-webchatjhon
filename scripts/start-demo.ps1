# Starts API, worker and dashboard in three PowerShell windows.
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backend'; .venv\Scripts\uvicorn.exe app.main:app --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backend'; .venv\Scripts\python.exe -m app.worker"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontend'; npm run dev"

Write-Host "API      : http://127.0.0.1:8000/docs"
Write-Host "Dashboard: http://localhost:5173"
Write-Host "Seed demo: cd backend; .venv\Scripts\python.exe -m scripts.seed_demo"
