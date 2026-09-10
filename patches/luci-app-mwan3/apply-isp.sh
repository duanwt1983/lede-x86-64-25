#!/bin/sh
# Patch luci-app-mwan3: ISP label on interfaces; Chinese labels for ISP nft sets.
set -e
ROOT="${1:-.}"
APP="$(find "$ROOT/package" -type d -name luci-app-mwan3 | head -n 1)"
[ -n "$APP" ] || { echo "luci-app-mwan3 not found"; exit 1; }

IFACE="$(find "$APP" -path '*/view/mwan3/network/interface.js' -type f | head -n 1)"
RULE="$(find "$APP" -path '*/view/mwan3/network/rule.js' -type f | head -n 1)"

if [ -n "$IFACE" ]; then
	python3 - "$IFACE" <<'PY'
from pathlib import Path
import re
import sys
p = Path(sys.argv[1])
t = p.read_text(encoding="utf-8")
if "option(form.ListValue, 'isp'" in t:
    print("interface.js already has isp")
    raise SystemExit(0)
pat = re.compile(
    r"o = s\.option\(form\.Flag, 'enabled', _\('Enabled'\)\);\r?\n[ \t]*o\.default = false;"
)
m = pat.search(t)
if not m:
    i = t.find("'enabled'")
    print("interface.js enabled flag not found", p)
    print(repr(t[max(0, i-80): i+160] if i >= 0 else t[:400]))
    raise SystemExit(1)
insert = m.group(0) + """

		o = s.option(form.ListValue, 'isp', _('运营商'),
			_('只作标注，方便对照。不会因为选了运营商就自动分流；请到规则里选目的 NFT 集（isp_chinanet / isp_unicom / isp_cmcc / isp_other）并指定策略。多条线同一家运营商时尤其不要自动分流。'));
		o.value('', _('未标注'));
		o.value('chinanet', _('中国电信'));
		o.value('unicom', _('中国联通'));
		o.value('cmcc', _('中国移动'));
		o.optional = true;
		o.rmempty = true;
"""
t = t[:m.start()] + insert + t[m.end():]
p.write_text(t, encoding="utf-8")
print("patched", p, "isp")
PY
fi

if [ -n "$RULE" ]; then
	python3 - "$RULE" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text(encoding="utf-8")
old = "_('Match destination addresses against this nft set (declare sets in /etc/config/mwan3; dnsmasq syntax: nftset=/youtube.com/4#inet#mwan3#youtube)'));"
new = "_('目的地址集合。运营商分流用 isp_chinanet（电信）、isp_unicom（联通）、isp_cmcc（移动）、isp_other（其它国内 ISP：教育网/广电/鹏博士等）。海外及未命中地址请另加一条不选目的集的兜底规则。地址库由国内源自动更新，需在本页手动添加规则。'));"
if old in t:
    t = t.replace(old, new, 1)
old2 = "const label = s_name + (family_label[nftset_info[s_name].type] || '');"
new2 = """const ispLabel = { isp_chinanet: _('中国电信地址库'), isp_unicom: _('中国联通地址库'), isp_cmcc: _('中国移动地址库'), isp_other: _('其它（教育网/广电/其它ISP）') }[s_name];
			const label = (ispLabel || s_name) + (family_label[nftset_info[s_name].type] || '');"""
if old2 in t and "ispLabel" not in t:
    t = t.replace(old2, new2)
p.write_text(t, encoding="utf-8")
print("patched", p, "rule.js")
PY
fi

CFG="$(find "$ROOT/package" -path '*/mwan3/files/etc/config/mwan3' -type f | head -n 1)"
if [ -n "$CFG" ]; then
	python3 - "$CFG" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text(encoding="utf-8")
# Drop stock sample rules so the rule list starts empty.
for name in ("https", "default_rule_v4", "default_rule_v6"):
    start = t.find("config rule '%s'" % name)
    if start < 0:
        continue
    nxt = t.find("\nconfig ", start + 1)
    if nxt < 0:
        t = t[:start].rstrip() + "\n"
    else:
        t = t[:start] + t[nxt+1:]
p.write_text(t, encoding="utf-8")
print("stripped default mwan3 rules", p)
PY
fi
