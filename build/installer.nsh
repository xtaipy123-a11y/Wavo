; electron-builder's default updated uninstaller moves every installed file into
; $PLUGINSDIR before deleting it. NSIS Rename cannot move files between drives.
; Wavo allows custom install directories, so upgrades from D: to a C: temp
; directory need a guarded cleanup of the old application directory.

!ifndef BUILD_UNINSTALLER
!macro wavoRecoverUninstall
  IfErrors 0 +3
    DetailPrint "Could not launch the old Wavo uninstaller."
    Return

  ${If} $R0 != 0
    StrCpy $R1 $INSTDIR 2
    StrCpy $R2 $PLUGINSDIR 2
    ${If} $R1 != $R2
    ${AndIf} ${FileExists} "$INSTDIR\resources\app.asar"
    ${AndIf} ${FileExists} "$INSTDIR\Uninstall wavo.exe"
      DetailPrint "Removing old Wavo files across drives: $INSTDIR"
      SetOutPath $TEMP
      RMDir /r "$INSTDIR"
      ${IfNot} ${FileExists} "$INSTDIR\wavo.exe"
      ${AndIfNot} ${FileExists} "$INSTDIR\resources\app.asar"
        StrCpy $R0 0
        ClearErrors
      ${EndIf}
    ${EndIf}
  ${EndIf}

  ${If} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro customUnInstallCheck
  !insertmacro wavoRecoverUninstall
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro wavoRecoverUninstall
!macroend
!endif

; This becomes the uninstaller in new releases, so later updates and a normal
; uninstall also work when Wavo is installed on a different drive than TEMP.
!macro customRemoveFiles
  SetOutPath $TEMP
  RMDir /r "$INSTDIR"
  ${If} ${FileExists} "$INSTDIR\wavo.exe"
  ${OrIf} ${FileExists} "$INSTDIR\resources\app.asar"
    DetailPrint "Could not remove Wavo application files: $INSTDIR"
    Abort "Could not remove Wavo application files."
  ${EndIf}
!macroend
