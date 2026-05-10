@echo off
setlocal

echo ========================================
echo Building yuketang-helper.exe
echo ========================================

REM 1. Ensure folders exist
if not exist assets mkdir assets
if not exist dist mkdir dist

REM 2. Ensure npm is available
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo npm was not found. Please install Node.js first, then run this script again.
    exit /b 1
)

REM 3. Install pkg if missing
where pkg >nul 2>nul
if %errorlevel% neq 0 (
    echo Installing pkg...
    npm install -g pkg
    if %errorlevel% neq 0 (
        echo Failed to install pkg.
        exit /b 1
    )
)

REM 4. Build executable
echo Building exe...
npx pkg . --target node18-win-x64 --output dist\yuketang-helper.exe
if %errorlevel% neq 0 (
    echo Build failed.
    exit /b 1
)

echo ========================================
echo Build complete: dist\yuketang-helper.exe
echo ========================================
pause
