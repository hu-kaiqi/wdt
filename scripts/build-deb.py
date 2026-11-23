# 手工构造 deb（无需 fpm/Ruby），自墨码 scripts/build-deb.py 移植：
#   data.tar.xz  = ./opt/wdt(linux-unpacked) + .desktop + hicolor 图标
#   control.tar.gz = ./control + ./postinst（修 chrome-sandbox 4755）
#   wdt.deb = ar 归档(debian-binary + control.tar.gz + data.tar.xz)
# 用法：python scripts/build-deb.py <release目录> <版本>
import io
import os
import sys
import tarfile

PKG = 'wdt'
ICON_PNG = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icon.png')


def build_data_tar(release_dir, version):
    src = os.path.join(release_dir, 'linux-unpacked')
    if not os.path.isdir(src):
        sys.exit('找不到 ' + src + '，先跑 npm run dist:linux（electron-builder --linux dir）')
    out = os.path.join(release_dir, 'data.tar.xz')

    def fix(ti):
        ti.uid = ti.gid = 0
        ti.uname = ti.gname = 'root'
        base = os.path.basename(ti.name)
        if ti.isdir() or ti.name.endswith(('.so', '.so.1', '.so.2')) or base in (
                PKG, 'chrome_crashpad_handler', 'chrome-sandbox', 'v8_context_snapshot.bin'):
            ti.mode = 0o755
        else:
            ti.mode = 0o644
        return ti

    with tarfile.open(out, 'w:xz', format=tarfile.GNU_FORMAT) as tar:
        tar.add(src, arcname='opt/' + PKG, filter=fix)
        desktop = ('[Desktop Entry]\n'
                   'Name=wdt\n'
                   'GenericName=Markdown Editor\n'
                   'Comment=Word 2010 style Markdown editor (three-mode)\n'
                   'Exec=/opt/wdt/wdt %U\n'
                   'Icon=wdt\n'
                   'Terminal=false\n'
                   'Type=Application\n'
                   'Categories=Office;WordProcessor;TextEditor;\n'
                   'MimeType=text/markdown;text/plain;\n')
        info = tarfile.TarInfo(f'usr/share/applications/{PKG}.desktop')
        data = desktop.encode('utf-8')
        info.size = len(data)
        info.mode = 0o644
        tar.addfile(info, io.BytesIO(data))
        # hicolor 图标（256x256 icon.png 在仓；缺了不致命）
        if os.path.isfile(ICON_PNG):
            with open(ICON_PNG, 'rb') as f:
                pdata = f.read()
            pinfo = tarfile.TarInfo(f'usr/share/icons/hicolor/256x256/apps/{PKG}.png')
            pinfo.size = len(pdata)
            pinfo.mode = 0o644
            tar.addfile(pinfo, io.BytesIO(pdata))
    return out


def build_control_tar(release_dir, version):
    control = (
        'Package: ' + PKG + '\n'
        'Version: ' + version + '\n'
        'Section: utils\n'
        'Priority: optional\n'
        'Architecture: amd64\n'
        'Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libsecret-1-0, libgbm1, libasound2t64 | libasound2\n'
        'Maintainer: hu-kaiqi <hu-kaiqi@users.noreply.github.com>\n'
        'Description: wdt - Word 2010 style Markdown editor\n'
        ' Three-mode Markdown editor: presentation / hybrid / source.\n'
    )
    out = os.path.join(release_dir, 'control.tar.gz')
    postinst = '#!/bin/sh\nchmod 4755 /opt/' + PKG + '/chrome-sandbox 2>/dev/null || true\nexit 0\n'
    with tarfile.open(out, 'w:gz', format=tarfile.GNU_FORMAT) as tar:
        info = tarfile.TarInfo('control')
        data = control.encode('utf-8')
        info.size = len(data)
        info.mode = 0o644
        tar.addfile(info, io.BytesIO(data))
        pi = tarfile.TarInfo('postinst')
        pdata = postinst.encode('utf-8')
        pi.size = len(pdata)
        pi.mode = 0o755
        tar.addfile(pi, io.BytesIO(pdata))
    return out


def ar_member(name, data, mode='100644'):
    header = (name.ljust(16) + '0'.ljust(12) + '0'.ljust(6) + '0'.ljust(6)
              + mode.ljust(8) + str(len(data)).ljust(10) + '`\n')
    pad = b'\n' if len(data) % 2 else b''
    return header.encode('ascii') + data + pad


def build_deb(release_dir, version):
    data_path = build_data_tar(release_dir, version)
    ctrl_path = build_control_tar(release_dir, version)
    deb_path = os.path.join(release_dir, PKG + '_' + version + '_amd64.deb')
    with open(deb_path, 'wb') as f:
        f.write(b'!<arch>\n')
        f.write(ar_member('debian-binary', b'2.0\n'))
        with open(ctrl_path, 'rb') as c:
            f.write(ar_member('control.tar.gz', c.read()))
        with open(data_path, 'rb') as d:
            f.write(ar_member('data.tar.xz', d.read()))
    print('deb written:', deb_path, f'{os.path.getsize(deb_path)/1048576:.1f}MB')


if __name__ == '__main__':
    build_deb(sys.argv[1] if len(sys.argv) > 1 else 'release',
              sys.argv[2] if len(sys.argv) > 2 else '0.1.3')
