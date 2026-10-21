; Custom NSIS pages and steps for the Dryland ADE installer (ADR 0004). Included by electron-builder.
; Putting `dryland` on the user's PATH is opt-in: a checkbox on its own page, off by default. The uninstaller always
; takes the entry out again.
!include MUI2.nsh
!include nsDialogs.nsh
!include LogicLib.nsh

!ifndef BUILD_UNINSTALLER
  Var DrylandPathCheckbox
  Var DrylandAddToPath

  Function DrylandPathPageCreate
    !insertmacro MUI_HEADER_TEXT "Command line" "Choose whether to use dryland from any terminal."
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateCheckbox} 0 0 100% 24u "Add the dryland command to my PATH"
    Pop $DrylandPathCheckbox
    ${NSD_CreateLabel} 12u 28u 100% 36u "Without this, dryland works inside Dryland ADE sessions and from the launcher in the install directory. With it, any new terminal can run dryland."
    Pop $0
    nsDialogs::Show
  FunctionEnd

  Function DrylandPathPageLeave
    ${NSD_GetState} $DrylandPathCheckbox $DrylandAddToPath
  FunctionEnd
!endif

!macro customPageAfterChangeDir
  Page custom DrylandPathPageCreate DrylandPathPageLeave
!macroend

!macro customInstall
  ${If} $DrylandAddToPath == ${BST_CHECKED}
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\path.ps1" add "$INSTDIR\resources\bin"'
    Pop $0
  ${EndIf}
!macroend

!macro customUnInstall
  ; An update runs the old uninstaller first; the PATH entry points at the same directory afterwards, so keep it.
  ${IfNot} ${isUpdated}
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\path.ps1" remove "$INSTDIR\resources\bin"'
    Pop $0
  ${EndIf}
!macroend
