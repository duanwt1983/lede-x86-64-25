#!/bin/sh
# Fold full-IP DHCP fields into br-lan's existing DHCP Server tab.
set -e
ROOT="${1:-.}"
SRC="$(cd "$(dirname "$0")" && pwd)"

IFACE="$(find "$ROOT/feeds/luci" "$ROOT/package" -path '*/view/network/interfaces.js' -type f 2>/dev/null | head -n 1 || true)"
[ -n "$IFACE" ] || { echo "interfaces.js not found"; exit 1; }

python3 - "$IFACE" <<'PY'
from pathlib import Path
import sys

p = Path(sys.argv[1])
t = p.read_text(encoding="utf-8")

if "view.network.iface-dhcp-extra" not in t:
    if "'require network';" in t:
        t = t.replace(
            "'require network';",
            "'require network';\n'require view.network.iface-dhcp-extra as dhcpExtra';",
            1,
        )
    else:
        raise SystemExit("require network not found in interfaces.js")

hook = "\n\t\t\t\t\t\tif (typeof dhcpExtra != 'undefined' && dhcpExtra.attach)\n\t\t\t\t\t\t\tdhcpExtra.attach(ss, ifc);\n"
if "dhcpExtra.attach" not in t:
    needle = "so = ss.taboption('ipv4', form.Value, 'limit'"
    i = t.find(needle)
    if i < 0:
        raise SystemExit("dhcp limit field not found")
    j = t.find("so.default = '150';", i)
    if j < 0:
        raise SystemExit("dhcp limit default not found")
    j += len("so.default = '150';")
    t = t[:j] + "\n\t\t\t\t\tso.hidden = true;\n\t\t\t\t\tso.readonly = true;" + hook + t[j:]
    t = t.replace(
        "so = ss.taboption('ipv4', form.Value, 'limit'",
        "so.hidden = true;\n\t\t\t\t\tso.readonly = true;\n\t\t\t\t\tso = ss.taboption('ipv4', form.Value, 'limit'",
        1,
    )


if "lan-dhcp-apply" not in t:
    old = "return view.extend({"
    if old not in t:
        raise SystemExit("view.extend not found")
    t = t.replace(
        old,
        old
        + """
	handleSaveApply(ev, mode) {
		return this.super('handleSaveApply', [ev, mode]).then(function() {
			return fs.exec('/usr/libexec/lan-dhcp-apply', [ 'reload' ]).catch(function() {});
		});
	},
""",
        1,
    )

p.write_text(t, encoding="utf-8")
print("patched", p)
PY

ACL="$(find "$ROOT/feeds/luci" "$ROOT/package" -path '*/acl.d/luci-mod-network.json' -type f 2>/dev/null | head -n 1 || true)"
if [ -n "$ACL" ]; then
	python3 - "$ACL" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
data = json.loads(p.read_text(encoding="utf-8"))
key = next(iter(data))
write = data[key].setdefault("write", {})
files = write.setdefault("file", {})
files["/usr/libexec/lan-dhcp-apply"] = ["exec"]
p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("acl:", p)
PY
fi
