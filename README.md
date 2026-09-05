# Lean LEDE 25 x86-64（daed + samba4）

基于 [coolsnowwolf/lede](https://github.com/coolsnowwolf/lede) `master`（界面版本约 25.12），x86-64 Generic，ext4，根分区 1G。  
不改已有的 [lede-x86-64](https://github.com/duanwt1983/lede-x86-64)（ImmortalWrt 24.10）和 [immortalwrt-x86-64-daed](https://github.com/duanwt1983/immortalwrt-x86-64-daed)。

## 软件

| 需求 | 软件包 |
| --- | --- |
| 首页 / 概览 | iStoreOS `luci-app-quickstart` + `luci-app-istorex`（依赖 iStore） |
| 测速 | iStoreOS `luci-app-fastnet`（不再用 LibreSpeed / sirpdboy 网络测速） |
| 代理 | daed（无 PassWall / mosdns） |
| DDNS | ddns-go |
| 网页终端 | ttyd |
| 主题 | Argon |
| 文件共享 | **samba4**（不再用 ksmbd） |
| 磁盘管理 | luci-app-diskman |
| 文件管理 | luci-app-filemanager（官方 LuCI 文件管理） |

已去掉：netdata、PassWall、mosdns、SSR Plus+、带宽监控、网络唤醒、UPnP、KMS、FTP、Turbo ACC、定时重启。

LAN：`192.168.9.1/24`，账号 `root` / `password`。只出 EFI `img.gz` 和 `vmdk.gz`。

## samba4 编译失败的真正原因

samba4 本身一般能编过。云编译卡住的是它依赖的 **`gettext-full` 主机工具**（`package/libs/gettext-full` host-compile）：

1. Lean 用的 gettext **0.22.5 官方 tarball 已经跑过 autogen**，带齐 configure。
2. Lean 的 Makefile 仍会执行 `Host/Bootstrap` / `Build/Bootstrap`，在编译机上再跑一遍 `./autogen.sh`。
3. `autogen.sh` 被指向 OpenWrt 的 `tools/gnulib`（`gnulib-tool.py`），和 0.22.5 自带的 gnulib **对不上**，常见失败是 `exitfail.h` 一类补丁套不上，日志里表现为 `gettext-full [host] failed`，外层看起来像 samba4 失败。

本仓库的处理：**不降级 samba4**，只去掉这次错误的重新 bootstrap，让 gettext 按发行包原样配置编译，samba4 继续用完整版。

## iStoreOS 页面说明

可以。首页/概览用易有云开源组件 `luci-app-quickstart`（经典首页向导）和 `luci-app-istorex`（较新概览），不是整包刷 iStoreOS 系统。测速用同一套仓库里的 **FastNet**（`luci-app-fastnet`），这就是 iStore 软件列表里的「网络体检/测速」，不是之前的 LibreSpeed 菜单。
