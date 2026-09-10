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

const FIELD_CATALOG = {
	internet: [
		{ id: 'hint', label: '说明' }
	],
	wan: [
		{ id: 'status', label: '状态' },
		{ id: 'proto', label: '协议' },
		{ id: 'ip', label: 'IP 地址' },
		{ id: 'dev', label: '网卡' },
		{ id: 'rate', label: '上下行速率' },
		{ id: 'lat', label: '延迟' },
		{ id: 'uptime', label: '已连接时长' }
	],
	gateway: [
		{ id: 'role', label: '角色' },
		{ id: 'lanip', label: 'LAN 地址' },
		{ id: 'cpu', label: 'CPU' },
		{ id: 'temp', label: '温度' },
		{ id: 'conn', label: '连接数' }
	],
	switch: [
		{ id: 'hint', label: '说明' },
		{ id: 'rate', label: 'LAN 合计速率' },
		{ id: 'online', label: '在线终端' }
	],
	host: [
		{ id: 'ip', label: 'IP' },
		{ id: 'mac', label: 'MAC' },
		{ id: 'online', label: '在线状态' }
	],
	link_inet_wan: [
		{ id: 'name', label: '线路名' },
		{ id: 'status', label: '状态' },
		{ id: 'rate', label: '上下行速率' },
		{ id: 'lat', label: '延迟' }
	],
	link_wan_gw: [
		{ id: 'name', label: '线路名' },
		{ id: 'rate', label: '上下行速率' },
		{ id: 'lat', label: '延迟' }
	],
	link_gw_sw: [
		{ id: 'name', label: '名称' },
		{ id: 'rate', label: '上下行速率' }
	],
	link_sw_cli: [
		{ id: 'name', label: '终端名' },
		{ id: 'hint', label: '无单机流量说明' }
	]
};

const FIELD_DEFAULTS = {
	internet: ['hint'],
	wan: ['status', 'ip'],
	gateway: ['role', 'lanip'],
	switch: ['hint', 'online'],
	host: ['ip', 'online'],
	link_inet_wan: ['name', 'rate'],
	link_wan_gw: ['rate'],
	link_gw_sw: ['rate'],
	link_sw_cli: []
};

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

function memPct(info) {
	const mem = (info && info.memory) || {};
	const total = Number(mem.total) || 0;
	const avail = Number(mem.available != null ? mem.available : mem.free) || 0;
	return total ? Math.round((Math.max(0, total - avail) / total) * 100) : 0;
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
	selectedKind: null,
	pos: {},
	fields: {},
	posKey: 'lede-topo-pos-v1',
	fieldKey: 'lede-topo-fields-v1',

	loadStore(key, fallback) {
		try {
			return Object.assign(fallback, JSON.parse(localStorage.getItem(key) || '{}') || {});
		}
		catch (e) {
			return fallback;
		}
	},

	saveStore(key, obj) {
		try {
			localStorage.setItem(key, JSON.stringify(obj || {}));
		}
		catch (e) {}
	},

	loadPos() { this.pos = this.loadStore(this.posKey, {}); },
	savePos() { this.saveStore(this.posKey, this.pos); },
	loadFields() { this.fields = this.loadStore(this.fieldKey, {}); },
	saveFields() { this.saveStore(this.fieldKey, this.fields); },

	shown(key, kind) {
		if (this.fields && Object.prototype.hasOwnProperty.call(this.fields, key))
			return (this.fields[key] || []).slice();
		return (FIELD_DEFAULTS[kind] || []).slice();
	},

	toggleField(key, kind, id, on) {
		let cur = this.shown(key, kind);
		if (on && cur.indexOf(id) < 0)
			cur.push(id);
		if (!on)
			cur = cur.filter(x => x !== id);
		this.fields[key] = cur;
		this.saveFields();
	},

	xy(key, x, y) {
		const p = (this.pos || {})[key];
		if (p && isFinite(p.x) && isFinite(p.y))
			return { x: p.x, y: p.y };
		return { x: x, y: y };
	},

	clientToSvg(svg, cx, cy) {
		const pt = svg.createSVGPoint();
		pt.x = cx;
		pt.y = cy;
		const m = svg.getScreenCTM();
		if (!m)
			return { x: cx, y: cy };
		const p = pt.matrixTransform(m.inverse());
		return { x: p.x, y: p.y };
	},

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

	pick(kind, key, bag) {
		const out = [];
		this.shown(key, kind).forEach(id => {
			const v = bag[id];
			if (v == null || v === '')
				return;
			if (Array.isArray(v))
				v.forEach(x => out.push(x));
			else
				out.push(String(v));
		});
		return out;
	},

	addFlow(x1, y1, x2, y2, bps, color, dir) {
		this.flows.push({ x1, y1, x2, y2, bps, color, dir: dir || 1, phase: Math.random() });
	},

	drawPipe(layer, x1, y1, x2, y2, color, bps, live, key, kind) {
		layer.appendChild(svgEl('line', {
			x1: x1, y1: y1, x2: x2, y2: y2,
			stroke: 'rgba(127,127,127,.18)',
			'stroke-width': strokeW(bps) + 6,
			'stroke-linecap': 'round'
		}));
		const sel = this.selected === key;
		layer.appendChild(svgEl('line', {
			x1: x1, y1: y1, x2: x2, y2: y2,
			stroke: color,
			'stroke-width': strokeW(bps) + (sel ? 3 : 0),
			'stroke-linecap': 'round',
			opacity: live ? '0.95' : '0.45',
			filter: live ? 'url(#topo-glow)' : null
		}));
		const hit = svgEl('line', {
			x1: x1, y1: y1, x2: x2, y2: y2,
			stroke: 'transparent',
			'stroke-width': 18,
			'stroke-linecap': 'round',
			style: 'cursor:pointer'
		});
		const self = this;
		hit.addEventListener('click', function(ev) {
			ev.stopPropagation();
			self.selected = key;
			self.selectedKind = kind;
			self.fillDetail();
			if (self.model && self.model.snap)
				self.rebuild(document.getElementById('topo-svg'), self.model);
		});
		layer.appendChild(hit);
	},

	badge(layer, x, y, lines, color) {
		if (!lines || !lines.length)
			return;
		const w = Math.min(260, 28 + Math.max.apply(null, lines.map(s => String(s).length)) * 6.4);
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

	device(layer, x, y, kind, title, lines, tone, key, fieldKind) {
		const color = healthColor(tone || 'ok');
		const sel = this.selected === key;
		const n = Math.max(1, (lines || []).length);
		const w = kind === 'host' ? 138 : 158;
		const h = 70 + n * 13;
		const g = svgEl('g', {
			'class': 'topo-hit',
			'data-key': key || title,
			style: 'cursor:grab'
		});
		g.appendChild(svgEl('rect', {
			x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 14,
			fill: 'var(--background-color-high, #fff)',
			stroke: color,
			'stroke-width': sel ? 4 : 2.4
		}));
		g.appendChild(this.icon(kind, x, y - h / 2 + 22, color));
		g.appendChild(svgEl('text', {
			x: x, y: y - h / 2 + 42, 'text-anchor': 'middle',
			'font-size': 13, 'font-weight': 750, fill: 'currentColor'
		}, [title]));
		(lines || []).forEach((ln, i) => {
			g.appendChild(svgEl('text', {
				x: x, y: y - h / 2 + 58 + i * 13, 'text-anchor': 'middle',
				'font-size': 10, fill: 'currentColor', opacity: '0.72'
			}, [ln]));
		});
		this.bindNode(g, key || title, fieldKind || kind);
		layer.appendChild(g);
	},

	bindNode(g, key, kind) {
		const self = this;
		g.addEventListener('click', function(ev) {
			if (self._didDrag) {
				self._didDrag = false;
				ev.stopPropagation();
				return;
			}
			ev.stopPropagation();
			self.selected = key;
			self.selectedKind = kind;
			self.fillDetail();
			if (self.model)
				self.rebuild(document.getElementById('topo-svg'), self.model);
		});
		g.addEventListener('pointerdown', function(ev) {
			if (ev.button)
				return;
			ev.preventDefault();
			ev.stopPropagation();
			const svg = document.getElementById('topo-svg');
			if (!svg)
				return;
			self._didDrag = false;
			self._dragging = true;
			const start = self.clientToSvg(svg, ev.clientX, ev.clientY);
			const cur = self.xy(key, start.x, start.y);
			const dx = start.x - cur.x, dy = start.y - cur.y;
			function move(e) {
				const p = self.clientToSvg(svg, e.clientX, e.clientY);
				self.pos = self.pos || {};
				self.pos[key] = { x: p.x - dx, y: p.y - dy };
				self._didDrag = true;
			}
			function up() {
				window.removeEventListener('pointermove', move);
				window.removeEventListener('pointerup', up);
				self._dragging = false;
				if (self._didDrag) {
					self.savePos();
					if (self.model)
						self.rebuild(svg, self.model);
				}
			}
			window.addEventListener('pointermove', move);
			window.addEventListener('pointerup', up);
		});
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
				layer.appendChild(svgEl('circle', {
					cx: f.x1 + (f.x2 - f.x1) * u,
					cy: f.y1 + (f.y2 - f.y1) * u,
					r: 4.2,
					fill: f.color,
					stroke: '#fff',
					'stroke-width': 1
				}));
			}
		});
		requestAnimationFrame(L.bind(this.tick, this));
	},

	snapshotModel(snap) {
		if (this.prev && snap && this.prev.ts === snap.ts && this.model)
			return this.model;
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
		let wanRx = 0, wanTx = 0;
		m.wans.forEach(r => { wanRx += r.rx; wanTx += r.tx; });
		const sys = m.sys || {};
		el.innerHTML = '';
		[
			['时间', sys.clock_hms || '--:--:--'],
			['CPU', (sys.cpu_pct != null ? sys.cpu_pct : '—') + '%'],
			['温度', sys.temp_c ? sys.temp_c + '℃' : '—'],
			['内存', memPct(this.info) + '%'],
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

	entityTitle(key, kind) {
		if (kind && kind.indexOf('link_') === 0)
			return '连线';
		if (key === 'internet')
			return 'Internet';
		if (key === 'gateway')
			return (this.board && this.board.hostname) || '网关';
		if (key === 'switch')
			return '核心交换机';
		if (key && key.indexOf('wan:') === 0)
			return key.slice(4);
		if (key && key.indexOf('cli:') === 0) {
			const c = (this.model.clients || []).find(x => x.mac === key.slice(4));
			return (c && (c.name || c.ip)) || '终端';
		}
		return key || '未选择';
	},

	fillDetail() {
		const box = document.getElementById('topo-detail');
		if (!box || !this.model)
			return;
		const m = this.model;
		const key = this.selected;
		const kind = this.selectedKind;
		box.innerHTML = '';
		if (!key) {
			box.appendChild(E('h4', {}, '点选图中的设备或连线'));
			box.appendChild(E('p', {}, '选中后可勾选要画在图上的数据。数据来自系统当前 WAN / LAN / 主机状态。拖动节点可改布局。'));
			return;
		}

		const facts = [];
		if (key === 'internet')
			facts.push('运营商侧。各 WAN 的实时速率画在连到 Internet 的线上。');
		else if (key === 'gateway') {
			const rel = (this.board && this.board.release) || {};
			facts.push((rel.description || rel.version || '') + ' · LAN ' + (m.lan.ipv4 || '') + ' · ' + (m.lan.device || ''));
			facts.push('CPU ' + (m.sys.cpu_pct || 0) + '% · 温度 ' + (m.sys.temp_c || '—') + '℃ · 连接 ' + (m.sys.conn || 0));
		} else if (key === 'switch') {
			facts.push('网关 LAN 口合计，不是交换机每个物理口。');
			facts.push('↓ ' + fmtBitrate(m.lanTx) + '　↑ ' + fmtBitrate(m.lanRx));
		} else if (key.indexOf('wan:') === 0) {
			const row = m.wans.find(r => r.w.name === key.slice(4));
			if (row) {
				facts.push(row.text + ' · ' + protoLabel(row.w.proto) + ' · ' + (row.w.ipv4 || '无地址'));
				facts.push('↓ ' + fmtBitrate(row.rx) + '　↑ ' + fmtBitrate(row.tx) + ' · 延迟 ' + fmtLatency(row.w.latency));
			}
		} else if (key.indexOf('cli:') === 0) {
			const c = m.clients.find(x => x.mac === key.slice(4));
			if (c)
				facts.push((c.online ? '在线' : '离线') + ' · ' + (c.ip || '') + ' · ' + (c.mac || ''));
			facts.push('网关看不到单机流量；若要口级速率需要交换机 SNMP。');
		} else if (kind && kind.indexOf('link_') === 0)
			facts.push('这条连线绑定的是系统里对应接口/方向的实时计数。');

		box.appendChild(E('h4', {}, this.entityTitle(key, kind)));
		facts.forEach(t => box.appendChild(E('p', {}, t)));

		const cat = FIELD_CATALOG[kind] || [];
		if (cat.length) {
			box.appendChild(E('p', { 'class': 'topo-edit-lab' }, '图上显示（只改当前选中的这一项）'));
			const row = E('div', { 'class': 'topo-edit' });
			const shown = this.shown(key, kind);
			cat.forEach(f => {
				const c = E('input', { 'type': 'checkbox' });
				c.checked = shown.indexOf(f.id) >= 0;
				c.addEventListener('change', L.bind(function() {
					this.toggleField(key, kind, f.id, c.checked);
					this.rebuild(document.getElementById('topo-svg'), this.model);
					this.fillDetail();
				}, this));
				row.appendChild(E('label', { 'class': 'topo-opt' }, [c, ' ' + f.label]));
			});
			box.appendChild(row);
		}
	},

	fillTable() {
		const tbl = document.getElementById('topo-clients');
		if (!tbl || !this.model)
			return;
		const self = this;
		const rows = this.model.clients.map(c => {
			const tr = E('tr', { 'class': 'tr', 'style': 'cursor:pointer' }, [
				E('td', { 'class': 'td' }, c.online ? '在线' : '离线'),
				E('td', { 'class': 'td' }, c.name || ''),
				E('td', { 'class': 'td' }, c.ip || ''),
				E('td', { 'class': 'td' }, c.mac || '')
			]);
			tr.addEventListener('click', function() {
				self.selected = 'cli:' + c.mac;
				self.selectedKind = 'host';
				self.fillDetail();
				self.rebuild(document.getElementById('topo-svg'), self.model);
			});
			return tr;
		});
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
		if (!svg || !m)
			return;
		this.loadPos();
		this.loadFields();
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
		const wanX = 280;
		const cliX = 1080;
		const wanY = i => wanN === 1 ? H / 2 : 90 + i * ((H - 180) / Math.max(1, wanN - 1));
		const cliY = i => rightN === 1 ? H / 2 : 70 + i * ((H - 140) / Math.max(1, rightN - 1));
		const inet = this.xy('internet', 88, H / 2);
		const gw = this.xy('gateway', 520, H / 2);
		const sw = this.xy('switch', 800, H / 2);

		this.device(nodes, inet.x, inet.y, 'cloud', 'Internet',
			this.pick('internet', 'internet', { hint: '运营商' }),
			'ok', 'internet', 'internet');

		m.wans.forEach((row, i) => {
			const wanKey = 'wan:' + row.w.name;
			const wan = this.xy(wanKey, wanX, wanY(i));
			const col = healthColor(row.health);
			const live = row.health === 'ok' && (row.rx + row.tx) > 8000;
			const lkInet = 'link:inet:' + row.w.name;
			const lkGw = 'link:gw:' + row.w.name;
			this.drawPipe(pipes, inet.x + 50, inet.y, wan.x - 76, wan.y, col, row.rx + row.tx, live, lkInet, 'link_inet_wan');
			this.drawPipe(pipes, wan.x + 76, wan.y, gw.x - 76, gw.y + (i - (wanN - 1) / 2) * 12, col, row.rx + row.tx, live, lkGw, 'link_wan_gw');
			this.badge(labels, (inet.x + wan.x) / 2, (inet.y + wan.y) / 2 - 8, this.pick('link_inet_wan', lkInet, {
				name: row.w.name,
				status: row.text,
				rate: ['↓ ' + fmtBitrate(row.rx), '↑ ' + fmtBitrate(row.tx)],
				lat: '延迟 ' + fmtLatency(row.w.latency)
			}), col);
			this.badge(labels, (wan.x + gw.x) / 2, (wan.y + gw.y) / 2 - 10, this.pick('link_wan_gw', lkGw, {
				name: row.w.name,
				rate: ['↓ ' + fmtBitrate(row.rx), '↑ ' + fmtBitrate(row.tx)],
				lat: '延迟 ' + fmtLatency(row.w.latency)
			}), col);
			this.addFlow(inet.x + 50, inet.y, wan.x - 76, wan.y, row.rx, '#22c55e', 1);
			this.addFlow(wan.x - 76, wan.y, inet.x + 50, inet.y, row.tx, '#3b82f6', 1);
			this.addFlow(wan.x + 76, wan.y, gw.x - 76, gw.y + (i - (wanN - 1) / 2) * 12, row.rx, '#22c55e', 1);
			this.addFlow(gw.x - 76, gw.y + (i - (wanN - 1) / 2) * 12, wan.x + 76, wan.y, row.tx, '#3b82f6', 1);
			this.device(nodes, wan.x, wan.y, 'wan', row.w.name, this.pick('wan', wanKey, {
				status: row.text,
				proto: protoLabel(row.w.proto),
				ip: row.w.ipv4 || '无地址',
				dev: row.w.device || '',
				rate: '↓ ' + fmtBitrate(row.rx) + ' ↑ ' + fmtBitrate(row.tx),
				lat: '延迟 ' + fmtLatency(row.w.latency),
				uptime: row.w.ifuptime ? fmtUptime(row.w.ifuptime) : ''
			}), row.health, wanKey, 'wan');
		});

		if (!m.wans.length) {
			const wan = this.xy('wan', wanX, H / 2);
			this.device(nodes, wan.x, wan.y, 'wan', 'WAN', ['未发现'], 'warn', 'wan', 'wan');
			this.drawPipe(pipes, inet.x + 50, inet.y, wan.x - 76, wan.y, '#94a3b8', 0, false, 'link:inet:none', 'link_inet_wan');
			this.drawPipe(pipes, wan.x + 76, wan.y, gw.x - 76, gw.y, '#94a3b8', 0, false, 'link:gw:none', 'link_wan_gw');
		}

		const wanOk = m.wans.filter(r => r.health === 'ok').length;
		const gwTone = !m.wans.length ? 'warn' : (wanOk ? 'ok' : 'bad');
		this.device(nodes, gw.x, gw.y, 'router', trunc(host, 12), this.pick('gateway', 'gateway', {
			role: '网关',
			lanip: m.lan.ipv4 || m.lan.device || '',
			cpu: 'CPU ' + (m.sys.cpu_pct != null ? m.sys.cpu_pct : '—') + '%',
			temp: m.sys.temp_c ? m.sys.temp_c + '℃' : '',
			conn: '连接 ' + (m.sys.conn != null ? m.sys.conn : '—')
		}), gwTone, 'gateway', 'gateway');

		const lanLive = (m.lanRx + m.lanTx) > 8000;
		this.drawPipe(pipes, gw.x + 76, gw.y, sw.x - 76, sw.y, '#2563eb', m.lanRx + m.lanTx, lanLive, 'link:lan', 'link_gw_sw');
		this.badge(labels, (gw.x + sw.x) / 2, gw.y - 28, this.pick('link_gw_sw', 'link:lan', {
			name: 'LAN',
			rate: ['↓ ' + fmtBitrate(m.lanTx), '↑ ' + fmtBitrate(m.lanRx)]
		}), '#60a5fa');
		this.addFlow(gw.x + 76, gw.y, sw.x - 76, sw.y, m.lanTx, '#22c55e', 1);
		this.addFlow(sw.x - 76, sw.y, gw.x + 76, gw.y, m.lanRx, '#3b82f6', 1);

		this.device(nodes, sw.x, sw.y, 'switch', '核心交换机', this.pick('switch', 'switch', {
			hint: 'LAN 上联合计',
			rate: '↓ ' + fmtBitrate(m.lanTx) + ' ↑ ' + fmtBitrate(m.lanRx),
			online: '在线 ' + ((m.sum && m.sum.online) || 0) + '/' + m.clients.length
		}), 'ok', 'switch', 'switch');

		shown.forEach((c, i) => {
			const ck = 'cli:' + c.mac;
			const cli = this.xy(ck, cliX, cliY(i));
			const lk = 'link:cli:' + c.mac;
			const col = c.online ? '#64748b' : '#cbd5e1';
			this.drawPipe(pipes, sw.x + 76, sw.y, cli.x - 68, cli.y, col, 0, false, lk, 'link_sw_cli');
			this.badge(labels, (sw.x + cli.x) / 2, (sw.y + cli.y) / 2, this.pick('link_sw_cli', lk, {
				name: trunc(c.name || c.ip || '', 14),
				hint: '无单机流量'
			}), col);
			this.device(nodes, cli.x, cli.y, 'host', trunc(c.name || c.ip || '终端', 12), this.pick('host', ck, {
				ip: c.ip || '',
				mac: c.mac || '',
				online: c.online ? '在线' : '离线'
			}), c.online ? 'ok' : 'bad', ck, 'host');
		});
		if (extra) {
			const more = this.xy('cli-more', cliX, cliY(shown.length));
			this.drawPipe(pipes, sw.x + 76, sw.y, more.x - 68, more.y, '#94a3b8', 0, false, 'link:cli-more', 'link_sw_cli');
			this.device(nodes, more.x, more.y, 'host', '更多终端', [extra + ' 台见下表'], 'warn', 'cli-more', 'host');
		}
	},

	paint(snap, info, svgNode) {
		if (this._dragging)
			return;
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
		this.loadFields();
		const svg = svgEl('svg', {
			id: 'topo-svg',
			class: 'topo-svg',
			preserveAspectRatio: 'xMidYMid meet'
		});
		svg.addEventListener('click', L.bind(function() {
			this.selected = null;
			this.selectedKind = null;
			this.fillDetail();
			if (this.model)
				this.rebuild(svg, this.model);
		}, this));
		const wrap = E('div', { 'class': 'topo-wrap' }, [
			E('h2', {}, '概览'),
			E('p', {}, 'WAN 按实际线路增减。点设备或连线，在下方勾选要显示的数据；可拖动节点，布局保存在本机浏览器。'),
			E('div', { 'class': 'topo-opts' }, [
				E('button', {
					'class': 'btn',
					'click': L.bind(function(ev) {
						ev.preventDefault();
						this.pos = {};
						this.savePos();
						if (this.model && this.model.snap)
							this.paint(this.model.snap, this.info, svg);
					}, this)
				}, '重置图形位置'),
				E('button', {
					'class': 'btn',
					'click': L.bind(function(ev) {
						ev.preventDefault();
						this.fields = {};
						this.saveFields();
						if (this.model && this.model.snap)
							this.paint(this.model.snap, this.info, svg);
					}, this)
				}, '重置显示字段')
			]),
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
					background: var(--background-color-high, #fff); min-height:88px; }
				.topo-detail h4 { margin:0 0 6px; }
				.topo-detail p { margin:4px 0; font-size:13px; }
				.topo-edit-lab { margin-top:10px !important; font-weight:650; }
				.topo-edit { display:flex; flex-wrap:wrap; gap:10px 14px; }
				.topo-links { margin:0 0 10px; font-size:13px; }
				.topo-opts { display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin:0 0 10px; font-size:13px; }
				.topo-opt { display:inline-flex; align-items:center; gap:4px; }
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
