; ══════════════════════════════════════════════════════════════════════════════
; MedInventory — Inno Setup Script
; Produces a proper Windows .exe installer (Setup_MedInventory_v1.1.0.exe)
;
; Prerequisites:
;   1. Download Inno Setup from https://jrsoftware.org/isdl.php (free)
;   2. Open this .iss file in Inno Setup
;   3. Click Build → Compile
;   4. The .exe appears in the installer/output/ folder
;
; The resulting installer bundles ALL application files and:
;   - Installs to C:\MedInventory (user-configurable)
;   - Checks for Docker Desktop and warns if missing
;   - Runs install.ps1 at the end to start containers and configure the system
;   - Creates a desktop shortcut and Start Menu entry
;   - Includes an uninstaller
; ══════════════════════════════════════════════════════════════════════════════

#define AppName      "MedInventory"
#define AppVersion   "1.1.0"
#define AppPublisher "Your Clinic Name"
#define AppURL       "http://localhost:3000"
#define AppExeName   "MedInventory.exe"

[Setup]
AppId={{7F3A2B8C-4D1E-4F9A-B2C5-8E6D3A1F7B9E}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
OutputDir=output
OutputBaseFilename=Setup_MedInventory_v{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile=MedInventory.ico
UninstallDisplayIcon={app}\uninstall.ps1
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "autostart";   Description: "Start MedInventory automatically when Windows starts"; GroupDescription: "Auto-start"; Flags: checked

[Files]
; Application source files (node_modules excluded — Docker builds inside container)
Source: "..\backend\*";         DestDir: "{app}\backend";   Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "node_modules,dist"
Source: "..\frontend\*";        DestDir: "{app}\frontend";  Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "node_modules,dist,coverage"
Source: "..\docker-compose.yml"; DestDir: "{app}";          Flags: ignoreversion
Source: "..\docker-compose.dev.yml"; DestDir: "{app}";      Flags: ignoreversion
Source: "..\.env.example";      DestDir: "{app}";           Flags: ignoreversion
Source: "..\version.json";      DestDir: "{app}";           Flags: ignoreversion
Source: "install.ps1";          DestDir: "{app}\installer"; Flags: ignoreversion
Source: "uninstall.ps1";        DestDir: "{app}";           Flags: ignoreversion
Source: "..\update.ps1";        DestDir: "{app}";           Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}";                          Filename: "{app}\open.bat"
Name: "{group}\{cm:UninstallProgram,{#AppName}}";   Filename: "{uninstallexe}"
Name: "{commondesktop}\{#AppName}";                  Filename: "{app}\open.bat"; Tasks: desktopicon

[Run]
; Run the PowerShell installer script after files are copied
Filename: "powershell.exe"; \
    Parameters: "-ExecutionPolicy Bypass -NonInteractive -File ""{app}\installer\install.ps1"""; \
    Description: "Set up MedInventory (start Docker containers)"; \
    Flags: runhidden waituntilterminated; \
    StatusMsg: "Starting MedInventory services..."

[UninstallRun]
Filename: "powershell.exe"; \
    Parameters: "-ExecutionPolicy Bypass -NonInteractive -Command ""Set-Location '{app}'; docker compose down"""; \
    Flags: runhidden waituntilterminated

[Code]
// Check Docker Desktop is installed before proceeding
function InitializeSetup(): Boolean;
var
  DockerPath: String;
  ResultCode: Integer;
begin
  Result := True;

  // Check if docker.exe is on PATH
  if not FileExists(ExpandConstant('{pf}\Docker\Docker\resources\bin\docker.exe')) then
  begin
    if MsgBox(
      'Docker Desktop does not appear to be installed.' + #13#10 + #13#10 +
      'MedInventory requires Docker Desktop to run.' + #13#10 +
      'The installer will attempt to download it for you.' + #13#10 + #13#10 +
      'Click OK to continue (Docker will be downloaded during installation),' + #13#10 +
      'or Cancel to install Docker Desktop manually first.',
      mbConfirmation, MB_OKCANCEL
    ) = IDCANCEL then
      Result := False;
  end;
end;

// Create a simple open.bat launcher
procedure CurStepChanged(CurStep: TSetupStep);
var
  BatchContent: String;
  BatchFile: String;
begin
  if CurStep = ssPostInstall then
  begin
    BatchFile := ExpandConstant('{app}\open.bat');
    BatchContent :=
      '@echo off' + #13#10 +
      'start "" "http://localhost:3000"' + #13#10;
    SaveStringToFile(BatchFile, BatchContent, False);
  end;
end;
