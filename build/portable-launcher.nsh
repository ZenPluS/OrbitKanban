; Included by build.js before electron-builder's portable launcher script (templates/nsis/portable.nsi).
!include "${__FILEDIR__}\splash-bar.nsh"
Page instfiles "" orbitKanbanLauncherPage

; The page show callback runs once, before the files are unpacked and before Windows displays the launcher window.
Function orbitKanbanLauncherPage
  Push $0
  Push $1
  Push $2
  Push $3
  System::Call 'shell32::SetCurrentProcessExplicitAppUserModelID(w "local.orbita.workspace")'
  ; The launcher hides its own "Installing" window only once extraction starts, so that window used to flash over the splash bitmap:
  ; WS_EX_LAYERED | WS_EX_TOOLWINDOW without WS_EX_APPWINDOW, then LWA_ALPHA with alpha 0 keeps it invisible and off the taskbar.
  System::Call "user32::GetWindowLong(p $HWNDPARENT, i -20) i .r0"
  IntOp $0 $0 | 0x80080
  IntOp $0 $0 & 0xFFFBFFFF
  System::Call "user32::SetWindowLong(p $HWNDPARENT, i -20, i r0)"
  System::Call "user32::SetLayeredWindowAttributes(p $HWNDPARENT, i 0, i 0, i 2)"

  ; Loading bar: an animation control plays build/splash-bar.avi in a loop over the BgImage bitmap, on its own thread,
  ; so the bar keeps moving while the files are unpacked. It disappears together with the bitmap.
  System::Call "kernel32::GetCurrentProcessId() i .r3"
  StrCpy $1 0
  findBitmapWindow:
    FindWindow $1 "NSISBGImage" "" 0 $1
    StrCmp $1 0 done
    System::Call "user32::GetWindowThreadProcessId(p r1, *i .r0)"
    StrCmp $0 $3 0 findBitmapWindow
  System::Call "user32::GetWindowLong(p r1, i -20) i .r0"
  IntOp $0 $0 | 0x80
  IntOp $0 $0 & 0xFFFBFFFF
  System::Call "user32::SetWindowLong(p r1, i -20, i r0)"
  File "/oname=$PLUGINSDIR\splash-bar.avi" "${__FILEDIR__}\splash-bar.avi"
  ; ICC_ANIMATE_CLASS
  System::Call "*(i 8, i 0x80) p .r2"
  System::Call "comctl32::InitCommonControlsEx(p r2)"
  System::Free $2
  ; WS_CLIPCHILDREN: the bitmap window never paints over the bar.
  System::Call "user32::GetWindowLong(p r1, i -16) i .r0"
  IntOp $0 $0 | 0x02000000
  System::Call "user32::SetWindowLong(p r1, i -16, i r0)"
  ; WS_CHILD | WS_VISIBLE | ACS_AUTOPLAY
  System::Call "user32::CreateWindowEx(i 0, w 'SysAnimate32', w '', i 0x50000004, i ${ORBITKANBAN_BAR_X}, i ${ORBITKANBAN_BAR_Y}, i ${ORBITKANBAN_BAR_WIDTH}, i ${ORBITKANBAN_BAR_HEIGHT}, p r1, p 0, p 0, p 0) p .r2"
  StrCmp $2 0 done
  ; ACM_OPENW
  StrCpy $0 "$PLUGINSDIR\splash-bar.avi"
  System::Call "user32::SendMessage(p r2, i 0x467, p 0, w r0) p .r0"
  done:
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
