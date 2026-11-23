// wdt launcher: double-click wdt.exe or open-with a file -> start Electron and forward args.
// Build (Dev-C++ TDM-GCC 4.9.2): g++ -std=c++14 -O2 -s -mwindows -o wdt.exe launcher.cpp -lshell32
#include <windows.h>
#include <shellapi.h>
#include <string>

static std::wstring exeDir() {
    wchar_t buf[MAX_PATH];
    DWORD n = GetModuleFileNameW(nullptr, buf, MAX_PATH);
    std::wstring s(buf, n);
    size_t p = s.find_last_of(L'\\');
    return (p == std::wstring::npos) ? L"." : s.substr(0, p);
}

int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR, int) {
    std::wstring dir = exeDir();
    std::wstring electron = dir + L"\\node_modules\\electron\\dist\\electron.exe";

    std::wstring args;
    int argc = 0;
    LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    if (argv) {
        for (int i = 1; i < argc; ++i) {
            args += L" \"";
            args += argv[i];
            args += L"\"";
        }
        LocalFree(argv);
    }

    std::wstring cmd = L"\"" + electron + L"\" \"" + dir + L"\"" + args;
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    ZeroMemory(&pi, sizeof(pi));
    si.cb = sizeof(si);

    if (!CreateProcessW(electron.c_str(), &cmd[0], nullptr, nullptr, FALSE,
                        CREATE_NO_WINDOW, nullptr, dir.c_str(), &si, &pi)) {
        MessageBoxW(nullptr,
            L"Cannot start wdt: node_modules\\electron\\dist\\electron.exe not found.\nRun build.cmd first.",
            L"wdt", MB_OK | MB_ICONERROR);
        return 1;
    }
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return 0;
}
