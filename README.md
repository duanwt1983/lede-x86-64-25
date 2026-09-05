# Lean LEDE 25 x86-64（PassWall + samba4）

基于 [coolsnowwolf/lede](https://github.com/coolsnowwolf/lede) `master`，x86-64 Generic，ext4，根分区 1G。

## 软件

| 需求 | 软件包 |
| --- | --- |
| 概览 | iStoreOS `luci-app-istorex`（不要首页向导菜单） |
| 测速 | FastNet |
| 代理 | PassWall + mosdns（不用 daed） |
| DDNS | ddns-go |
| 网页终端 | ttyd |
| 主题 | Argon |
| 文件共享 | samba4 |
| 磁盘管理 | luci-app-diskman |
| 文件管理 | luci-app-filemanager |

已去掉：daed、netdata、首页向导入口、SSR Plus+、带宽监控、网络唤醒、UPnP、KMS、FTP、Turbo ACC、定时重启。

LAN：`192.168.9.1/24`，`root` / `password`。只出 EFI `img.gz` 和 `vmdk.gz`。

`luci-app-istorex` 依赖 `luci-app-quickstart` 的后端，固件里仍会装这个包，但向导菜单已去掉，登录后用 IstoreX 概览。
