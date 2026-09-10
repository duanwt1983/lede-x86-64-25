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


def ensure_requires(t: str) -> str:
	if "'require fs'" not in t:
		t = t.replace("'require view';", "'require view';\n'require fs';\n'require ui';", 1)
	if 'ispUpdateToolbar' not in t:
		t = t.replace("'require ui';", "'require ui';\n\n" + SNIPPET, 1)
	return t


def patch_config(path: Path) -> None:
	t = ensure_requires(path.read_text(encoding='utf-8'))
	if 'isp-ip-update' in t and 'ispUpdateToolbar' in t:
		print('config ipset already patched', path)
		return
	if 'return m.render();' not in t:
		raise SystemExit(f'return m.render() not found in {path}')
	t = t.replace('return m.render();', CONFIG_WRAP, 1)
	path.write_text(t, encoding='utf-8')
	print('patched config ipset', path)


def patch_status(path: Path) -> None:
	t = ensure_requires(path.read_text(encoding='utf-8'))
	if 'ispUpdateToolbar()' in t:
		print('status ipsets already patched', path)
		return
	needle = "\t\treturn E('div', {}, [\n\t\t\tE('h2', {}, _('MultiWAN Manager - IP Sets')),"
	if needle not in t:
		needle = "\t\treturn E('div', {}, [\n\t\t\tE('h2', {}, _('多线负载 - IP 集')),"
	if needle not in t:
		raise SystemExit(f'status ipsets render header not found in {path}')
	t = t.replace(needle, "\t\treturn E('div', {}, [\n\t\t\tispUpdateToolbar(),\n\t\t\tE('h2', {}, _('MultiWAN Manager - IP Sets')),", 1)
	path.write_text(t, encoding='utf-8')
	print('patched status ipsets', path)


if __name__ == '__main__':
	root = Path(sys.argv[1])
	app = next(root.glob('**/luci-app-mwan3'))
	cfg = next(app.glob('**/view/mwan3/network/ipset.js'), None)
	st = next(app.glob('**/view/mwan3/status/ipsets.js'), None)
	if not cfg or not st:
		raise SystemExit('mwan3 ipset views not found')
	patch_config(cfg)
	patch_status(st)
