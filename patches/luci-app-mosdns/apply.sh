#!/bin/sh
# Run from OpenWrt tree after luci-app-mosdns is cloned.
set -e
ROOT="${1:-.}"
SRC="$(cd "$(dirname "$0")" && pwd)"

MOSDNS_PKG="$(find "$ROOT/package" -type d -name luci-app-mosdns | head -n 1)"
[ -n "$MOSDNS_PKG" ] || { echo "luci-app-mosdns package not found"; exit 1; }

# Repo layout: luci-app-mosdns/luci-app-mosdns/... or flattened.
APP="$MOSDNS_PKG"
if [ -d "$MOSDNS_PKG/luci-app-mosdns" ]; then
	APP="$MOSDNS_PKG/luci-app-mosdns"
fi

YAML_DST=""
if [ -d "$APP/root/etc/mosdns" ]; then
	YAML_DST="$APP/root/etc/mosdns/config_custom.yaml"
elif [ -d "$APP/files/etc/mosdns" ]; then
	YAML_DST="$APP/files/etc/mosdns/config_custom.yaml"
fi
if [ -n "$YAML_DST" ] && [ -f "$SRC/../mosdns/config_custom.yaml" ]; then
	cp "$SRC/../mosdns/config_custom.yaml" "$YAML_DST"
	echo "installed $YAML_DST"
fi

GEN_SRC="$(cd "$SRC/../.." && pwd)/package/mosdns-mwan/files/usr/share/mosdns/gen-config-custom"
if [ -f "$GEN_SRC" ]; then
	mkdir -p "$APP/root/usr/share/mosdns"
	cp "$GEN_SRC" "$APP/root/usr/share/mosdns/gen-config-custom"
	chmod 755 "$APP/root/usr/share/mosdns/gen-config-custom"
	echo "installed gen-config-custom"
fi

VIEW="$APP/htdocs/luci-static/resources/view/mosdns"
if [ -d "$VIEW" ] && [ -f "$SRC/custom.js" ]; then
	cp "$SRC/custom.js" "$VIEW/custom.js"
	echo "installed custom.js"
fi

MENU="$APP/root/usr/share/luci/menu.d/luci-app-mosdns.json"
if [ -f "$MENU" ]; then
	python3 - "$MENU" <<'PY'
import json, sys
p = sys.argv[1]
with open(p, encoding="utf-8") as f:
    data = json.load(f)
if data.pop("admin/services/mosdns/custom", None) is not None:
    print("menu: removed standalone Custom Config")
with open(p, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY
fi

RPCD="$(find "$APP" -name luci.mosdns -type f | head -n 1)"
if [ -n "$RPCD" ]; then
	python3 - "$RPCD" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text(encoding="utf-8")
fn = '''
function get_api_port() {
	let uci_cursor = cursor();
	uci_cursor.load('mosdns');
	let configfile = uci_cursor.get('mosdns', 'config', 'configfile');
	if (configfile && configfile != '/var/etc/mosdns.json') {
		let content = readfile(configfile);
		if (content) {
			let m = match(content, /http:\\s*["']?[^"'\\s]+:([0-9]+)/);
			if (m && m[1])
				return m[1];
		}
	}
	return uci_cursor.get('mosdns', 'config', 'listen_port_api') || '9091';
}

'''
if "function get_api_port(" not in t:
    needle = "function call_mosdns_api(endpoint, method) {"
    if needle not in t:
        raise SystemExit("call_mosdns_api not found")
    t = t.replace(needle, fn + needle, 1)
t = t.replace(
    "let port = uci_cursor.get('mosdns', 'config', 'listen_port_api') || '9091';",
    "let port = get_api_port();",
)
old_flush = 'let res = exec_sys(`wget -q -O - "http://127.0.0.1:${port}/plugins/lazy_cache/flush"`);'
new_flush = '''let ok = false;
			let tags = [ "lazy_cache", "lazy_cache_w1", "lazy_cache_w2", "lazy_cache_w3", "lazy_cache_w4" ];
			for (let i = 0; i < length(tags); i++) {
				let res = exec_sys(`wget -q -O - "http://127.0.0.1:${port}/plugins/${tags[i]}/flush"`);
				if (res.code === 0)
					ok = true;
			}
			let res = { code: ok ? 0 : 1, stdout: "" };'''
if old_flush in t:
    t = t.replace(old_flush, new_flush, 1)
p.write_text(t, encoding="utf-8")
print("patched", p)
PY
fi

RULES="$(find "$APP" -path '*/view/mosdns/rules.js' | head -n 1)"
if [ -n "$RULES" ]; then
	python3 - "$RULES" <<'PY'
from pathlib import Path
import re
import sys
p = Path(sys.argv[1])
t = p.read_text(encoding="utf-8")
t = re.sub(
    r"The list of rules only apply to .+?profiles\.",
    "Whitelist, blocklist, greylist, hosts, redirect and PTR are applied by MosDNS.",
    t,
    count=1,
)
for name in ("ddnslist", "streamingmedialist"):
    t = re.sub(
        r"\s*\{\s*name:\s*'%s'[\s\S]*?\},\n" % name,
        "\n",
        t,
        count=1,
    )
p.write_text(t, encoding="utf-8")
print("patched rules.js")
PY
fi

BASIC="$(find "$APP" -path '*/view/mosdns/basic.js' | head -n 1)"
if [ -n "$BASIC" ]; then
	python3 - "$BASIC" <<'PY'
from pathlib import Path
import re
import sys
p = Path(sys.argv[1])
t = p.read_text(encoding="utf-8")
if "view.mosdns.custom" not in t:
    t = t.replace("'require view';", "'require view';\n'require view.mosdns.custom as mosCustom';", 1)
t = re.sub(
    r"return Promise\.all\(\[\s*L\.resolveDefault\(callMosdns\(\), null\),?\s*\]\);",
    "return Promise.all([\n\t\tL.resolveDefault(callMosdns(), null),\n\t\tuci.load('network'),\n\t\tuci.load('mwan3').catch(() => null),\n\t]);",
    t,
    count=1,
)
t = t.replace("o.default = 52001;", "o.default = 9091;")
t = t.replace(
    " o.value('/etc/mosdns/config_custom.yaml', _('Custom Config'));\n",
    "",
)
if "o.hidden = true;" not in t and "form.ListValue, 'configfile'" in t:
    t = t.replace(
        " o.default = '/var/etc/mosdns.json';\n o.rmempty = false;",
        " o.default = '/var/etc/mosdns.json';\n o.rmempty = false;\n o.readonly = true;\n o.hidden = true;",
        1,
    )
t = t.replace(
    " o = s.taboption('basic', form.Flag, 'custom_local_dns', _('Custom China DNS'), _('Follow WAN interface DNS if not enabled'));\n o.depends('configfile', '/var/etc/mosdns.json');\n o.default = false;",
    " o = s.taboption('basic', form.Flag, 'custom_local_dns', _('Custom China DNS'));\n o.default = true;\n o.readonly = true;\n o.hidden = true;",
    1,
)
t = t.replace(
    " o.depends('configfile', '/etc/mosdns/config_custom.yaml');\n",
    "",
)
t = re.sub(
    r"/\* configuration \*/\s*let configeditor = null;.*?},\s*600\);",
    "/* yaml editor removed; Default Config is generated */",
    t,
    count=1,
    flags=re.S,
)
dummy = "/* custom yaml editor removed */\n\n"
t2, n = re.subn(
    r"o = s\.taboption\('basic', form\.TextValue, '_custom'.*?o\.write = function[\s\S]*?\n\s*\};\n\n(?=\s*o = s\.taboption\('geodata')",
    dummy,
    t,
    count=1,
)
if n == 1:
    t = t2
    print("patched basic.js yaml editor")
else:
    print("basic.js yaml editor: not replaced (n=%s)" % n)
    t = t.replace(
        "o.depends('configfile', '/etc/mosdns/config_custom.yaml');\n o.cfgvalue = section_id => fs.trimmed('/etc/mosdns/config_custom.yaml');",
        "o.depends('configfile', '__disabled_custom_yaml_editor');\n o.cfgvalue = section_id => fs.trimmed('/etc/mosdns/config_custom.yaml');",
        1,
    )

if "mosCustom.attach" not in t:
    t = t.replace("return m.render();", "mosCustom.attach(m);\n\treturn m.render();", 1)
p.write_text(t, encoding="utf-8")
print("patched basic.js form hook")
PY
fi

INIT="$(find "$APP" -path '*/init.d/mosdns' -type f | head -n 1)"
if [ -n "$INIT" ]; then
	python3 - "$INIT" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text(encoding="utf-8")
t = t.replace("CONF=$(uci -q get mosdns.config.configfile)", "CONF=/var/etc/mosdns.json", 1)
old = '[ "${CONF}" = "/var/etc/mosdns.json" ] && generate_config'
new = (
    "[ -x /usr/share/mosdns/gen-config-custom ] && /usr/share/mosdns/gen-config-custom; "
    "[ -x /usr/sbin/wan-src-hash ] && /usr/sbin/wan-src-hash; true\n"
    "\t# " + old
)
if "gen-config-custom" not in t and old in t:
    t = t.replace(old, new, 1)
    p.write_text(t, encoding="utf-8")
    print("patched", p)
elif "gen-config-custom" in t:
    if "wan-src-hash" not in t:
        t2 = t.replace(
            "[ -x /usr/share/mosdns/gen-config-custom ] && /usr/share/mosdns/gen-config-custom",
            "[ -x /usr/share/mosdns/gen-config-custom ] && /usr/share/mosdns/gen-config-custom; "
            "[ -x /usr/sbin/wan-src-hash ] && /usr/sbin/wan-src-hash",
            1,
        )
        if t2 != t:
            p.write_text(t2, encoding="utf-8")
            print("init.d mosdns: added wan-src-hash")
    print("init.d mosdns: generator hooked")
else:
    print("init.d mosdns: generate_config line not found")
PY
fi
