@echo off
rem Render the Home hero frames on an NVIDIA/AMD GPU (Windows). Double-click, or run from this folder.
rem Needs Blender 5.2 and Python 3 with Pillow (pip install pillow). Set BLENDER if Blender is installed elsewhere.
setlocal
cd /d "%~dp0"
if "%BLENDER%"=="" set "BLENDER=C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
if not exist "%BLENDER%" (
  echo Blender not found at "%BLENDER%". Install Blender 5.2 or run: set BLENDER=C:\path\to\blender.exe
  pause & exit /b 1
)

if not exist tex\oak_veneer_01_diff.jpg (
  echo Downloading the Poly Haven textures...
  python fetch_assets.py || (echo fetch_assets.py failed. Is Python with Pillow installed? & pause & exit /b 1)
)

echo.
echo Test frame (check that the log says "Cycles on OPTIX" or "Cycles on CUDA")...
"%BLENDER%" -b -P film.py -- --gpu --still 0.5 --samples 64 --res 1920x1080 | findstr /C:"Cycles on" /C:"No GPU" /C:"Saved:"
echo Test frame written to out\film_still_0.5.png
choice /M "Render all 120 frames now (about 30-60 minutes)"
if errorlevel 2 exit /b 0

"%BLENDER%" -b -P film.py -- --gpu --total 120 --samples 64 --res 1920x1080 | findstr /C:"Cycles on" /C:"done" /C:"Error"
python frames_to_web.py
echo.
echo Done. Commit and push site\assets\hero-frames, then tell Claude:
echo   git add ..\..\site\assets\hero-frames
echo   git commit -m "Hero frames: 1080p GPU render"
echo   git push
pause
