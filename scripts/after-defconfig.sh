#!/bin/bash
# Force package selection after make defconfig.

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

enable_pkg luci-theme-argon
enable_pkg luci-app-argon-config
enable_pkg luci-app-ttyd
enable_pkg luci-i18n-ttyd-zh-cn
enable_pkg luci-app-daed
enable_pkg daed
enable_pkg luci-i18n-daed-zh-cn
enable_pkg kmod-xdp-sockets-diag
enable_pkg luci-app-ddns-go
enable_pkg ddns-go
enable_pkg luci-app-quickstart
enable_pkg luci-app-istorex
enable_pkg luci-app-store
enable_pkg luci-app-fastnet
enable_pkg fastnet
enable_pkg luci-app-samba4
enable_pkg luci-i18n-samba4-zh-cn
enable_pkg samba4-server
enable_pkg wsdd2
enable_pkg luci-app-diskman
enable_pkg luci-i18n-diskman-zh-cn
enable_pkg luci-app-filebrowser
enable_pkg luci-i18n-filebrowser-zh-cn
enable_pkg parted
enable_pkg block-mount
enable_pkg e2fsprogs
enable_pkg kmod-fs-ext4
enable_pkg kmod-fs-ntfs3
enable_pkg kmod-fs-exfat
enable_pkg kmod-usb-storage
enable_pkg kmod-usb-storage-uas
enable_pkg libustream-mbedtls

for p in \
  libustream-openssl wget-ssl luci-ssl-openssl \
  luci-app-passwall luci-app-passwall2 \
  luci-app-mosdns mosdns v2dat \
  netdata luci-app-netdata luci-i18n-netdata-zh-cn \
  luci-app-netspeedtest ookla-speedtest librespeed-go \
  iperf3 iperf3-ssl homebox \
  luci-app-ksmbd ksmbd-server \
  luci-app-ssr-plus \
  luci-app-nlbwmon nlbwmon \
  luci-app-wol \
  luci-app-upnp miniupnpd miniupnpd-iptables miniupnpd-nftables \
  luci-app-vlmcsd vlmcsd \
  luci-app-vsftpd vsftpd vsftpd-alt \
  luci-app-turboacc \
  luci-app-autoreboot \
  autosamba \
  luci-app-ddns
do
  disable_pkg "$p"
done

force_y CONFIG_DEVEL
force_y CONFIG_KERNEL_DEBUG_INFO
force_n CONFIG_KERNEL_DEBUG_INFO_REDUCED
force_y CONFIG_KERNEL_DEBUG_INFO_BTF
force_y CONFIG_KERNEL_CGROUPS
force_y CONFIG_KERNEL_CGROUP_BPF
force_y CONFIG_KERNEL_BPF_EVENTS
force_y CONFIG_BPF_TOOLCHAIN_HOST
force_y CONFIG_KERNEL_XDP_SOCKETS

sed -i '/^CONFIG_GRUB_IMAGES=/d;/^# CONFIG_GRUB_IMAGES is not set/d' .config
echo '# CONFIG_GRUB_IMAGES is not set' >> .config
sed -i '/^CONFIG_GRUB_EFI_IMAGES=/d;/^# CONFIG_GRUB_EFI_IMAGES is not set/d' .config
echo 'CONFIG_GRUB_EFI_IMAGES=y' >> .config
sed -i '/^CONFIG_VMDK_IMAGES=/d;/^# CONFIG_VMDK_IMAGES is not set/d' .config
echo 'CONFIG_VMDK_IMAGES=y' >> .config
sed -i '/^CONFIG_CCACHE=/d;/^# CONFIG_CCACHE is not set/d' .config
echo 'CONFIG_CCACHE=y' >> .config

make defconfig

echo "==== selected extras ===="
grep -E '^CONFIG_PACKAGE_(luci-app-samba4|samba4-server|luci-app-ksmbd|luci-app-quickstart|luci-app-istorex|luci-app-fastnet|luci-app-diskman|luci-app-filebrowser|luci-app-daed|daed|netdata|luci-app-netspeedtest)=' .config || true
grep -E '^CONFIG_(VMDK_IMAGES|GRUB_EFI_IMAGES|CCACHE|KERNEL_DEBUG_INFO_BTF)=' .config || true
