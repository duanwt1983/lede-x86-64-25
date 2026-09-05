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

LAN：`192.168.9.1/24`，`root` / `password`。只出 EFI `img.gz` 和 `vmdk.gz`。

每次编译的镜像文件名带时间、提交号和 Actions run id，例如  
`lede25-x86-64-20260905-1535-abcdef1-run33947630421-openwrt-x86-64-generic-ext4-combined-efi.img.gz`，不会覆盖上一次 Release 里的文件。
