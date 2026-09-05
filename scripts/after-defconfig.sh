#!/bin/bash
# Select the requested set, then strip Lean's default luci apps.
# Final disable must run AFTER the last defconfig, or Lean DEFAULT_PACKAGES
# (ssr-plus, vsftpd, vlmcsd, ...) come back.

set -euo pipefail

enable_pkg() {
  local p="$1"
  sed -i "/^CONFIG_PACKAGE_${p}=/d" .config
  sed -i "/^# CONFIG_PACKAGE_${p} is not set/d" .config
  echo "CONFIG_PACKAGE_${p}=y" >> .config
}

disable_pkg() {
  local p="$1"
  sed -i "/^CONFIG_PACKAGE_${p}=/d" .config
  sed -i "/^# CONFIG_PACKAGE_${p} is not set/d" .config
  echo "# CONFIG_PACKAGE_${p} is not set" >> .config
}

force_y() {
  local k="$1"
  sed -i "/^# ${k} is not set/d; /^${k}=/d" .config
  echo "${k}=y" >> .config
}

force_n() {
  local k="$1"
  sed -i "/^# ${k} is not set/d; /^${k}=/d" .config
  echo "# ${k} is not set" >> .config
}

select_wanted() {
  enable_pkg luci-theme-argon
  enable_pkg luci-app-argon-config
  enable_pkg luci-app-ttyd
  enable_pkg luci-i18n-ttyd-zh-cn
  enable_pkg luci-app-passwall
  enable_pkg luci-i18n-passwall-zh-cn
  force_y CONFIG_PACKAGE_luci-app-passwall_Nftables_Transparent_Proxy
  force_y CONFIG_PACKAGE_luci-app-passwall_INCLUDE_Xray
  force_y CONFIG_PACKAGE_luci-app-passwall_INCLUDE_SingBox
  force_y CONFIG_PACKAGE_luci-app-passwall_INCLUDE_Geoview
  force_y CONFIG_PACKAGE_luci-app-passwall_INCLUDE_Haproxy
  force_y CONFIG_PACKAGE_luci-app-passwall_INCLUDE_Shadowsocks_Rust_Client
  force_y CONFIG_PACKAGE_luci-app-passwall_INCLUDE_ShadowsocksR_Libev_Client
  force_y CONFIG_PACKAGE_luci-app-passwall_INCLUDE_Simple_Obfs
  force_y CONFIG_PACKAGE_luci-app-passwall_INCLUDE_V2ray_Plugin
  enable_pkg luci-app-mosdns
  enable_pkg luci-i18n-mosdns-zh-cn
  enable_pkg mosdns
  enable_pkg v2dat
  enable_pkg luci-app-ddns-go
  enable_pkg ddns-go
  enable_pkg luci-app-istorex
  enable_pkg luci-app-store
  enable_pkg luci-app-quickstart
  enable_pkg luci-lib-taskd
  enable_pkg luci-app-fastnet
  enable_pkg fastnet
  enable_pkg luci-app-samba4
  enable_pkg luci-i18n-samba4-zh-cn
  enable_pkg samba4-server
  enable_pkg wsdd2
  enable_pkg luci-app-diskman
  enable_pkg luci-i18n-diskman-zh-cn
  enable_pkg luci-app-filemanager
  enable_pkg luci-i18n-filemanager-zh-cn
  enable_pkg parted
  enable_pkg block-mount
  enable_pkg e2fsprogs
  enable_pkg kmod-fs-ext4
  enable_pkg kmod-fs-ntfs3
  enable_pkg kmod-fs-exfat
  enable_pkg kmod-usb-storage
  enable_pkg kmod-usb-storage-uas
  enable_pkg libustream-mbedtls

  enable_pkg firewall4
  enable_pkg nftables
  enable_pkg kmod-nft-core
  enable_pkg kmod-nft-nat
  enable_pkg kmod-nft-socket
  enable_pkg kmod-nft-tproxy
  enable_pkg kmod-nft-offload
  enable_pkg kmod-nf-reject
  enable_pkg kmod-nf-reject6
  force_n CONFIG_PACKAGE_luci-app-passwall_Iptables_Transparent_Proxy

  force_y CONFIG_TARGET_ROOTFS_EXT4FS
  force_y CONFIG_TARGET_EXT4_JOURNAL
  force_n CONFIG_TARGET_ROOTFS_SQUASHFS
  sed -i '/^CONFIG_TARGET_ROOTFS_PARTSIZE=/d' .config
  echo 'CONFIG_TARGET_ROOTFS_PARTSIZE=1024' >> .config
  force_n CONFIG_GRUB_IMAGES
  force_y CONFIG_GRUB_EFI_IMAGES
  force_y CONFIG_VMDK_IMAGES
  force_y CONFIG_CCACHE
  force_y CONFIG_TARGET_IMAGES_GZIP
}

strip_unwanted() {
  for p in \
    libustream-openssl wget-ssl luci-ssl-openssl \
    luci-app-daed daed luci-i18n-daed-zh-cn \
    netdata luci-app-netdata luci-i18n-netdata-zh-cn \
    luci-app-netspeedtest ookla-speedtest librespeed-go \
    iperf3 iperf3-ssl homebox \
    luci-app-ksmbd ksmbd-server autosamba \
    luci-app-ssr-plus \
    luci-app-nlbwmon nlbwmon \
    luci-app-wol \
    luci-app-upnp miniupnpd miniupnpd-iptables miniupnpd-nftables \
    luci-app-vlmcsd vlmcsd \
    luci-app-vsftpd vsftpd vsftpd-alt \
    luci-app-turboacc \
    luci-app-autoreboot \
    luci-app-ddns ddns-scripts_aliyun ddns-scripts_dnspod \
    luci-i18n-arpbind-zh-cn luci-i18n-filetransfer-zh-cn \
    luci-i18n-vsftpd-zh-cn luci-i18n-ssr-plus-zh-cn \
    luci-i18n-vlmcsd-zh-cn luci-i18n-upnp-zh-cn \
    luci-i18n-autoreboot-zh-cn luci-i18n-wol-zh-cn \
    luci-i18n-nlbwmon-zh-cn luci-i18n-turboacc-zh-cn \
    luci-i18n-ddns-zh-cn luci-i18n-accesscontrol-zh-cn \
    luci-app-arpbind \
    luci-app-filetransfer \
    luci-app-accesscontrol \
    luci-app-unblockmusic luci-app-unblockneteasemusic \
    luci-app-adbyby-plus adbyby \
    luci-app-zerotier \
    luci-app-openclash \
    luci-app-docker luci-app-dockerman docker dockerd \
    luci-app-qbittorrent \
    luci-app-transmission \
    luci-app-aria2 \
    luci-app-xlnetacc \
    luci-app-jd-dailybonus \
    luci-app-serverchan \
    luci-app-pushbot \
    luci-app-uugamebooster \
    luci-app-aliyundrive-webdav \
    luci-app-aliyundrive-fuse \
    firewall \
    iptables iptables-nft iptables-zz-legacy \
    ip6tables ip6tables-nft ip6tables-zz-legacy \
    iptables-mod-conntrack-extra iptables-mod-iprange \
    iptables-mod-socket iptables-mod-tproxy iptables-mod-extra \
    xtables-legacy xtables-nft
  do
    disable_pkg "$p"
  done
}

select_wanted
make defconfig
select_wanted
make defconfig
strip_unwanted

echo "==== selected extras ===="
grep -E '^CONFIG_PACKAGE_(luci-app-samba4|samba4-server|luci-app-passwall|luci-app-mosdns|mosdns|luci-app-istorex|luci-app-store|luci-app-quickstart|luci-app-fastnet|luci-app-diskman|luci-app-filemanager|luci-app-ssr-plus|luci-app-vsftpd|luci-app-vlmcsd|luci-app-autoreboot|netdata|daed)=' .config || true
grep -E '^CONFIG_PACKAGE_(firewall4|nftables|iptables|iptables-nft|iptables-zz-legacy|firewall)=' .config || true
grep -E '^CONFIG_(VMDK_IMAGES|GRUB_EFI_IMAGES|TARGET_ROOTFS_PARTSIZE|TARGET_ROOTFS_EXT4FS)=' .config || true
