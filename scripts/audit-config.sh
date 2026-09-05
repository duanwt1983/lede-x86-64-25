#!/bin/bash
# Fail before the 2-hour compile if the image set is wrong.
set -euo pipefail

must_y=(
  CONFIG_PACKAGE_luci-ssl-nginx
  CONFIG_PACKAGE_luci-theme-argon
  CONFIG_PACKAGE_luci-app-passwall
  CONFIG_PACKAGE_luci-app-mosdns
  CONFIG_PACKAGE_mosdns
  CONFIG_PACKAGE_luci-app-istorex
  CONFIG_PACKAGE_luci-app-store
  CONFIG_PACKAGE_luci-app-quickstart
  CONFIG_PACKAGE_luci-app-fastnet
  CONFIG_PACKAGE_luci-app-samba4
  CONFIG_PACKAGE_samba4-server
  CONFIG_PACKAGE_luci-app-diskman
  CONFIG_PACKAGE_luci-app-filemanager
  CONFIG_PACKAGE_luci-app-ddns-go
  CONFIG_PACKAGE_ddns-go
  CONFIG_PACKAGE_luci-app-ttyd
  CONFIG_PACKAGE_luci-app-mwan3
  CONFIG_PACKAGE_mwan3
  CONFIG_PACKAGE_firewall4
  CONFIG_PACKAGE_nftables
  CONFIG_TARGET_ROOTFS_EXT4FS
  CONFIG_GRUB_EFI_IMAGES
  CONFIG_VMDK_IMAGES
)

must_n=(
  CONFIG_PACKAGE_uhttpd
  CONFIG_PACKAGE_uhttpd-mod-ubus
  CONFIG_PACKAGE_luci-ssl
  CONFIG_PACKAGE_firewall
  CONFIG_PACKAGE_iptables
  CONFIG_PACKAGE_iptables-nft
  CONFIG_PACKAGE_iptables-zz-legacy
  CONFIG_PACKAGE_ip6tables
  CONFIG_PACKAGE_ip6tables-nft
  CONFIG_PACKAGE_ip6tables-zz-legacy
  CONFIG_PACKAGE_ddns-scripts_aliyun
  CONFIG_PACKAGE_ddns-scripts_dnspod
  CONFIG_PACKAGE_luci-app-ddns
  CONFIG_PACKAGE_luci-app-arpbind
  CONFIG_PACKAGE_luci-app-filetransfer
  CONFIG_PACKAGE_luci-app-ssr-plus
  CONFIG_PACKAGE_luci-app-vsftpd
  CONFIG_PACKAGE_luci-app-vlmcsd
  CONFIG_PACKAGE_luci-app-autoreboot
  CONFIG_PACKAGE_luci-i18n-arpbind-zh-cn
  CONFIG_PACKAGE_luci-i18n-filetransfer-zh-cn
  CONFIG_PACKAGE_luci-app-passwall_Iptables_Transparent_Proxy
  CONFIG_TARGET_ROOTFS_SQUASHFS
  CONFIG_GRUB_IMAGES
)

fail=0

for k in "${must_y[@]}"; do
  if ! grep -q "^${k}=y$" .config; then
    echo "AUDIT FAIL: missing ${k}=y"
    grep -E "^# ${k} is not set|^${k}=" .config || true
    fail=1
  fi
done

for k in "${must_n[@]}"; do
  if grep -q "^${k}=y$" .config; then
    echo "AUDIT FAIL: ${k} must not be selected"
    fail=1
  fi
done

if ! grep -q '^CONFIG_TARGET_ROOTFS_PARTSIZE=1024$' .config; then
  echo "AUDIT FAIL: rootfs partsize is not 1024"
  grep TARGET_ROOTFS_PARTSIZE .config || true
  fail=1
fi

if grep -q 'ddns-scripts_aliyun\|ddns-scripts_dnspod\|luci-app-ssr-plus\|luci-app-arpbind\|luci-app-filetransfer' include/target.mk; then
  echo "AUDIT FAIL: Lean DEFAULT_PACKAGES still contains junk in include/target.mk"
  fail=1
fi

if grep -Eq '(^|[[:space:]])(iptables|ip6tables|firewall)([[:space:]]|$)' include/target.mk; then
  echo "AUDIT FAIL: include/target.mk still lists iptables/firewall"
  fail=1
fi

echo "==== audit snapshot ===="
grep -E '^CONFIG_PACKAGE_(luci-ssl-nginx|nginx-ssl|uhttpd|luci-theme-argon|luci-app-argon-config|luci-app-mwan3|mwan3|firewall4|nftables|iptables|luci-app-passwall|luci-app-samba4|ddns-scripts)=' .config || true

if [ "$fail" -ne 0 ]; then
  echo "Config audit failed. Fix defaults before compiling."
  exit 1
fi

echo "Config audit passed."
