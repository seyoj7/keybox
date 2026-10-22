!include WinMessages.nsh

!ifndef BUILD_UNINSTALLER
!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW KeyboxShowInstFiles
!macroend

Function KeyboxShowInstFiles
  titprog::Start
FunctionEnd
!endif
