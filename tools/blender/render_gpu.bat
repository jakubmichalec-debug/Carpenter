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
echo Grain and Joint - GPU render of the hero frames
echo Folder: %CD%
echo.

echo [1/5] Looking for Blender...
if "%BLENDER%"=="" set "BLENDER=C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
if not exist "%BLENDER%" (
  for /d %%D in ("C:\Program Files\Blender Foundation\Blender *") do if exist "%%D\blender.exe" set "BLENDER=%%D\blender.exe"
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
%PY% -c "import PIL" >nul 2>nul
if errorlevel 1 (
  echo   Python with Pillow was not found. Install Python from https://www.python.org/downloads/
  echo   ^(tick "Add python.exe to PATH"^), then run:  pip install pillow
  goto :end
)
echo   Using %PY%

echo [3/5] Textures...
if not exist tex\oak_veneer_01_diff.jpg (
  echo   Downloading the Poly Haven textures, about 1 minute...
  %PY% fetch_assets.py
  if errorlevel 1 ( echo   fetch_assets.py failed, see the message above. & goto :end )
) else (
  echo   Already downloaded.
)

echo [4/5] Test frame. The next lines should say "Cycles on OPTIX" or "Cycles on CUDA"...
"%BLENDER%" -b -P film.py -- --gpu --still 0.5 --samples 64 --res 1920x1080 | findstr /C:"Cycles on" /C:"No GPU" /C:"Saved:" /C:"Error" /C:"Traceback"
if not exist out\film_still_0.5.png ( echo   The test frame was not written, see the message above. & goto :end )
echo   Test frame saved: %CD%\out\film_still_0.5.png
start "" "out\film_still_0.5.png"
choice /M "Render all 120 frames now (about 30-60 minutes)"
if errorlevel 2 goto :end

echo [5/5] Rendering 120 frames. A line appears as each frame finishes; frames go to out\frames\
"%BLENDER%" -b -P film.py -- --gpu --total 120 --samples 64 --res 1920x1080 | findstr /C:"Cycles on" /C:"done" /C:"Error" /C:"Traceback"
%PY% frames_to_web.py
echo.
echo Done. Now commit and push the frames:
echo   cd ..\..
echo   git add site/assets/hero-frames
echo   git commit -m "Hero frames: 1080p GPU render"
echo   git push

:end
echo.
echo You can close this window.
