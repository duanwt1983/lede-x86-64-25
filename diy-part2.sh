#!/bin/bash
# Lean 25 extras: daed, iStoreOS UI, samba4 (fix gettext host bootstrap).

set -euo pipefail

rm -rf feeds/packages/lang/golang
git clone --depth=1 -b 26.x https://github.com/sbwml/packages_lang_golang feeds/packages/lang/golang

find . -name Makefile | grep -E '/(luci-app-mosdns|mosdns|luci-app-passwall|luci-app-passwall2)/Makefile$' | while read -r mk; do
  rm -rf "$(dirname "$mk")"
done || true

clone_once() {
  local dest="$1"
  local url="$2"
  local branch="${3:-}"
  if [ -d "$dest" ]; then
    echo "skip existing $dest"
    return 0
  fi
  if [ -n "$branch" ]; then
    git clone --depth=1 -b "$branch" "$url" "$dest"
  else
    git clone --depth=1 "$url" "$dest"
  fi
}

rm -rf package/dae
git clone --depth=1 https://github.com/QiuSimons/luci-app-daed package/dae

rm -rf package/ddns-go package/luci-app-ddns-go /tmp/luci-app-ddns-go
git clone --depth=1 https://github.com/sirpdboy/luci-app-ddns-go /tmp/luci-app-ddns-go
if [ -d /tmp/luci-app-ddns-go/ddns-go ]; then
  cp -a /tmp/luci-app-ddns-go/ddns-go package/ddns-go
  cp -a /tmp/luci-app-ddns-go/luci-app-ddns-go package/luci-app-ddns-go
else
  cp -a /tmp/luci-app-ddns-go package/luci-app-ddns-go
fi
rm -rf feeds/luci/applications/luci-app-ddns-go feeds/packages/net/ddns-go || true

rm -rf feeds/luci/themes/luci-theme-argon feeds/luci/applications/luci-app-argon-config
clone_once package/luci-theme-argon https://github.com/jerrykuku/luci-theme-argon
clone_once package/luci-app-argon-config https://github.com/jerrykuku/luci-app-argon-config

# Disk management (lisaac). Repo nests the LuCI package.
rm -rf package/luci-app-diskman package/parted /tmp/luci-app-diskman
git clone --depth=1 https://github.com/lisaac/luci-app-diskman /tmp/luci-app-diskman
if [ -d /tmp/luci-app-diskman/applications/luci-app-diskman ]; then
  cp -a /tmp/luci-app-diskman/applications/luci-app-diskman package/luci-app-diskman
elif [ -d /tmp/luci-app-diskman/luci-app-diskman ]; then
  cp -a /tmp/luci-app-diskman/luci-app-diskman package/luci-app-diskman
else
  cp -a /tmp/luci-app-diskman package/luci-app-diskman
fi
rm -rf /tmp/luci-app-diskman

# Web file manager.
rm -rf package/luci-app-filebrowser package/filebrowser /tmp/luci-app-filebrowser
git clone --depth=1 https://github.com/sbwml/luci-app-filebrowser /tmp/luci-app-filebrowser
if [ -d /tmp/luci-app-filebrowser/luci-app-filebrowser ]; then
  cp -a /tmp/luci-app-filebrowser/luci-app-filebrowser package/luci-app-filebrowser
  [ -d /tmp/luci-app-filebrowser/filebrowser ] && cp -a /tmp/luci-app-filebrowser/filebrowser package/filebrowser
else
  cp -a /tmp/luci-app-filebrowser package/luci-app-filebrowser
fi
rm -rf /tmp/luci-app-filebrowser

# samba4 pulls gettext-full/host. Lean gettext-0.22.5 tarball is already
# bootstrapped; Host/Bootstrap runs autogen.sh against tools/gnulib
# (gnulib-tool.py) and fails (mismatched patches such as exitfail.h).
# Skip re-bootstrap so samba4 can use the release tree as-is.
if [ -f package/libs/gettext-full/Makefile ]; then
  sed -i \
    -e '/call Host\/Bootstrap/d' \
    -e '/call Build\/Bootstrap/d' \
    package/libs/gettext-full/Makefile
fi

./scripts/feeds install \
  luci-app-daed daed \
  ddns-go luci-app-ddns-go \
  luci-theme-argon luci-app-argon-config \
  luci-app-quickstart luci-app-istorex luci-app-store \
  luci-app-fastnet fastnet \
  luci-app-samba4 samba4-server \
  luci-app-diskman luci-app-filebrowser \
  || true

sed -i 's/luci-theme-bootstrap/luci-theme-argon/g' feeds/luci/collections/luci/Makefile || true
sed -i 's/luci-theme-bootstrap/luci-theme-argon/g' feeds/luci/collections/luci-light/Makefile || true
sed -i 's/luci-theme-bootstrap/luci-theme-argon/g' feeds/luci/collections/luci-nginx/Makefile || true
