@echo off
rem Render the Home hero frames on an NVIDIA/AMD GPU (Windows). Double-click, or run from this folder.
rem Needs Blender 5.2 and Python 3 with Pillow (pip install pillow). Set BLENDER if Blender is installed elsewhere.

rem When double-clicked, reopen inside "cmd /k" so the window stays open and any error stays readable.
if not "%~1"=="--inner" (
  cmd /k ""%~f0" --inner"
  exit /b
)

setlocal
cd /d "%~dp0"

rem ---- Render settings. Change these, then delete out\frames so every frame is rendered again. ----
rem RES     1920x1080 is sharp on most screens; 2560x1440 for 1440p and high-DPI laptops (about 1.8x the time
rem         and the download size).
rem FRAMES  more frames = smoother scroll (240 is twice as smooth as 120, and twice the time and download).
rem SAMPLES more samples = less grain before the denoiser (128 is about twice the time of 64).
if not defined RES set "RES=1920x1080"
if not defined FRAMES set "FRAMES=120"
if not defined SAMPLES set "SAMPLES=64"
echo Grain and Joint - GPU render of the hero frames
echo Folder: %CD%
echo.

echo [1/5] Looking for Blender...
if "%BLENDER%"=="" set "BLENDER=C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
if not exist "%BLENDER%" (
  rem any install under Blender Foundation: "Blender 5.2", "blender-5.2.3-candidate+...-windows.amd64-release", ...
  for /d %%D in ("C:\Program Files\Blender Foundation\*") do if exist "%%D\blender.exe" set "BLENDER=%%D\blender.exe"
  for /d %%D in ("C:\Program Files\blender*") do if exist "%%D\blender.exe" set "BLENDER=%%D\blender.exe"
)
if not exist "%BLENDER%" (
  echo   Blender was not found. Install it from https://www.blender.org/download/
  echo   or point to it first, for example:  set BLENDER=D:\Blender\blender.exe
  goto :end
)
echo   Using "%BLENDER%"

echo [2/5] Looking for Python...
set "PY=python"
where python >nul 2>nul || set "PY=py"
%PY% -c "import PIL, numpy" >nul 2>nul
if errorlevel 1 (
  echo   Python with Pillow and numpy was not found. Install Python from https://www.python.org/downloads/
  echo   ^(tick "Add python.exe to PATH"^), then run:  pip install pillow numpy
  goto :end
)
echo   Using %PY%

echo [3/5] Textures...
if not exist tex\models\side_table_01\side_table_01.gltf (
  echo   Downloading the Poly Haven textures, about 1 minute...
  %PY% fetch_assets.py
  if errorlevel 1 ( echo   fetch_assets.py failed, see the message above. & goto :end )
) else (
  echo   Already downloaded.
)

echo [4/5] Test frame. The next lines should say "Cycles on OPTIX" or "Cycles on CUDA"...
"%BLENDER%" -b -P film.py -- --gpu --still 0.5 --samples %SAMPLES% --res %RES% | findstr /C:"Cycles on" /C:"No GPU" /C:"Saved:" /C:"Error" /C:"Traceback"
if not exist out\film_still_0.5.png ( echo   The test frame was not written, see the message above. & goto :end )
echo   Test frame saved: %CD%\out\film_still_0.5.png
start "" "out\film_still_0.5.png"
echo   Settings: %FRAMES% frames at %RES%, %SAMPLES% samples ^(change them at the top of render_gpu.bat^)
choice /M "Render all %FRAMES% frames now (120 at 1080p and 64 samples take about 30-60 minutes)"
if errorlevel 2 goto :end

echo [5/5] Rendering %FRAMES% frames. A line appears as each frame finishes; frames go to out\frames\
echo   Frames that already exist are skipped. To redo them all, delete the out\frames folder first.
"%BLENDER%" -b -P film.py -- --gpu --total %FRAMES% --samples %SAMPLES% --res %RES% | findstr /C:"Cycles on" /C:"done" /C:"Error" /C:"Traceback"
echo Rendering the before/after pair for the Home slider...
"%BLENDER%" -b -P film.py -- --gpu --ba --samples 128 | findstr /C:"Cycles on" /C:"Saved:" /C:"Error" /C:"Traceback"
%PY% frames_to_web.py
echo.
echo Done. Now commit and push the frames:
echo   cd ..\..
echo   git add site/assets
echo   git commit -m "Hero frames: %FRAMES% frames at %RES%"
echo   git push

:end
echo.
echo You can close this window.
