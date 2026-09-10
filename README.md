# lede25 + mwan3 + mosdns 多线负载

基于 [coolsnowwolf/lede](https://github.com/coolsnowwolf/lede) `master` 的 **Lean 25 x86-64** 固件。  
仓库：[duanwt1983/lede25-mwan3-mosdns](https://github.com/duanwt1983/lede25-mwan3-mosdns)

- 目标：x86-64 Generic，**ext4** 根分区 **1024M**，EFI + VMDK
- Web：**luci-nginx**（不装 uhttpd）
- 防火墙：只保留 **firewall4 + nftables**（不要 iptables / legacy）
- LAN：`192.168.9.1/24`，账号 `root` / `password`

GitHub Actions 工作流显示名保持：`Build Lean 25 x86-64 PassWall samba4`。  
改 `.config` / `diy-*.sh` / `files/` / `package/` / `patches/` / `scripts/` 或工作流文件并推到 `main` 会触发编译；只改本 README 不会。

## 网络与 DNS

| 用途 | 实际做法 |
| --- | --- |
| 多线同时出网 | [dl12345 mwan3 nft](https://github.com/dl12345/mwan3)（OpenWrt 25.12 口），接口名不写死 |
| 日常 DNS | **MosDNS**（默认配置生成到 `/var/etc/mosdns.json`） |
| DNS 跟 WAN | 两条及以上 WAN 时，按源 IP 哈希，解析和上网尽量走同一条线 |
| 代理 | **PassWall** 编进镜像备用（nft 透明代理），日常走 MosDNS，不必当默认 DNS |
| LAN DHCP | 在 **网络 → 接口 → lan / br-lan → DHCP 服务器 → IPv4** 里按完整 IP 填起始/结束、掩码、网关、DNS、排除地址、顺序分配；租期仍在「常规设置」 |

一条线挂了：新连接、刷新网页会切到活着的线。已经走在死线上的 TCP 会断，这是策略路由的极限，不是插件没配好。

路由器上看不到完整网址（没有路径、参数），DNS / SNI 通常只能看到主机名。

## 软件

| 需求 | 软件包 |
| --- | --- |
| 多线 | mwan3 + luci-app-mwan3（nft） |
| DNS | mosdns + luci-app-mosdns + mosdns-mwan |
| 代理（备用） | luci-app-passwall（Xray / Sing-Box 等） |
| LAN 测速 | **LibreSpeed**（`librespeed-go`），不是 iperf3 |
| WAN / 在线测速 | luci-app-netspeedtest（Ookla、在线测速、日志；菜单里没有 Iperf3 / Homebox） |
| DDNS | ddns-go |
| 网页终端 | ttyd |
| 主题 | Argon |
| 文件共享 | samba4 |
| 磁盘管理 | luci-app-diskman（不带 smartmontools） |
| 文件管理 | luci-app-filemanager |

**不装**：iStore / FastNet、uhttpd、iperf3、Homebox、旧版 luci-app-ddns、SSR Plus、以及 iptables 那一套。

## 本仓库覆盖

- 状态概览：多线路速率、在线设备等
- 系统告警（`wanalert`）：WAN、DHCP 池、CPU、负载、内存、磁盘、温度；可选钉钉；日志默认 `/overlay/sys-alert.log`
- LAN DHCP 排除地址写入 dnsmasq，保存接口后重载

默认账号密码只适合先装机，上线后请改掉。
