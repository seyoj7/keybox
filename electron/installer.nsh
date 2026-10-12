!include WinMessages.nsh

!ifndef BUILD_UNINSTALLER
!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW KeyboxShowInstFiles
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE KeyboxInstFilesLeave
!macroend

Function KeyboxShowInstFiles
  titprog::Start
FunctionEnd

Function KeyboxInstFilesLeave
  FindWindow $0 "#32770" "" $HWNDPARENT
  GetDlgItem $1 $0 1004
  StrCmp $1 0 keyboxInstFilesLeaveDone
  ; The install section has finished, so it is safe to show completion now.
  SendMessage $1 ${PBM_SETRANGE32} 0 100
  SendMessage $1 ${PBM_SETPOS} 100 0
  Sleep 500
keyboxInstFilesLeaveDone:
FunctionEnd
!endif
