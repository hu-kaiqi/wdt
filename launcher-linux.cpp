// wdt Linux 引导程序：执行 ./wdt [文件...] → 静默拉起 Electron 应用并转发文件参数
// 编译：g++ -std=c++14 -O2 -o wdt launcher-linux.cpp
#include <unistd.h>
#include <limits.h>
#include <cstdio>
#include <string>
#include <vector>

int main(int argc, char* argv[]) {
    char buf[PATH_MAX];
    ssize_t n = readlink("/proc/self/exe", buf, PATH_MAX - 1);
    if (n <= 0) { perror("readlink"); return 1; }
    buf[n] = '\0';
    std::string self(buf);
    std::string dir = self.substr(0, self.find_last_of('/'));
    std::string electron = dir + "/node_modules/electron/dist/electron";

    // 参数数组：electron 应用目录 [文件...]，execv 原样转发
    std::vector<char*> v;
    v.push_back(const_cast<char*>(electron.c_str()));
    v.push_back(const_cast<char*>(dir.c_str()));
    for (int i = 1; i < argc; ++i) v.push_back(argv[i]);
    v.push_back(nullptr);

    execv(electron.c_str(), v.data());
    fprintf(stderr, "未能启动 wdt：找不到 %s\n请先运行 ./build.sh 安装依赖。\n", electron.c_str());
    return 1;
}
