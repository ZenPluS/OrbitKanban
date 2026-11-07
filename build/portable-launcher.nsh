; Included by build.js before electron-builder's portable launcher script (templates/nsis/portable.nsi).
; The launcher shows the app's own loading screen (src/desktop/splash/splash.html) while it unpacks the app. Chromium does not
; exist yet, so the page is shown by the HTML engine built into Windows (MSHTML, IE11 mode) in an ATL host window on the
; launcher's UI thread, which stays free and keeps the page animated while the install thread unpacks the files.
!ifndef ORBITKANBAN_FALLBACK_SPLASH
  !error "build.js must define ORBITKANBAN_FALLBACK_SPLASH (the loading screen bitmap) and point SPLASH_IMAGE to the placeholder."
!endif
!define ORBITKANBAN_SPLASH_PAGE "${__FILEDIR__}\..\src\desktop\splash"
Var orbitKanbanSplash
Page instfiles "" orbitKanbanLauncherPage

; The page show callback runs once, before the files are unpacked and before Windows displays the launcher window.
Function orbitKanbanLauncherPage
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  Push $8
  Push $9
  System::Call 'shell32::SetCurrentProcessExplicitAppUserModelID(w "local.orbita.workspace")'
  ; The launcher hides its own "Installing" window only once extraction starts, so that window used to flash over the loading screen:
  ; WS_EX_LAYERED | WS_EX_TOOLWINDOW without WS_EX_APPWINDOW, then LWA_ALPHA with alpha 0 keeps it invisible and off the taskbar.
  System::Call "user32::GetWindowLong(p $HWNDPARENT, i -20) i .r0"
  IntOp $0 $0 | 0x80080
  IntOp $0 $0 & 0xFFFBFFFF
  System::Call "user32::SetWindowLong(p $HWNDPARENT, i -20, i r0)"
  System::Call "user32::SetLayeredWindowAttributes(p $HWNDPARENT, i 0, i 0, i 2)"

  ; The template's bitmap window (BgImage) shows the 1x1 placeholder: kept off the taskbar, then hidden or used as the fallback.
  System::Call "kernel32::GetCurrentProcessId() i .r3"
  StrCpy $1 0
  findBitmapWindow:
    FindWindow $1 "NSISBGImage" "" 0 $1
    StrCmp $1 0 bitmapWindowFound
    System::Call "user32::GetWindowThreadProcessId(p r1, *i .r0)"
    StrCmp $0 $3 0 findBitmapWindow
  bitmapWindowFound:
  StrCmp $1 0 bitmapWindowReady
    System::Call "user32::GetWindowLong(p r1, i -20) i .r0"
    IntOp $0 $0 | 0x80
    IntOp $0 $0 & 0xFFFBFFFF
    System::Call "user32::SetWindowLong(p r1, i -20, i r0)"
  bitmapWindowReady:

  CreateDirectory "$PLUGINSDIR\splash"
  File "/oname=$PLUGINSDIR\splash\splash.html" "${ORBITKANBAN_SPLASH_PAGE}\splash.html"
  File "/oname=$PLUGINSDIR\splash\splash.js" "${ORBITKANBAN_SPLASH_PAGE}\splash.js"
  StrCpy $9 "#version=${VERSION}"
  ; Colors and logo of the organization that opens at start, saved by the app (SplashTheme) next to its data.
  System::Call 'kernel32::CopyFileW(w "$EXEDIR\data\runtime\splash-theme.css", w "$PLUGINSDIR\splash\splash-theme.css", i 0) i .r0'
  StrCmp $0 0 +2
  StrCpy $9 "$9&theme=splash-theme.css"
  GetFullPathName /SHORT $0 "$PLUGINSDIR\splash\splash.html"
  StrCmp $0 "" 0 +2
  StrCpy $0 "$PLUGINSDIR\splash\splash.html"
  StrCpy $9 "file:///$0$9"

  System::Call "ole32::OleInitialize(p 0) i .r0"
  System::Call "atl::AtlAxWinInit() i .r0"
  ; Sized in physical pixels (per-monitor DPI awareness for this window only), so the text stays sharp; splash.js zooms the page to fit.
  System::Call "user32::SetThreadDpiAwarenessContext(p -4) p .r5"
  System::Call "user32::GetDpiForSystem() i .r6"
  IntCmp $6 0 0 0 dpiKnown
    StrCpy $6 96
  dpiKnown:
  System::Call "kernel32::MulDiv(i 520, i r6, i 96) i .r7"
  System::Call "kernel32::MulDiv(i 320, i r6, i 96) i .r8"
  ; Centered on the whole primary screen, like the app's own loading screen.
  System::Call "user32::GetSystemMetrics(i 0) i .r2"
  System::Call "user32::GetSystemMetrics(i 1) i .r3"
  IntOp $2 $2 - $7
  IntOp $2 $2 / 2
  IntOp $3 $3 - $8
  IntOp $3 $3 / 2
  ; WS_EX_TOOLWINDOW (off the taskbar), WS_POPUP | WS_VISIBLE.
  System::Call "user32::CreateWindowEx(i 0x80, w 'AtlAxWin', w r9, i 0x90000000, i r2, i r3, i r7, i r8, p 0, p 0, p 0, p 0) p .r4"
  StrCmp $5 "error" dpiRestored
    System::Call "user32::SetThreadDpiAwarenessContext(p r5)"
  dpiRestored:
  StrCmp $4 0 showFallback
    StrCpy $orbitKanbanSplash $4
    StrCmp $1 0 done
    ShowWindow $1 0
    Goto done
  showFallback:
    ; Windows could not open the HTML page: the bitmap window shows the same screen as a still image.
    File "/oname=$PLUGINSDIR\splash-fallback.bmp" "${ORBITKANBAN_FALLBACK_SPLASH}"
    BgImage::SetBg "$PLUGINSDIR\splash-fallback.bmp"
    BgImage::Redraw
  done:
  Pop $9
  Pop $8
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

; Called from the install thread: the window belongs to the UI thread, which destroys it when it handles WM_CLOSE.
Function orbitKanbanCloseSplash
  StrCmp $orbitKanbanSplash "" closed
    ; SMTO_ABORTIFHUNG, at most 2 seconds.
    System::Call "user32::SendMessageTimeout(p $orbitKanbanSplash, i 0x10, p 0, p 0, i 2, i 2000, p 0)"
    StrCpy $orbitKanbanSplash ""
  closed:
FunctionEnd

; Inserted by the template inside its section, right after the app is unpacked (extractAppPackage.nsh).
; The template destroys its loading screen before it starts the app, which left the screen empty while OrbitKanban started.
; Here the launcher starts the app itself and keeps the loading screen until the app creates the signal file, once its main
; window is visible (DesktopApplication). It then waits for the app, cleans up like the template and quits, so the template does
; not start the app a second time. If the app cannot be started this way, the template's own sequence runs as before.
!macro customFiles_x64
  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_DIR", "$EXEDIR").r0'
  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_FILE", "$EXEPATH").r0'
  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_APP_FILENAME", "${APP_FILENAME}").r0'
  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("ORBITKANBAN_LAUNCHER_SIGNAL", "$PLUGINSDIR\orbitkanban-ready").r0'
  ${StdUtils.GetAllParameters} $R0 0
  StrCpy $R3 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" $R0'
  ; Zero-filled STARTUPINFOW and PROCESS_INFORMATION (x64).
  System::Alloc 104
  Pop $R1
  System::Call "*$R1(i 104)"
  System::Alloc 24
  Pop $R2
  System::Call "kernel32::CreateProcessW(p 0, w R3, p 0, p 0, i 0, i 0, p 0, p 0, p R1, p R2) i .r0"
  System::Free $R1
  IntCmp $0 0 orbitKanbanNotStarted
  System::Call "*$R2(p .R4, p .R5)"
  System::Free $R2
  System::Call "kernel32::CloseHandle(p R5)"
  StrCpy $R3 0
  orbitKanbanStarting:
    System::Call "kernel32::WaitForSingleObject(p R4, i 25) i .r0"
    ; Anything but WAIT_TIMEOUT means the app has already exited.
    IntCmp $0 258 0 orbitKanbanStarted orbitKanbanStarted
    IfFileExists "$PLUGINSDIR\orbitkanban-ready" orbitKanbanStarted
    IntOp $R3 $R3 + 25
    IntCmp $R3 30000 orbitKanbanStarted orbitKanbanStarting orbitKanbanStarted
  orbitKanbanStarted:
  Call orbitKanbanCloseSplash
  BgImage::Destroy
  System::Call "kernel32::WaitForSingleObject(p R4, i -1)"
  System::Call "kernel32::GetExitCodeProcess(p R4, *i .r0)"
  System::Call "kernel32::CloseHandle(p R4)"
  SetErrorLevel $0
  SetOutPath $EXEDIR
  RMDir /r $INSTDIR
  Quit
  orbitKanbanNotStarted:
  System::Free $R2
  System::Call 'Kernel32::SetEnvironmentVariable(t "ORBITKANBAN_LAUNCHER_SIGNAL", p 0)'
  ; The template starts the app without the signal, so the app shows its own loading screen.
  Call orbitKanbanCloseSplash
!macroend