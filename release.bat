@echo off
setlocal
echo =========================================
echo  Gaming Cafe Management - Release Script
echo =========================================
echo.

echo This script will bump the version, commit the changes, build the executable, and release it to GitHub.
echo.

set /p ver="Enter version bump (patch, minor, major) or a specific version (e.g. 1.0.2) [default: patch]: "
if "%ver%"=="" set ver=patch

echo.
echo [1/4] Bumping version to %ver% and creating commit...
call npm version %ver%

if %errorlevel% neq 0 (
    echo Error bumping version. Make sure your working directory is clean.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/4] Building and publishing release to GitHub...
echo Note: This requires the GH_TOKEN environment variable to be set for GitHub releases.
call npm run electron:publish

if %errorlevel% neq 0 (
    echo Error during build/publish.
    pause
    exit /b %errorlevel%
)

echo.
echo [3/4] Pushing commit and tags to repository...
git push --follow-tags

if %errorlevel% neq 0 (
    echo Error pushing to repository.
    pause
    exit /b %errorlevel%
)

echo.
echo [4/4] Release complete!
echo =========================================
pause
