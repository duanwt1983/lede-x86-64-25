#!/bin/sh
# KFERMercer luci-app-tcpdump: fix 'any' interface + Chinese menu title.
set -e
ROOT="${1:-.}"
CTRL="$(find "$ROOT/package/luci-app-tcpdump" -path '*/controller/tcpdump.lua' -type f | head -n 1)"
[ -n "$CTRL" ] || { echo "tcpdump.lua not found"; exit 0; }
python3 - "$CTRL" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text(encoding="utf-8")
if "if iface == 'any'" in t:
    t = t.replace("if iface == 'any'", "if ifname == 'any'", 1)
    print("fixed ifname==any", p)
if '_ "Tcpdump"' in t:
    t = t.replace('_ "Tcpdump"', '_ "网络抓包"', 1)
    print("menu title zh", p)
p.write_text(t, encoding="utf-8")
PY
