# Lean LEDE 25 x86-64（PassWall + IstoreX）

基于 [coolsnowwolf/lede](https://github.com/coolsnowwolf/lede) `master`，x86-64 Generic，ext4，根分区 1024M。

## 软件

| 需求 | 软件包 |
| --- | --- |
| 概览 | IstoreX（含软件中心、quickstart 后端，保证概览能用） |
| 测速 | FastNet |
| 代理 | PassWall + mosdns |
| DDNS | ddns-go |
| 网页终端 | ttyd |
| 主题 | Argon |
| 文件共享 | samba4 |
| 磁盘管理 | luci-app-diskman |
| 文件管理 | luci-app-filemanager |

防火墙只保留 **firewall4 + nftables**。PassWall 只用 nft 透明代理，不装 iptables / iptables-legacy，避免和 fw4 抢规则。

LAN：`192.168.9.1/24`，`root` / `password`
