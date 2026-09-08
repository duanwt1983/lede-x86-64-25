'use strict';
'require view';
'require poll';
'require rpc';

const NS = 'http://www.w3.org/2000/svg';

const callSnapshot = rpc.declare({
	object: 'wanmonitor',
	method: 'snapshot',
	expect: { wans: [] }
});

const callBoard = rpc.declare({
	object: 'system',
	method: 'board',
	expect: {}
});

const callInfo = rpc.declare({
	object: 'system',
	method: 'info',
	expect: {}
});

function svgEl(name, attrs, children) {
	const e = document.createElementNS(NS, name);
	Object.keys(attrs || {}).forEach(k => {
		if (attrs[k] == null || attrs[k] === '')
			return;
		e.setAttribute(k, String(attrs[k]));
	});
	(children || []).forEach(c => {
		if (c)
			e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
	});
	return e;
}

function fmtBitrate(bps) {
	if (!isFinite(bps) || bps < 0)
		bps = 0;
	if (bps < 1000)
		return bps.toFixed(0) + ' bps';
	if (bps < 1e6)
		return (bps / 1e3).toFixed(1) + ' Kbps';
	if (bps < 1e9)
		return (bps / 1e6).toFixed(2) + ' Mbps';
	return (bps / 1e9).toFixed(2) + ' Gbps';
}

function rateOf(prev, now, field) {
	if (!prev || !now)
		return 0;
	const dt = (now.ts - prev.ts) / 1000;
	if (dt <= 0.2)
		return 0;
	const d = Number(now[field]) - Number(prev[field]);
	if (d < 0)
		return 0;
	return (d * 8) / dt;
}

function healthColor(h) {
	if (h === 'ok')
		return '#16a34a';
	if (h === 'warn')
		return '#ca8a04';
	return '#dc2626';
}

function trunc(s, n) {
	s = String(s || '');
	return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function protoLabel(p) {
	p = (p || '').toLowerCase();
	if (p === 'pppoe')
		return 'PPPoE';
	if (p === 'dhcp')
		return 'DHCP';
	if (p === 'static')
		return '静态';
	return p || '-';
}

function fmtLatency(v) {
	if (v == null || v === '')
		return '—';
	const n = Number(v);
	if (!isFinite(n))
		return String(v);
	return (n < 10 ? n.toFixed(1) : n.toFixed(0)) + ' ms';
}

function fmtUptime(s) {
	s = Math.floor(Number(s) || 0);
	const d = Math.floor(s / 86400);
	const h = Math.floor((s % 86400) / 3600);
	const m = Math.floor((s % 3600) / 60);
	if (d)
		return d + '天' + h + '时';
	if (h)
		return h + '时' + m + '分';
	return m + '分钟';
}

function strokeW(bps) {
	const m = Math.max(0, Number(bps) || 0);
	if (m < 8e3)
		return 3;
	if (m < 1e6)
		return 5;
	if (m < 2e7)
		return 7;
	if (m < 1e8)
		return 9;
	return 12;
}

function flowSpeed(bps) {
	const m = Math.max(0, Number(bps) || 0);
	if (m < 8e3)
		return 0;
	return Math.min(2.4, 0.28 + Math.log10(m / 8e3 + 1) * 0.7);
}

function flowCount(bps) {
	const m = Math.max(0, Number(bps) || 0);
	if (m < 8e3)
		return 0;
	if (m < 5e5)
		return 2;
	if (m < 5e6)
		return 3;
	if (m < 4e7)
		return 5;
	return 7;
}

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	prev: null,
	polling: false,
	animating: false,
	board: {},
	info: {},
	flows: [],
	selected: null,
	layoutKey: '',

	load() {
		return Promise.all([
			callSnapshot(),
			callBoard().catch(() => ({})),
			callInfo().catch(() => ({}))
		]);
	},

	defs() {
		return svgEl('defs', {}, [
			svgEl('filter', { id: 'topo-glow' }, [
				svgEl('feGaussianBlur', { stdDeviation: '1.6', result: 'b' }),
				svgEl('feMerge', {}, [
					svgEl('feMergeNode', { in: 'b' }),
					svgEl('feMergeNode', { in: 'SourceGraphic' })
				])
			])
		]);
	},

	icon(kind, x, y, color) {
		const g = svgEl('g', { transform: 'translate(' + x + ',' + y + ')', fill: color, stroke: 'none' });
		if (kind === 'cloud') {
			g.appendChild(svgEl('ellipse', { cx: -10, cy: 4, rx: 16, ry: 11, opacity: '0.95' }));
			g.appendChild(svgEl('ellipse', { cx: 12, cy: 6, rx: 14, ry: 10 }));
			g.appendChild(svgEl('ellipse', { cx: 0, cy: -6, rx: 13, ry: 11 }));
		} else if (kind === 'wan') {
			g.appendChild(svgEl('rect', { x: -18, y: -8, width: 36, height: 16, rx: 4 }));
			g.appendChild(svgEl('circle', { cx: -8, cy: 0, r: 3, fill: '#fff' }));
			g.appendChild(svgEl('circle', { cx: 8, cy: 0, r: 3, fill: '#fff' }));
		} else if (kind === 'router') {
			g.appendChild(svgEl('rect', { x: -22, y: -8, width: 44, height: 18, rx: 3 }));
			g.appendChild(svgEl('rect', { x: -16, y: -18, width: 4, height: 10, rx: 1 }));
			g.appendChild(svgEl('rect', { x: 12, y: -18, width: 4, height: 10, rx: 1 }));
			for (let i = 0; i < 4; i++)
				g.appendChild(svgEl('circle', { cx: -12 + i * 8, cy: 1, r: 2, fill: '#fff' }));
		} else if (kind === 'switch') {
			g.appendChild(svgEl('rect', { x: -24, y: -10, width: 48, height: 20, rx: 3 }));
			for (let i = 0; i < 5; i++)
				g.appendChild(svgEl('rect', { x: -18 + i * 8, y: -4, width: 5, height: 8, rx: 1, fill: '#fff', opacity: '0.9' }));
		} else {
			g.appendChild(svgEl('rect', { x: -11, y: -8, width: 22, height: 14, rx: 2 }));
			g.appendChild(svgEl('rect', { x: -6, y: 6, width: 12, height: 3, rx: 1 }));
			g.appendChild(svgEl('rect', { x: -14, y: -5, width: 10, height: 7, rx: 1, fill: '#fff', opacity: '0.35' }));
		}
		return g;
	},

	addFlow(x1, y1, x2, y2, bps, color, dir) {
		this.flows.push({ x1, y1, x2, y2, bps, color, dir: dir || 1, phase: Math.random() });
	},

	drawPipe(layer, x1, y1, x2, y2, color, bps, live) {
		layer.appendChild(svgEl('line', {
			x1: x1, y1: y1, x2: x2, y2: y2,
			stroke: 'rgba(127,127,127,.18)',
			'stroke-width': strokeW(bps) + 6,
			'stroke-linecap': 'round'
		}));
		layer.appendChild(svgEl('line', {
			x1: x1, y1: y1, x2: x2, y2: y2,
			stroke: color,
			'stroke-width': strokeW(bps),
			'stroke-linecap': 'round',
			opacity: live ? '0.95' : '0.45',
			filter: live ? 'url(#topo-glow)' : null
		}));
	},

	badge(layer, x, y, lines, color) {
		const w = Math.min(248, 28 + Math.max.apply(null, lines.map(s => String(s).length)) * 6.4);
		const h = 8 + lines.length * 14;
		layer.appendChild(svgEl('rect', {
			x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 7,
			fill: 'var(--background-color-high, #0f172a)',
			stroke: color,
			'stroke-width': 1.2,
			opacity: '0.92'
		}));
		lines.forEach((ln, i) => {
			layer.appendChild(svgEl('text', {
				x: x, y: y - h / 2 + 16 + i * 14,
				'text-anchor': 'middle', 'font-size': 11, 'font-weight': 650,
				fill: i ? '#e2e8f0' : color
			}, [ln]));
		});
	},

	device(layer, x, y, kind, title, lines, tone, key) {
		const color = healthColor(tone || 'ok');
		const w = kind === 'host' ? 132 : 150;
		const h = 86;
		const g = svgEl('g', {
			'class': 'topo-hit',
			'data-key': key || title,
			style: 'cursor:pointer'
		});
		g.appendChild(svgEl('rect', {
			x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 14,
			fill: 'var(--background-color-high, #fff)',
			stroke: color,
			'stroke-width': 2.6
		}));
		g.appendChild(this.icon(kind, x, y - 18, color));
		g.appendChild(svgEl('text', {
			x: x, y: y + 12, 'text-anchor': 'middle',
			'font-size': 13, 'font-weight': 750, fill: 'currentColor'
		}, [title]));
		(lines || []).forEach((ln, i) => {
			g.appendChild(svgEl('text', {
				x: x, y: y + 28 + i * 13, 'text-anchor': 'middle',
				'font-size': 10, fill: 'currentColor', opacity: '0.7'
			}, [ln]));
		});
		const self = this;
		g.addEventListener('click', function(ev) {
			ev.stopPropagation();
			self.selected = key || title;
			self.fillDetail();
		});
		layer.appendChild(g);
	},

	tick() {
		if (!this.animating)
			return;
		const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
		const layer = document.getElementById('topo-packets');
		if (!layer) {
			requestAnimationFrame(L.bind(this.tick, this));
			return;
		}
		while (layer.firstChild)
			layer.removeChild(layer.firstChild);
		this.flows.forEach(f => {
			const spd = flowSpeed(f.bps);
			const n = flowCount(f.bps);
			if (!n || !spd)
				return;
			for (let i = 0; i < n; i++) {
				let u = (t * spd + f.phase + i / n) % 1;
				if (f.dir < 0)
					u = 1 - u;
				const cx = f.x1 + (f.x2 - f.x1) * u;
				const cy = f.y1 + (f.y2 - f.y1) * u;
				layer.appendChild(svgEl('circle', {
					cx: cx, cy: cy, r: 4.2,
					fill: f.color,
					stroke: '#fff',
					'stroke-width': 1
				}));
			}
		});
		requestAnimationFrame(L.bind(this.tick, this));
	},

	snapshotModel(snap) {
		const wans = snap.wans || [];
		const lan = snap.lan || {};
		const sys = snap.sys || {};
		const sum = snap.clients_sum || {};
		const clients = (snap.clients || []).slice().sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
		const prev = this.prev;
		const wanRows = wans.map(w => {
			const pw = (prev && prev.wans || []).find(x => x.name === w.name);
			const rx = rateOf(pw && { ts: prev.ts, rx_bytes: pw.rx_bytes },
				{ ts: snap.ts, rx_bytes: w.rx_bytes }, 'rx_bytes');
			const tx = rateOf(pw && { ts: prev.ts, tx_bytes: pw.tx_bytes },
				{ ts: snap.ts, tx_bytes: w.tx_bytes }, 'tx_bytes');
			return {
				w, rx, tx,
				health: w.health || (w.up ? 'ok' : 'bad'),
				text: w.health_text || (w.up ? '正常' : '掉线')
			};
		});
		const lanRx = rateOf(
			prev && prev.lan ? { ts: prev.ts, rx_bytes: prev.lan.rx_bytes } : null,
			{ ts: snap.ts, rx_bytes: lan.rx_bytes }, 'rx_bytes');
		const lanTx = rateOf(
			prev && prev.lan ? { ts: prev.ts, tx_bytes: prev.lan.tx_bytes } : null,
			{ ts: snap.ts, tx_bytes: lan.tx_bytes }, 'tx_bytes');
		this.prev = snap;
		this.model = { wans: wanRows, lan, lanRx, lanTx, sys, sum, clients, snap };
		return this.model;
	},

	fillHud() {
		const el = document.getElementById('topo-hud');
		if (!el || !this.model)
			return;
		const m = this.model;
		const info = this.info || {};
		const mem = info.memory || {};
		const total = Number(mem.total) || 0;
		const avail = Number(mem.available != null ? mem.available : mem.free) || 0;
		const mpct = total ? Math.round((Math.max(0, total - avail) / total) * 100) : 0;
		let wanRx = 0, wanTx = 0;
		m.wans.forEach(r => { wanRx += r.rx; wanTx += r.tx; });
		const sys = m.sys || {};
		el.innerHTML = '';
		[
			['时间', sys.clock_hms || '--:--:--'],
			['CPU', (sys.cpu_pct != null ? sys.cpu_pct : '—') + '%'],
			['温度', sys.temp_c ? sys.temp_c + '℃' : '—'],
			['内存', mpct + '%'],
			['连接', String(sys.conn != null ? sys.conn : '—')],
			['WAN↓', fmtBitrate(wanRx)],
			['WAN↑', fmtBitrate(wanTx)],
			['LAN↓', fmtBitrate(m.lanTx)],
			['LAN↑', fmtBitrate(m.lanRx)],
			['在线', String((m.sum && m.sum.online) || 0)]
		].forEach(pair => {
			el.appendChild(E('div', { 'class': 'topo-kpi' }, [
				E('div', { 'class': 'k' }, pair[0]),
				E('div', { 'class': 'v' }, pair[1])
			]));
		});
	},

	fillDetail() {
		const box = document.getElementById('topo-detail');
		if (!box || !this.model)
			return;
		const m = this.model;
		const key = this.selected;
		let html = [E('h4', {}, '点选图中设备查看详情')];
		if (key === 'internet') {
			html = [E('h4', {}, 'Internet'), E('p', {}, '运营商侧。各 WAN 链路状态见左侧 WAN 节点。')];
		} else if (key === 'gateway') {
			const rel = (this.board && this.board.release) || {};
			html = [
				E('h4', {}, (this.board && this.board.hostname) || '网关'),
				E('p', {}, (rel.description || rel.version || '') + ' · LAN ' + (m.lan.ipv4 || '') + ' · ' + (m.lan.device || '')),
				E('p', {}, 'CPU ' + (m.sys.cpu_pct || 0) + '% · 温度 ' + (m.sys.temp_c || '—') + '℃ · 连接 ' + (m.sys.conn || 0) +
					(m.sys.conn_max ? ' / ' + m.sys.conn_max : '') +
					'（TCP ' + (m.sys.conn_tcp || 0) + ' / UDP ' + (m.sys.conn_udp || 0) + ' / ICMP ' + (m.sys.conn_icmp || 0) + '）')
			];
		} else if (key === 'switch') {
			html = [
				E('h4', {}, '核心交换机'),
				E('p', {}, '图中这条线是网关 LAN 口合计，不是交换机每个端口的计数。口级流量需要交换机 SNMP。'),
				E('p', {}, '网关→交换机 ↓ ' + fmtBitrate(m.lanTx) + '　交换机→网关 ↑ ' + fmtBitrate(m.lanRx)),
				E('p', {}, 'DHCP 租约 ' + ((m.sum && m.sum.leases) || m.clients.length) + ' · 邻居在线 ' + ((m.sum && m.sum.online) || 0))
			];
		} else if (key && key.indexOf('wan:') === 0) {
			const name = key.slice(4);
			const row = m.wans.find(r => r.w.name === name);
			if (row) {
				html = [
					E('h4', {}, row.w.name + ' · ' + row.text),
					E('p', {}, protoLabel(row.w.proto) + ' · ' + (row.w.device || '') + ' · ' + (row.w.ipv4 || '无地址')),
					E('p', {}, '延迟 ' + fmtLatency(row.w.latency) + (row.w.ifuptime ? ' · 已连 ' + fmtUptime(row.w.ifuptime) : '')),
					E('p', {}, '下载 ↓ ' + fmtBitrate(row.rx) + '　上传 ↑ ' + fmtBitrate(row.tx))
				];
			}
		} else if (key && key.indexOf('cli:') === 0) {
			const mac = key.slice(4);
			const c = m.clients.find(x => x.mac === mac);
			if (c) {
				html = [
					E('h4', {}, c.name || c.ip || '终端'),
					E('p', {}, (c.online ? '在线' : '离线') + ' · IP ' + (c.ip || '—') + ' · MAC ' + (c.mac || '—')),
					E('p', {}, '单机速率网关看不到；该终端与交换机之间的流量需交换机端口计数。')
				];
			}
		}
		box.innerHTML = '';
		html.forEach(n => box.appendChild(n));
	},

	fillTable() {
		const tbl = document.getElementById('topo-clients');
		if (!tbl || !this.model)
			return;
		const rows = this.model.clients.map(c => E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' }, c.online ? '在线' : '离线'),
			E('td', { 'class': 'td' }, c.name || ''),
			E('td', { 'class': 'td' }, c.ip || ''),
			E('td', { 'class': 'td' }, c.mac || '')
		]));
		tbl.innerHTML = '';
		tbl.appendChild(E('tr', { 'class': 'tr table-titles' }, [
			E('th', { 'class': 'th' }, '状态'),
			E('th', { 'class': 'th' }, '名称'),
			E('th', { 'class': 'th' }, 'IP'),
			E('th', { 'class': 'th' }, 'MAC')
		]));
		if (rows.length)
			rows.forEach(r => tbl.appendChild(r));
		else
			tbl.appendChild(E('tr', { 'class': 'tr' },
				E('td', { 'class': 'td', 'colspan': 4 }, '暂无 DHCP 租约')));
	},

	rebuild(svg, m) {
		const host = (this.board && this.board.hostname) || '网关';
		const shown = m.clients.slice(0, 12);
		const extra = Math.max(0, m.clients.length - shown.length);
		const wanN = Math.max(1, m.wans.length);
		const rightN = Math.max(1, shown.length + (extra ? 1 : 0));
		const W = 1280;
		const H = Math.max(520, 160 + Math.max(wanN, rightN) * 96);
		svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

		while (svg.firstChild)
			svg.removeChild(svg.firstChild);
		svg.appendChild(this.defs());
		const pipes = svgEl('g', { id: 'topo-pipes' });
		const packets = svgEl('g', { id: 'topo-packets' });
		const nodes = svgEl('g', { id: 'topo-nodes' });
		const labels = svgEl('g', { id: 'topo-labels' });
		svg.appendChild(pipes);
		svg.appendChild(packets);
		svg.appendChild(nodes);
		svg.appendChild(labels);

		this.flows = [];
		const inet = { x: 88, y: H / 2 };
		const wanX = 280;
		const gw = { x: 520, y: H / 2 };
		const sw = { x: 800, y: H / 2 };
		const cliX = 1080;
		const wanY = i => wanN === 1 ? H / 2 : 90 + i * ((H - 180) / Math.max(1, wanN - 1));
		const cliY = i => rightN === 1 ? H / 2 : 70 + i * ((H - 140) / Math.max(1, rightN - 1));

		this.device(nodes, inet.x, inet.y, 'cloud', 'Internet', ['运营商'], 'ok', 'internet');

		m.wans.forEach((row, i) => {
			const y = wanY(i);
			const col = healthColor(row.health);
			const live = row.health === 'ok' && (row.rx + row.tx) > 8000;
			this.drawPipe(pipes, inet.x + 50, inet.y, wanX - 76, y, col, row.rx + row.tx, live);
			this.drawPipe(pipes, wanX + 76, y, gw.x - 76, gw.y + (i - (wanN - 1) / 2) * 12, col, row.rx + row.tx, live);
			this.badge(labels, (inet.x + wanX) / 2, (inet.y + y) / 2 - 6, [row.w.name, row.text], col);
			this.badge(labels, (wanX + gw.x) / 2, (y + gw.y) / 2 - 10, [
				'↓ ' + fmtBitrate(row.rx),
				'↑ ' + fmtBitrate(row.tx)
			], col);
			this.addFlow(inet.x + 50, inet.y, wanX - 76, y, row.rx, '#22c55e', 1);
			this.addFlow(wanX - 76, y, inet.x + 50, inet.y, row.tx, '#3b82f6', 1);
			this.addFlow(wanX + 76, y, gw.x - 76, gw.y + (i - (wanN - 1) / 2) * 12, row.rx, '#22c55e', 1);
			this.addFlow(gw.x - 76, gw.y + (i - (wanN - 1) / 2) * 12, wanX + 76, y, row.tx, '#3b82f6', 1);
			this.device(nodes, wanX, y, 'wan', row.w.name, [
				row.text,
				trunc((protoLabel(row.w.proto) + ' ' + (row.w.ipv4 || '')).trim(), 18)
			], row.health, 'wan:' + row.w.name);
		});

		if (!m.wans.length) {
			this.device(nodes, wanX, H / 2, 'wan', 'WAN', ['未发现'], 'warn', 'wan');
			this.drawPipe(pipes, inet.x + 50, inet.y, wanX - 76, H / 2, '#94a3b8', 0, false);
			this.drawPipe(pipes, wanX + 76, H / 2, gw.x - 76, gw.y, '#94a3b8', 0, false);
		}

		const wanOk = m.wans.filter(r => r.health === 'ok').length;
		const gwTone = !m.wans.length ? 'warn' : (wanOk ? 'ok' : 'bad');
		this.device(nodes, gw.x, gw.y, 'router', trunc(host, 12), [
			'网关',
			trunc(m.lan.ipv4 || m.lan.device || '', 16)
		], gwTone, 'gateway');

		const lanLive = (m.lanRx + m.lanTx) > 8000;
		this.drawPipe(pipes, gw.x + 76, gw.y, sw.x - 76, sw.y, '#2563eb', m.lanRx + m.lanTx, lanLive);
		this.badge(labels, (gw.x + sw.x) / 2, gw.y - 28, [
			'↓ ' + fmtBitrate(m.lanTx),
			'↑ ' + fmtBitrate(m.lanRx)
		], '#60a5fa');
		this.addFlow(gw.x + 76, gw.y, sw.x - 76, sw.y, m.lanTx, '#22c55e', 1);
		this.addFlow(sw.x - 76, sw.y, gw.x + 76, gw.y, m.lanRx, '#3b82f6', 1);

		this.device(nodes, sw.x, sw.y, 'switch', '核心交换机', [
			'LAN 上联合计',
			'在线 ' + ((m.sum && m.sum.online) || 0) + '/' + m.clients.length
		], 'ok', 'switch');

		shown.forEach((c, i) => {
			const y = cliY(i);
			const col = c.online ? '#64748b' : '#cbd5e1';
			this.drawPipe(pipes, sw.x + 76, sw.y, cliX - 68, y, col, 0, false);
			this.device(nodes, cliX, y, 'host', trunc(c.name || c.ip || '终端', 12), [
				trunc(c.ip || '', 15),
				c.online ? '在线' : '离线'
			], c.online ? 'ok' : 'bad', 'cli:' + c.mac);
		});
		if (extra) {
			const y = cliY(shown.length);
			this.drawPipe(pipes, sw.x + 76, sw.y, cliX - 68, y, '#94a3b8', 0, false);
			this.device(nodes, cliX, y, 'host', '更多终端', [extra + ' 台见下表'], 'warn', 'switch');
		}
	},

	paint(snap, info, svgNode) {
		if (info)
			this.info = info;
		const svg = svgNode || document.getElementById('topo-svg');
		if (!svg)
			return;
		const m = this.snapshotModel(snap || {});
		this.rebuild(svg, m);
		this.fillHud();
		this.fillDetail();
		this.fillTable();
	},

	render(data) {
		this.board = data[1] || {};
		this.info = data[2] || {};
		const svg = svgEl('svg', {
			id: 'topo-svg',
			class: 'topo-svg',
			preserveAspectRatio: 'xMidYMid meet'
		});
		const wrap = E('div', { 'class': 'topo-wrap' }, [
			E('h2', {}, '概览'),
			E('p', {}, '实时拓扑图：绿点为下载、蓝点为上传，流量越大点越多、连线越粗。点选设备查看详情。'),
			E('p', { 'class': 'topo-links' },
				E('a', { 'href': L.url('admin/status/wanmonitor') }, '宽带监控（分线路速率图） →')),
			E('div', { 'id': 'topo-hud', 'class': 'topo-hud' }),
			svg,
			E('div', { 'id': 'topo-detail', 'class': 'topo-detail' }),
			E('h3', {}, '全部终端'),
			E('table', { 'class': 'table', 'id': 'topo-clients' }),
			E('style', {}, `
				.topo-wrap { max-width: 1280px; }
				.topo-hud { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 10px; }
				.topo-kpi { min-width:88px; padding:8px 10px; border-radius:10px;
					background: var(--background-color-high, #fff);
					border:1px solid var(--border-color-medium, rgba(127,127,127,.16)); }
				.topo-kpi .k { font-size:11px; opacity:.65; }
				.topo-kpi .v { font-size:15px; font-weight:750; font-variant-numeric: tabular-nums; }
				.topo-svg { width:100%; height:auto; display:block; min-height:480px;
					background: radial-gradient(1200px 500px at 20% 50%, rgba(37,99,235,.06), transparent 55%),
						var(--background-color-high, #fff);
					border:1px solid var(--border-color-medium, rgba(127,127,127,.16));
					border-radius:14px; color: inherit; }
				.topo-detail { margin:12px 0; padding:12px 14px; border-radius:10px;
					border:1px solid var(--border-color-medium, rgba(127,127,127,.16));
					background: var(--background-color-high, #fff); min-height:72px; }
				.topo-detail h4 { margin:0 0 6px; }
				.topo-detail p { margin:4px 0; font-size:13px; }
				.topo-links { margin:0 0 10px; font-size:13px; }
			`)
		]);

		this.paint(data[0] || {}, this.info, svg);
		if (!this.animating) {
			this.animating = true;
			requestAnimationFrame(L.bind(this.tick, this));
		}
		if (!this.polling) {
			this.polling = true;
			poll.add(L.bind(function() {
				return Promise.all([
					callSnapshot(),
					callInfo().catch(() => this.info)
				]).then(L.bind(function(res) {
					this.paint(res[0], res[1]);
				}, this));
			}, this), 1);
		}
		return wrap;
	}
});
