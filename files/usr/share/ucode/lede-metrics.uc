'use strict';

import { readfile, writefile, lsdir, popen, stat } from 'fs';

export function trim(s) {
	if (s == null)
		s = '';
	return replace(`${s}`, /^\s+|\s+$/g, '');
}

export function as_bool(v, def) {
	if (v == null || v == '')
		return def;
	return (v == '1' || v == 1 || v == true || v == 'true' || v == 'on');
}

export function as_list(v) {
	let out = [];
	if (type(v) == 'array') {
		for (let x in v)
			if (x != null && `${x}` != '')
				push(out, trim(x));
	} else if (v != null && `${v}` != '') {
		for (let x in split(`${v}`, /[ \t]+/))
			if (x != '')
				push(out, x);
	}
	return out;
}

export function ip2n(s) {
	let p = split(`${s}`, '.');
	if (length(p) != 4)
		return 0;
	return (+p[0] * 16777216) + (+p[1] * 65536) + (+p[2] * 256) + (+p[3]);
}

export function now_fmt() {
	try {
		let t = localtime(time());
		if (t)
			return sprintf('%04d-%02d-%02d %02d:%02d:%02d', t.year, t.mon + 1, t.mday, t.hour, t.min, t.sec);
	} catch (e) {}
	let p = popen("date '+%F %T'", 'r');
	if (!p)
		return '';
	let s = trim(p.read('all'));
	p.close();
	return s;
}

function millic_to_c(raw) {
	let t = +replace(`${raw == null ? '' : raw}`, /[^0-9-]/g, '');
	if (t != t)
		return 0;
	if (t > 200)
		t = int(t / 1000);
	if (t >= 1 && t <= 120)
		return t;
	return 0;
}

// Same sources as the LuCI overview: hwmon first, then thermal zones.
export function max_temp_c() {
	let max = 0;
	let hw = lsdir('/sys/class/hwmon') || [];
	for (let h in hw) {
		let dir = '/sys/class/hwmon/' + h;
		let files = lsdir(dir) || [];
		for (let f in files) {
			if (!match(f, /^temp[0-9]+_input$/))
				continue;
			let t = millic_to_c(readfile(dir + '/' + f));
			if (t > max)
				max = t;
		}
	}
	let zones = lsdir('/sys/class/thermal') || [];
	for (let z in zones) {
		if (!match(z, /^thermal_zone/))
			continue;
		let t = millic_to_c(readfile('/sys/class/thermal/' + z + '/temp'));
		if (t > max)
			max = t;
	}
	return max;
}

export function cpu_pct() {
	let prev = split(trim(readfile('/tmp/wanmon.cpu') || ''), /[ \t]+/);
	let line = '';
	for (let l in split(readfile('/proc/stat') || '', '\n')) {
		if (match(l, /^cpu /)) {
			line = l;
			break;
		}
	}
	let f = split(trim(line), /[ \t]+/);
	let tot2 = 0;
	for (let i = 1; i < length(f); i++)
		tot2 += +f[i];
	let idle2 = (length(f) > 4) ? +f[4] : 0;
	writefile('/tmp/wanmon.cpu', sprintf('%d %d\n', tot2, idle2));
	let tot1 = +prev[0];
	let idle1 = +prev[1];
	if (!(tot1 > 0) || tot2 <= tot1) {
		let n = 0;
		for (let l in split(readfile('/proc/cpuinfo') || '', '\n'))
			if (match(l, /^processor/))
				n++;
		if (n < 1)
			n = 1;
		let ld = +split(trim(readfile('/proc/loadavg') || '0'), /[ \t]+/)[0];
		let p = int(ld * 100 / n);
		if (p > 100)
			p = 100;
		if (p < 0)
			p = 0;
		return p;
	}
	let dt = tot2 - tot1;
	let di = idle2 - idle1;
	if (dt <= 0)
		return 0;
	let p = int((1 - di / dt) * 100);
	if (p < 0)
		p = 0;
	if (p > 100)
		p = 100;
	return p;
}

export function mem_percent() {
	let total = 0, avail = 0;
	for (let l in split(readfile('/proc/meminfo') || '', '\n')) {
		let m = match(l, /^MemTotal:\s+([0-9]+)/);
		if (m)
			total = +m[1];
		m = match(l, /^MemAvailable:\s+([0-9]+)/);
		if (m)
			avail = +m[1];
	}
	if (total <= 0)
		return 0;
	return int(((total - avail) * 100 / total) + 0.5);
}

export function load1() {
	return split(trim(readfile('/proc/loadavg') || '0'), /[ \t]+/)[0];
}

export function disk_of(path) {
	if (path == null || path == '')
		return null;
	let p = popen(sprintf("df -P '%s' 2>/dev/null", replace(`${path}`, /'/g, '')), 'r');
	if (!p)
		return null;
	let text = p.read('all') || '';
	p.close();
	let lines = split(trim(text), '\n');
	if (length(lines) < 2)
		return null;
	let f = split(trim(lines[1]), /[ \t]+/);
	if (length(f) < 6)
		return null;
	return {
		src: f[0],
		total_kb: +f[1],
		used_kb: +f[2],
		pct: +replace(f[4], '%', ''),
		mount: f[5]
	};
}

export function disks_overview() {
	let p = popen('df -P 2>/dev/null', 'r');
	if (!p)
		return [];
	let text = p.read('all') || '';
	p.close();
	let rows = [];
	let i = 0;
	for (let line in split(text, '\n')) {
		i++;
		if (i < 2)
			continue;
		let f = split(trim(line), /[ \t]+/);
		if (length(f) < 6)
			continue;
		let src = f[0], tot = +f[1], used = +f[2], pct = +replace(f[4], '%', ''), mp = f[5];
		if (match(src, /^(tmpfs|devtmpfs|udev)/))
			continue;
		if (mp == '/tmp' || mp == '/dev' || match(mp, /^\/sys/) || match(mp, /^\/proc/))
			continue;
		if (match(src, /^\/dev\//) || mp == '/' || mp == '/overlay' || match(mp, /^\/mnt\//))
			push(rows, { mount: mp, total_kb: tot, used_kb: used, pct });
	}
	return rows;
}

export function dhcp_pools(ctx) {
	let leases = [];
	let raw = readfile('/tmp/dhcp.leases') || '';
	for (let line in split(raw, '\n')) {
		let f = split(trim(line), /[ \t]+/);
		if (length(f) >= 3)
			push(leases, ip2n(f[2]));
	}
	let out = [];
	ctx.foreach('dhcp', 'dhcp', (s) => {
		if (as_bool(s.ignore, false))
			return;
		let start = +s.start;
		let limit = +s.limit;
		if (!(limit > 0))
			return;
		let iface = s.interface || s['.name'];
		let ip = ctx.get('network', iface, 'ipaddr');
		if (ip == null || ip == '')
			return;
		let mask = ctx.get('network', iface, 'netmask') || '255.255.255.0';
		let net = ip2n(ip) & ip2n(mask);
		let first = net + start;
		let last = first + limit - 1;
		let used = 0;
		for (let v in leases)
			if (v >= first && v <= last)
				used++;
		let remain = limit - used;
		if (remain < 0)
			remain = 0;
		push(out, { name: s['.name'], iface, used, limit, remain });
	});
	return out;
}

export function bytes_of(dev) {
	if (dev == null || dev == '')
		return { rx: 0, tx: 0 };
	return {
		rx: +(trim(readfile(`/sys/class/net/${dev}/statistics/rx_bytes`) || '0')),
		tx: +(trim(readfile(`/sys/class/net/${dev}/statistics/tx_bytes`) || '0'))
	};
}

export function file_size(path) {
	let st = stat(path);
	if (!st)
		return 0;
	return +st.size;
}
