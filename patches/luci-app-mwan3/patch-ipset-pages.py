#!/usr/bin/env python3
# Patch mwan3 IP set LuCI pages: ISP update toolbar on config + status views.
from pathlib import Path
import re
import sys

SNIPPET = Path(__file__).with_name('isp-update.js.snippet').read_text(encoding='utf-8')

CONFIG_WRAP = """
\t\tconst box = E('div', {}, [
\t\t\tispUpdateToolbar(),
\t\t\tm.render()
\t\t]);
\t\treturn box;"""

STATUS_INJECT = "\t\t\tispUpdateToolbar(),\n\t\t\tE('br'),"

HELP_ZH = [
	("IP sets are nftables address sets referenced by mwan3 rules.",
	 "IP 集是 nftables 地址集合，给 mwan3 规则用来匹配源或目的地址。"),
	("Sets can be populated with static entries, loaded from a file, or populated at runtime by dnsmasq name resolution.",
	 "可以用手动条目填充、从文件加载，或由 dnsmasq 解析域名后动态加入。"),
	("Set names must not begin with \"mwan3_\" (reserved for internal use).",
	 "名称不能以 mwan3_ 开头（系统内部保留）。"),
	("The Enable checkbox is greyed if the set is referenced by an enabled rule.",
	 "若已被已启用的规则引用，「启用」会变灰，不能关掉。"),
]


def zh_ipset_help(path: Path) -> None:
	t = path.read_text(encoding='utf-8')
	orig = t
	for en, zh in HELP_ZH:
		t = t.replace(en, zh)
	if t != orig:
		path.write_text(t, encoding='utf-8')
		print('zh ipset help', path)


def ensure_requires(t: str) -> str:
	if "'require uci'" not in t:
		t = t.replace("'require view';", "'require view';\n'require uci';", 1)
	if "'require fs'" not in t:
		t = t.replace("'require view';", "'require view';\n'require fs';\n'require ui';", 1)
	if 'ispUpdateToolbar' not in t:
		t = t.replace("'require ui';", "'require ui';\n\n" + SNIPPET, 1)
	return t


def patch_config(path: Path) -> None:
	t = ensure_requires(path.read_text(encoding='utf-8'))
	# Function name ispUpdateToolbar() also matches the declaration; look for the call.
	if 'ispUpdateToolbar(),' in t:
		print('config ipset already patched', path)
		return
	if 'return m.render();' not in t:
		print('WARN: return m.render() not found in', path)
		return
	t = t.replace('return m.render();', CONFIG_WRAP, 1)
	path.write_text(t, encoding='utf-8')
	print('patched config ipset', path)


def patch_status(path: Path) -> None:
	t = ensure_requires(path.read_text(encoding='utf-8'))
	if 'ispUpdateToolbar(),' in t:
		print('status ipsets already patched', path)
		return
	for needle, repl in (
		("E('h2', {}, _('MultiWAN Manager - IP Sets'))",
		 "ispUpdateToolbar(), E('h2', {}, _('MultiWAN Manager - IP Sets'))"),
		("E('h2', {}, _('多线负载 - IP 集'))",
		 "ispUpdateToolbar(), E('h2', {}, _('多线负载 - IP 集'))"),
	):
		if needle in t:
			t = t.replace(needle, repl, 1)
			path.write_text(t, encoding='utf-8')
			print('patched status ipsets', path)
			return
	print('WARN: status ipsets render header not found in', path)


if __name__ == '__main__':
	root = Path(sys.argv[1])
	app = next(root.glob('**/luci-app-mwan3'))
	cfg = next(app.glob('**/view/mwan3/network/ipset.js'), None)
	st = next(app.glob('**/view/mwan3/status/ipsets.js'), None)
	if not cfg or not st:
		raise SystemExit('mwan3 ipset views not found')
	patch_config(cfg)
	patch_status(st)
	zh_ipset_help(cfg)
	zh_ipset_help(st)
