#!/bin/bash
# Before feeds update.

set -euo pipefail

if ! grep -q 'src-git passwall_packages' feeds.conf.default; then
  sed -i '1i src-git passwall_packages https://github.com/Openwrt-Passwall/openwrt-passwall-packages.git;main' feeds.conf.default
  sed -i '2i src-git passwall_luci https://github.com/Openwrt-Passwall/openwrt-passwall.git;main' feeds.conf.default
fi

if ! grep -q 'src-git nas ' feeds.conf.default; then
  echo 'src-git nas https://github.com/linkease/nas-packages.git;master' >> feeds.conf.default
  echo 'src-git nas_luci https://github.com/linkease/nas-packages-luci.git;main' >> feeds.conf.default
  echo 'src-git istore https://github.com/linkease/istore.git;main' >> feeds.conf.default
fi
