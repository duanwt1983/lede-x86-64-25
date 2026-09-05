#!/bin/bash
# Lean 25 extras: PassWall + mosdns, FastNet, samba4, nginx, nft mwan3.

set -euo pipefail

rm -rf feeds/packages/lang/golang
git clone --depth=1 -b 26.x https://github.com/sbwml/packages_lang_golang feeds/packages/lang/golang

# Drop stale mosdns copies so sbwml v5 wins. Do not remove PassWall feeds.
find . -name Makefile | grep -E '/(luci-app-mosdns|mosdns|v2ray-geodata)/Makefile$' | while read -r mk; do
  case "$mk" in
    */package/luci-app-mosdns/*|*/package/mosdns/*|*/package/v2ray-geodata/*) ;;
    *) rm -rf "$(dirname "$mk")" ;;
  esac
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

clone_once package/luci-app-mosdns https://github.com/sbwml/luci-app-mosdns v5
clone_once package/v2ray-geodata https://github.com/sbwml/v2ray-geodata

rm -rf package/ddns-go package/luci-app-ddns-go /tmp/luci-app-ddns-go
git clone --depth=1 https://github.com/sirpdboy/luci-app-ddns-go /tmp/luci-app-ddns-go
if [ -d /tmp/luci-app-ddns-go/ddns-go ]; then
  cp -a /tmp/luci-app-ddns-go/ddns-go package/ddns-go
  cp -a /tmp/luci-app-ddns-go/luci-app-ddns-go package/luci-app-ddns-go
else
  cp -a /tmp/luci-app-ddns-go package/luci-app-ddns-go
fi
rm -rf feeds/luci/applications/luci-app-ddns-go feeds/packages/net/ddns-go || true

# Feed copies + leftover symlinks cause "incompatible architecture" at image install.
rm -rf feeds/luci/themes/luci-theme-argon feeds/luci/applications/luci-app-argon-config
rm -rf package/feeds/luci/luci-theme-argon package/feeds/luci/luci-app-argon-config
clone_once package/luci-theme-argon https://github.com/jerrykuku/luci-theme-argon
clone_once package/luci-app-argon-config https://github.com/jerrykuku/luci-app-argon-config
for mk in package/luci-theme-argon/Makefile package/luci-app-argon-config/Makefile; do
  if [ -f "$mk" ] && ! grep -q '^PKGARCH:=all' "$mk"; then
    sed -i 's|include $(TOPDIR)/feeds/luci/luci.mk|PKGARCH:=all\ninclude $(TOPDIR)/feeds/luci/luci.mk|' "$mk"
  fi
done

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

rm -rf package/luci-app-filemanager /tmp/owrt-luci
git clone --depth=1 --filter=blob:none --sparse https://github.com/openwrt/luci /tmp/owrt-luci
git -C /tmp/owrt-luci sparse-checkout set applications/luci-app-filemanager
cp -a /tmp/owrt-luci/applications/luci-app-filemanager package/luci-app-filemanager
rm -rf /tmp/owrt-luci
sed -i 's|include ../../luci.mk|include $(TOPDIR)/feeds/luci/luci.mk|' package/luci-app-filemanager/Makefile

# Official mwan3 needs iptables-nft. Use the nftables port so firewall stays fw4-only.
rm -rf feeds/packages/net/mwan3 feeds/luci/applications/luci-app-mwan3
rm -rf package/feeds/packages/mwan3 package/feeds/luci/luci-app-mwan3
rm -rf package/mwan3 package/luci-app-mwan3
git clone --depth=1 -b openwrt-25.12 https://github.com/dl12345/mwan3 package/mwan3
git clone --depth=1 -b openwrt-25.12 https://github.com/dl12345/luci-app-mwan3 package/luci-app-mwan3
sed -i 's|include ../../luci.mk|include $(TOPDIR)/feeds/luci/luci.mk|' package/luci-app-mwan3/Makefile
if ! grep -q '^PKGARCH:=all' package/luci-app-mwan3/Makefile; then
  sed -i 's|include $(TOPDIR)/feeds/luci/luci.mk|PKGARCH:=all\ninclude $(TOPDIR)/feeds/luci/luci.mk|' package/luci-app-mwan3/Makefile
fi
# Lean package name uses hyphens; the nft port Makefile uses underscores.
sed -i 's/libnetfilter_conntrack/libnetfilter-conntrack/g' package/mwan3/Makefile

# samba4 -> gettext-full/host. Lean 0.22.5 tarball is already bootstrapped.
if [ -f package/libs/gettext-full/Makefile ]; then
  sed -i \
    -e '/call Host\/Bootstrap/d' \
    -e '/call Build\/Bootstrap/d' \
    -e '/^PKG_FIXUP:=autoreconf/d' \
    -e '/^export GNULIB_SRCDIR/d' \
    package/libs/gettext-full/Makefile
fi

# Image install reads DEFAULT_PACKAGES even when those configs are disabled.
# That is why 33953034108 compiled for ~2h then failed on aliyun/dnspod/argon/i18n.
python3 - <<'PY'
from pathlib import Path
import re

p = Path("include/target.mk")
text = p.read_text()
pat = re.compile(
    r"^DEFAULT_PACKAGES\.router:=\\(?:\n[^\n]*\\)*\n[^\n]*\n",
    re.M,
)
new_router = (
    "DEFAULT_PACKAGES.router:=\\\n"
    "\tdnsmasq-full firewall4 nftables-json ppp ppp-mod-pppoe odhcp6c odhcpd-ipv6only \\\n"
    "\tblock-mount coremark kmod-nf-nathelper kmod-nf-nathelper-extra kmod-tun \\\n"
    "\tip-full default-settings luci-nginx luci-proto-ipv6 curl ca-certificates\n"
)
text2, n = pat.subn(new_router, text, count=1)
if n != 1:
    raise SystemExit(f"DEFAULT_PACKAGES.router replace failed (matches={n})")
if any(s in text2 for s in ("ddns-scripts_aliyun", "luci-app-ssr-plus", "luci-app-arpbind")):
    raise SystemExit("old Lean router defaults still present after patch")
p.write_text(text2)

x86 = Path("target/linux/x86/Makefile")
if x86.exists():
    t = re.sub(r"\bautosamba\b", "", x86.read_text())
    x86.write_text(t)
print("patched DEFAULT_PACKAGES.router:")
print(new_router)
PY

sed -i 's/192.168.1.1/192.168.9.1/g' package/base-files/files/bin/config_generate || true
if [ -f package/lean/default-settings/files/zzz-default-settings ]; then
  sed -i 's/192.168.1.1/192.168.9.1/g' package/lean/default-settings/files/zzz-default-settings || true
  sed -i -E 's/^([[:space:]]*iptables)/# \1/' package/lean/default-settings/files/zzz-default-settings || true
  sed -i -E 's/^([[:space:]]*ip6tables)/# \1/' package/lean/default-settings/files/zzz-default-settings || true
fi

sed -i 's/luci-theme-bootstrap/luci-theme-argon/g' feeds/luci/collections/luci/Makefile || true
sed -i 's/luci-theme-bootstrap/luci-theme-argon/g' feeds/luci/collections/luci-light/Makefile || true
sed -i 's/luci-theme-bootstrap/luci-theme-argon/g' feeds/luci/collections/luci-nginx/Makefile || true
# Do not rewrite luci-light to nginx-mod-luci: that creates a kconfig cycle.
# Keep luci-light / luci-ssl unselected so uhttpd stays out.

if [ ! -d feeds/luci/collections/luci-nginx ]; then
  echo "missing feeds/luci/collections/luci-nginx"
  exit 1
fi
if ! grep -Rqs --include=Makefile 'Package/nftables-json' package/network/utils/nftables 2>/dev/null; then
  echo "missing nftables-json; mwan3 nft port cannot be selected"
  exit 1
fi

./scripts/feeds install \
  luci-app-passwall luci-app-mosdns mosdns v2dat \
  ddns-go luci-app-ddns-go \
  luci-theme-argon luci-app-argon-config \
  luci-app-fastnet fastnet \
  luci-app-samba4 samba4-server \
  luci-app-diskman luci-app-filemanager \
  luci-nginx nginx nginx-mod-luci \
  uwsgi uwsgi-luci-support \
  samba4-server samba4 \
  mwan3 luci-app-mwan3 \
  || true
