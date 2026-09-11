'use strict';
'require view';
'require poll';
'require rpc';

const NS = 'http://www.w3.org/2000/svg';

const callSnapshot = rpc.declare({
	object: 'wanmonitor',
	method: 'snapshot',
	expect: {}
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
		{ id: 'title', label: '名称' },
		{ id: 'hint', label: '说明' }
	],
	nic: [
		{ id: 'name', label: '接口名' },
		{ id: 'status', label: '状态' },
		{ id: 'proto', label: '协议' },
		{ id: 'ip', label: 'IP 地址' },
		{ id: 'rate', label: '上下行速率' },
		{ id: 'lat', label: '延迟' },
		{ id: 'uptime', label: '已连接时长' }
	],
	gateway: [
		{ id: 'title', label: '名称' },
		{ id: 'role', label: '角色' },
		{ id: 'lanip', label: 'LAN 地址' },
		{ id: 'cpu', label: 'CPU' },
		{ id: 'temp', label: '温度' },
		{ id: 'conn', label: '连接数' },
		{ id: 'wans', label: 'WAN 口' }
	],
	switch: [
		{ id: 'title', label: '名称' },
		{ id: 'hint', label: '说明' },
		{ id: 'rate', label: 'LAN 合计速率' },
		{ id: 'online', label: '在线终端' },
		{ id: 'rank', label: '客户端排行' }
	],
	host: [
		{ id: 'name', label: '客户端名称' },
		{ id: 'ip', label: 'IP' },
		{ id: 'mac', label: 'MAC' },
		{ id: 'rate', label: '上下行速率' },
		{ id: 'online', label: '在线状态' }
	],
	wan_sum: [
		{ id: 'title', label: '总带宽标题' },
		{ id: 'rate', label: '上下行速率' }
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
		{ id: 'rate', label: '上下行速率' }
	]
};

const FIELD_DEFAULTS = {
	internet: [],
	nic: ['name'],
	gateway: ['title', 'role', 'lanip'],
	switch: ['title', 'hint', 'online', 'rank'],
	host: ['ip', 'rate'],
	wan_sum: ['title', 'rate'],
	link_inet_wan: ['rate'],
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
	const p = bitrateParts(bps);
	return p.num + ' ' + p.unit;
}

function bitrateParts(bps) {
	if (!isFinite(bps) || bps < 0)
		bps = 0;
	const units = ['Kbps', 'Mbps', 'Gbps', 'Tbps'];
	const divs = [1e3, 1e6, 1e9, 1e12];
	let i = 0;
	while (i < units.length - 1 && (bps / divs[i]) >= 1e5)
		i++;
	let v = bps / divs[i];
	let decimals = 0;
	if (v >= 10000)
		decimals = 0;
	else if (v >= 1000)
		decimals = 1;
	else if (v >= 100)
		decimals = 2;
	else if (v >= 10)
		decimals = 3;
	else if (v > 0)
		decimals = 4;
	let num = v.toFixed(decimals);
	if (Number(num) >= 1e5 && i < units.length - 1) {
		i++;
		v = bps / divs[i];
		decimals = v >= 100 ? 2 : (v >= 10 ? 3 : 4);
		num = v.toFixed(decimals);
	}
	if (num.indexOf('.') >= 0)
		num = num.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
	if (num.replace('.', '').length > 5 && i < units.length - 1) {
		i++;
		v = bps / divs[i];
		num = v >= 10 ? v.toFixed(3) : v.toFixed(4);
		if (num.indexOf('.') >= 0)
			num = num.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
	}
	return { num: num, unit: units[i] };
}

function padFig(s, w, dir) {
	s = String(s);
	const sp = '\u2007';
	while (s.length < w)
		s = dir === 'end' ? s + sp : sp + s;
	return s;
}

const RATE_NUM_W = 6;
const RATE_UNIT_W = 4;
const CLI_PITCH = 18;
const TOPO_CANVAS = { w: 1280, h: 520 };
const TOPO_TEMPLATE = {
	internet: { x: 110, y: 260, w: 96, h: 72 },
	gateway: { x: 480, y: 260, w: 210, h: 120 },
	switch: { x: 820, y: 260, w: 228, h: 140 },
	wanSum: { dx: 0, dy: -56 },
	inetJackDx: 80,
	wanFan: 16,
	lanStackDx: 56
};

function clientHostname(c) {
	if (!c)
		return '';
	if (c.hostname)
		return c.hostname;
	if (c.name && c.ip && c.name !== c.ip)
		return c.name;
	if (c.name && !c.ip)
		return c.name;
	return '';
}

const RATE_FONT = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';

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

const COL_RX = '#16a34a';
const COL_TX = '#2563eb';

const GRID = 24;

function snapVal(v, on) {
	if (!on)
		return v;
	return Math.round(Number(v) / GRID) * GRID;
}

function fan(cy, i, n, step) {
	if (!(n > 1))
		return cy;
	return cy + (i - (n - 1) / 2) * step;
}

function curveCtrl(x1, y1, x2, y2, bulge) {
	const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
	const dx = x2 - x1, dy = y2 - y1;
	const len = Math.hypot(dx, dy) || 1;
	return { cx: mx - dy / len * bulge, cy: my + dx / len * bulge };
}

function qPoint(t, x1, y1, cx, cy, x2, y2) {
	const u = 1 - t;
	return {
		x: u * u * x1 + 2 * u * t * cx + t * t * x2,
		y: u * u * y1 + 2 * u * t * cy + t * t * y2
	};
}

function qAngle(t, x1, y1, cx, cy, x2, y2) {
	const dx = 2 * (1 - t) * (cx - x1) + 2 * t * (x2 - cx);
	const dy = 2 * (1 - t) * (cy - y1) + 2 * t * (y2 - cy);
	return Math.atan2(dy, dx) * 180 / Math.PI;
}

function perpOffset(x1, y1, x2, y2, d) {
	const dx = x2 - x1, dy = y2 - y1;
	const len = Math.hypot(dx, dy) || 1;
	const nx = -dy / len * d, ny = dx / len * d;
	return { x1: x1 + nx, y1: y1 + ny, x2: x2 + nx, y2: y2 + ny };
}

function polyLen(pts) {
	let n = 0;
	for (let i = 1; i < pts.length; i++)
		n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
	return n;
}

function polyAt(pts, u) {
	const total = polyLen(pts) || 1;
	let dist = Math.max(0, Math.min(1, u)) * total;
	for (let i = 1; i < pts.length; i++) {
		const x1 = pts[i - 1].x, y1 = pts[i - 1].y, x2 = pts[i].x, y2 = pts[i].y;
		const seg = Math.hypot(x2 - x1, y2 - y1) || 1e-6;
		if (dist <= seg) {
			const t = dist / seg;
			return {
				x: x1 + (x2 - x1) * t,
				y: y1 + (y2 - y1) * t,
				ang: Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI
			};
		}
		dist -= seg;
	}
	const a = pts[pts.length - 2], b = pts[pts.length - 1];
	return { x: b.x, y: b.y, ang: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
}

function offsetPoly(pts, d) {
	const out = [];
	for (let i = 0; i < pts.length; i++) {
		let nx = 0, ny = 0, c = 0;
		if (i > 0) {
			const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
			const len = Math.hypot(dx, dy) || 1;
			nx += -dy / len;
			ny += dx / len;
			c++;
		}
		if (i + 1 < pts.length) {
			const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
			const len = Math.hypot(dx, dy) || 1;
			nx += -dy / len;
			ny += dx / len;
			c++;
		}
		c = c || 1;
		out.push({ x: pts[i].x + nx / c * d, y: pts[i].y + ny / c * d });
	}
	return out;
}

function polyPoints(pts) {
	return pts.map(p => p.x + ',' + p.y).join(' ');
}

function reversePts(pts) {
	return pts.slice().reverse();
}

function orthoHVH(x1, y1, x2, y2, mx) {
	const mid = mx != null ? mx : (x1 + x2) / 2;
	return [
		{ x: x1, y: y1 },
		{ x: mid, y: y1 },
		{ x: mid, y: y2 },
		{ x: x2, y: y2 }
	];
}

function polyMid(pts) {
	return polyAt(pts, 0.5);
}

function railsStraight(x1, y1, x2, y2, d) {
	const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
	const nx = -dy / len * d, ny = dx / len * d;
	return {
		a: [{ x: x1 + nx, y: y1 + ny }, { x: x2 + nx, y: y2 + ny }],
		b: [{ x: x1 - nx, y: y1 - ny }, { x: x2 - nx, y: y2 - ny }]
	};
}

function railsHVH(x1, y1, x2, y2, mx, d) {
	if (Math.abs(y1 - y2) < 1)
		return {
			a: [{ x: x1, y: y1 + d }, { x: x2, y: y2 + d }],
			b: [{ x: x1, y: y1 - d }, { x: x2, y: y2 - d }]
		};
	if (Math.abs(x1 - x2) < 1)
		return {
			a: [{ x: x1 + d, y: y1 }, { x: x2 + d, y: y2 }],
			b: [{ x: x1 - d, y: y1 }, { x: x2 - d, y: y2 }]
		};
	const mid = mx != null ? mx : (x1 + x2) / 2;
	const sy = y2 >= y1 ? 1 : -1;
	return {
		a: [
			{ x: x1, y: y1 + d },
			{ x: mid + d * sy, y: y1 + d },
			{ x: mid + d * sy, y: y2 + d },
			{ x: x2, y: y2 + d }
		],
		b: [
			{ x: x1, y: y1 - d },
			{ x: mid - d * sy, y: y1 - d },
			{ x: mid - d * sy, y: y2 - d },
			{ x: x2, y: y2 - d }
		]
	};
}

const ETH_PORT = 'M37.8,5.9l-1.9-4.1c-0.2-0.4-0.5-0.7-0.8-1c-0.5-0.2-0.9-0.3-1.3-0.3H16.1c-0.4,0-0.9,0.1-1.2,0.4c-0.4,0.2-0.7,0.6-0.8,1L12.2,6c-0.2,0.4-0.5,0.7-0.8,1c-0.4,0.2-0.8,0.4-1.2,0.4H3.3C2.7,7.2,2.1,7.5,1.7,7.9C1.2,8.3,1,8.9,1,9.5v27.7c0,0.6,0.2,1.2,0.7,1.6c0.4,0.4,1,0.7,1.6,0.7h43.4c0.6,0,1.2-0.2,1.6-0.7c0.4-0.4,0.7-1,0.7-1.6V9.5c0-0.3-0.1-0.6-0.2-0.9c-0.1-0.3-0.3-0.5-0.5-0.7c-0.2-0.2-0.5-0.4-0.7-0.5c-0.3-0.1-0.6-0.2-0.9-0.2h-6.9c-0.4,0-0.9-0.1-1.2-0.4C38.2,6.6,37.9,6.3,37.8,5.9z';

function nicFace(x, y, rot, s) {
	const rad = (Number(rot) || 0) * Math.PI / 180;
	const d = 20 * (s || 1);
	return { x: x + Math.sin(rad) * d, y: y + Math.cos(rad) * d };
}

function speedColor(mbps, up) {
	if (up === false)
		return '#F62528';
	const n = Number(mbps) || 0;
	if (n >= 8000)
		return '#007BFF';
	if (n >= 2000)
		return '#24C271';
	if (n >= 800)
		return '#3ECBEC';
	if (n >= 10)
		return '#FF9800';
	return 'rgba(51,51,51,0.55)';
}

function speedTag(mbps) {
	const n = Number(mbps) || 0;
	if (n >= 8000)
		return '10G';
	if (n >= 2000)
		return '2.5G';
	if (n >= 800)
		return '1G';
	if (n >= 80)
		return '100M';
	if (n > 0)
		return n + 'M';
	return '';
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
	return 2.6;
}

function flowPxPerSec(bps) {
	const kbps = Math.max(0, Number(bps) || 0) / 1e3;
	if (kbps < 0.05)
		return 0;
	const unit = bitrateParts(bps).unit;
	const step = unit === 'Tbps' ? 3 : (unit === 'Gbps' ? 2 : (unit === 'Mbps' ? 1 : 0));
	const inUnit = kbps / Math.pow(1000, step);
	return Math.min(14, 1.6 + step * 1.8 + 2.4 * Math.log10(1 + inUnit * 5));
}

function flowCount(bps) {
	const kbps = Math.max(0, Number(bps) || 0) / 1e3;
	if (kbps < 0.05)
		return 0;
	const unit = bitrateParts(bps).unit;
	if (unit === 'Tbps' || unit === 'Gbps')
		return 3;
	if (unit === 'Mbps')
		return 2;
	return 2;
}

function memPct(info) {
	const mem = (info && info.memory) || {};
	const total = Number(mem.total) || 0;
	const avail = Number(mem.available != null ? mem.available : mem.free) || 0;
	return total ? Math.round((Math.max(0, total - avail) / total) * 100) : 0;
}

return view.extend({
	title: null,
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
	snapGrid: true,
	posKey: 'lede-topo-pos-v1',
	fieldKey: 'lede-topo-fields-v2',
	snapKey: 'lede-topo-snap',
	linkKey: 'lede-topo-links-v6',
	lockKey: 'lede-topo-lock',
	links: {},
	layoutLock: false,

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
	loadSnap() {
		try {
			const v = localStorage.getItem(this.snapKey);
			this.snapGrid = v == null ? true : v !== '0';
		} catch (e) {
			this.snapGrid = true;
		}
	},
	saveSnap() {
		try { localStorage.setItem(this.snapKey, this.snapGrid ? '1' : '0'); } catch (e) {}
	},
	loadLock() {
		try {
			this.layoutLock = localStorage.getItem(this.lockKey) === '1';
		} catch (e) {
			this.layoutLock = false;
		}
	},
	saveLock() {
		try { localStorage.setItem(this.lockKey, this.layoutLock ? '1' : '0'); } catch (e) {}
	},
	loadLinks() { this.links = this.loadStore(this.linkKey, {}); },
	saveLinks() { this.saveStore(this.linkKey, this.links); },

	linkGeom(key, x1, y1, x2, y2) {
		const L = (this.links || {})[key] || {};
		return {
			x1: x1,
			y1: y1 + (L.ay != null && isFinite(L.ay) ? L.ay : 0),
			x2: x2,
			y2: y2 + (L.by != null && isFinite(L.by) ? L.by : 0),
			mx: L.mx != null && isFinite(L.mx) ? L.mx : (x1 + x2) / 2
		};
	},

	nicState(key, host, dx, dy, defRot) {
		const p = (this.pos || {})[key] || {};
		let x, y;
		if (p.rel && isFinite(p.x) && isFinite(p.y)) {
			x = host.x + p.x;
			y = host.y + p.y;
		} else if (isFinite(p.x) && isFinite(p.y)) {
			x = p.x;
			y = p.y;
		} else {
			x = host.x + dx;
			y = host.y + dy;
		}
		const rot = isFinite(p.rot) ? p.rot : defRot;
		const s = (p.s >= 0.4 && p.s <= 3) ? p.s : 1;
		const face = nicFace(x, y, rot, s);
		return { x, y, rot, s, jackX: face.x, jackY: face.y };
	},

	patchNic(key, patch) {
		this.pos = this.pos || {};
		const cur = Object.assign({ rel: 1 }, this.pos[key] || {}, patch);
		this.pos[key] = cur;
	},

	nodeScale(key) {
		const s = (this.pos[key] || {}).s;
		if (s >= 0.5 && s <= 2.8)
			return s;
		return 1;
	},

	nodeBox(key, kind, nlines) {
		const n = Math.max(1, nlines || 1);
		const tmpl = TOPO_TEMPLATE[key] || {};
		const defW = tmpl.w || (kind === 'router' ? 210 : (kind === 'switch' ? 228 : (kind === 'cloud' ? 96 : 158)));
		const defH = tmpl.h || (kind === 'router' ? 92 + n * 13 : (kind === 'cloud' ? 72 : 70 + n * 13));
		const p = (this.pos || {})[key] || {};
		const s = (p.s >= 0.5 && p.s <= 2.8) ? p.s : 1;
		let w = (p.w >= 70 && p.w <= 960) ? p.w : defW * s;
		let h = (p.h >= 48 && p.h <= 960) ? p.h : Math.max(defH, (kind === 'cloud' ? 72 : 70 + n * 13) * s);
		return { w: w, h: h };
	},

	patchPos(key, patch) {
		this.pos = this.pos || {};
		this.pos[key] = Object.assign({}, this.pos[key] || {}, patch);
	},

	topN() {
		const n = Number(this._topN);
		if (n >= 1 && n <= 20)
			return Math.floor(n);
		return 5;
	},

	loadTopN() {
		try {
			const v = Number(localStorage.getItem('lede-topo-topn'));
			this._topN = (v >= 1 && v <= 20) ? v : 5;
		} catch (e) {
			this._topN = 5;
		}
	},
	saveTopN() {
		try { localStorage.setItem('lede-topo-topn', String(this.topN())); } catch (e) {}
	},

	fieldStoreKey(key, kind) {
		if (kind === 'host' || (key && (key.indexOf('cli:') === 0 || key === 'cli-more' || key === 'cli-list')))
			return 'cli-list';
		return key;
	},

	shown(key, kind) {
		const store = this.fieldStoreKey(key, kind);
		if (this.fields && Object.prototype.hasOwnProperty.call(this.fields, store))
			return (this.fields[store] || []).slice();
		return (FIELD_DEFAULTS[kind] || []).slice();
	},

	hasField(key, kind, id) {
		return this.shown(key, kind).indexOf(id) >= 0;
	},

	toggleField(key, kind, id, on) {
		let cur = this.shown(key, kind);
		if (on && cur.indexOf(id) < 0)
			cur.push(id);
		if (!on)
			cur = cur.filter(x => x !== id);
		this.fields[this.fieldStoreKey(key, kind)] = cur;
		this.saveFields();
	},

	xy(key, x, y) {
		const p = (this.pos || {})[key];
		if (p && isFinite(p.x) && isFinite(p.y))
			return { x: p.x, y: p.y };
		const t = TOPO_TEMPLATE[key];
		if (t && isFinite(t.x) && isFinite(t.y))
			return { x: t.x, y: t.y };
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
		const arrow = function(id, color) {
			const m = svgEl('marker', {
				id: id, markerWidth: '8', markerHeight: '8',
				refX: '7', refY: '4', orient: 'auto', markerUnits: 'userSpaceOnUse'
			});
			m.appendChild(svgEl('polygon', {
				points: '0,1 8,4 0,7', fill: color
			}));
			return m;
		};
		const pcb = svgEl('linearGradient', { id: 'nic-pcb', x1: '0', y1: '0', x2: '0', y2: '1' });
		pcb.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#3d8a45' }));
		pcb.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#1f5a28' }));
		const metal = svgEl('linearGradient', { id: 'nic-metal', x1: '0', y1: '0', x2: '0', y2: '1' });
		metal.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#d9dee6' }));
		metal.appendChild(svgEl('stop', { offset: '45%', 'stop-color': '#8e96a3' }));
		metal.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#5c6570' }));
		const gold = svgEl('linearGradient', { id: 'nic-gold', x1: '0', y1: '0', x2: '0', y2: '1' });
		gold.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#f3d27a' }));
		gold.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#b8860b' }));
		const eth = svgEl('symbol', { id: 'eth-port', viewBox: '0 0 50 40' });
		eth.appendChild(svgEl('path', {
			d: ETH_PORT,
			fill: 'none',
			stroke: 'currentColor',
			'stroke-width': '2.2',
			'stroke-linejoin': 'round'
		}));
		return svgEl('defs', {}, [
			svgEl('filter', { id: 'topo-glow' }, [
				svgEl('feGaussianBlur', { stdDeviation: '1.6', result: 'b' }),
				svgEl('feMerge', {}, [
					svgEl('feMergeNode', { in: 'b' }),
					svgEl('feMergeNode', { in: 'SourceGraphic' })
				])
			]),
			svgEl('filter', { id: 'topo-current-glow', x: '-120%', y: '-120%', width: '340%', height: '340%' }, [
				svgEl('feGaussianBlur', { stdDeviation: '3.8', result: 'b' }),
				svgEl('feMerge', {}, [
					svgEl('feMergeNode', { in: 'b' }),
					svgEl('feMergeNode', { in: 'b' }),
					svgEl('feMergeNode', { in: 'b' }),
					svgEl('feMergeNode', { in: 'SourceGraphic' })
				])
			]),
			pcb, metal, gold, eth,
			arrow('topo-arrow-rx', COL_RX),
			arrow('topo-arrow-tx', COL_TX)
		]);
	},

	icon(kind, x, y, color, s) {
		s = (s > 0.2 && s < 8) ? s : 1;
		const g = svgEl('g', { transform: 'translate(' + x + ',' + y + ') scale(' + s + ')', fill: color, stroke: 'none' });
		if (kind === 'cloud') {
			g.appendChild(svgEl('ellipse', { cx: -10, cy: 4, rx: 16, ry: 11, opacity: '0.95' }));
			g.appendChild(svgEl('ellipse', { cx: 12, cy: 6, rx: 14, ry: 10 }));
			g.appendChild(svgEl('ellipse', { cx: 0, cy: -6, rx: 13, ry: 11 }));
		} else if (kind === 'wan') {
			g.appendChild(svgEl('rect', { x: -18, y: -8, width: 36, height: 16, rx: 4 }));
			g.appendChild(svgEl('circle', { cx: -8, cy: 0, r: 3, fill: '#fff' }));
			g.appendChild(svgEl('circle', { cx: 8, cy: 0, r: 3, fill: '#fff' }));
		} else if (kind === 'router') {
			g.appendChild(svgEl('rect', { x: -28, y: -12, width: 56, height: 26, rx: 3, fill: '#334155' }));
			g.appendChild(svgEl('rect', { x: -24, y: -8, width: 48, height: 18, rx: 2, fill: color }));
			g.appendChild(svgEl('rect', { x: -18, y: -20, width: 4, height: 10, rx: 1 }));
			g.appendChild(svgEl('rect', { x: 14, y: -20, width: 4, height: 10, rx: 1 }));
			g.appendChild(svgEl('rect', { x: -22, y: -4, width: 10, height: 8, rx: 1, fill: '#0f172a', opacity: '0.45' }));
			g.appendChild(svgEl('rect', { x: 12, y: -4, width: 10, height: 8, rx: 1, fill: '#0f172a', opacity: '0.45' }));
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

	addFlow(pts, bps, color, id) {
		this.flows.push({ pts: pts, bps: bps, color: color, id: id || '' });
	},

	linkEnds(key, x1, y1, x2, y2) {
		const L = (this.links || {})[key] || {};
		if (isFinite(L.x1) && isFinite(L.y1) && isFinite(L.x2) && isFinite(L.y2))
			return { x1: L.x1, y1: L.y1, x2: L.x2, y2: L.y2 };
		return { x1: x1, y1: y1, x2: x2, y2: y2 };
	},

	setLinkEnds(key, x1, y1, x2, y2) {
		this.links = this.links || {};
		this.links[key] = {
			x1: snapVal(x1, this.snapGrid),
			y1: snapVal(y1, this.snapGrid),
			x2: snapVal(x2, this.snapGrid),
			y2: snapVal(y2, this.snapGrid)
		};
	},

	drawPoly(layer, pts, color, width, opacity, marker) {
		layer.appendChild(svgEl('polyline', {
			points: polyPoints(pts),
			fill: 'none',
			stroke: color,
			'stroke-width': width,
			'stroke-linecap': 'round',
			'stroke-linejoin': 'miter',
			opacity: opacity,
			'marker-end': marker || ''
		}));
	},

	bindLineClick(layer, x1, y1, x2, y2, key, kind) {
		const self = this;
		const hit = svgEl('line', {
			x1: x1, y1: y1, x2: x2, y2: y2,
			stroke: 'transparent',
			'stroke-width': 18,
			'stroke-linecap': 'round',
			style: 'cursor:pointer'
		});
		hit.addEventListener('click', function(ev) {
			ev.stopPropagation();
			self.selected = key;
			self.selectedKind = kind;
			self.fillDetail();
			if (self.model)
				self.rebuild(document.getElementById('topo-svg'), self.model);
		});
		layer.appendChild(hit);
	},

	bindLineMove(layer, x1, y1, x2, y2, key, kind) {
		const self = this;
		const hit = svgEl('line', {
			x1: x1, y1: y1, x2: x2, y2: y2,
			stroke: 'transparent',
			'stroke-width': 18,
			'stroke-linecap': 'round',
			style: self.layoutLock ? 'cursor:pointer' : 'cursor:grab'
		});
		hit.addEventListener('click', function(ev) {
			ev.stopPropagation();
			if (self._didDrag) {
				self._didDrag = false;
				return;
			}
			self.selected = key;
			self.selectedKind = kind;
			self.fillDetail();
			if (self.model)
				self.rebuild(document.getElementById('topo-svg'), self.model);
		});
		hit.addEventListener('pointerdown', function(ev) {
			if (ev.button || self.layoutLock)
				return;
			ev.stopPropagation();
			ev.preventDefault();
			const svg = document.getElementById('topo-svg');
			if (!svg)
				return;
			self._didDrag = false;
			self._dragging = true;
			const p0 = self.clientToSvg(svg, ev.clientX, ev.clientY);
			try { hit.setPointerCapture(ev.pointerId); } catch (e) {}
			function move(e) {
				const p = self.clientToSvg(svg, e.clientX, e.clientY);
				self.setLinkEnds(key, x1 + p.x - p0.x, y1 + p.y - p0.y, x2 + p.x - p0.x, y2 + p.y - p0.y);
				self._didDrag = true;
				if (!self._dragRaf) {
					self._dragRaf = requestAnimationFrame(function() {
						self._dragRaf = 0;
						if (self.model)
							self.rebuild(svg, self.model);
					});
				}
			}
			function up() {
				window.removeEventListener('pointermove', move);
				window.removeEventListener('pointerup', up);
				self._dragging = false;
				if (self._didDrag)
					self.saveLinks();
			}
			window.addEventListener('pointermove', move);
			window.addEventListener('pointerup', up);
		});
		layer.appendChild(hit);
	},

	lineEndHandles(x1, y1, x2, y2, key, kind) {
		const dest = this._handleLayer;
		if (!dest || this.layoutLock)
			return;
		const self = this;
		[{ x: x1, y: y1, which: 'a' }, { x: x2, y: y2, which: 'b' }].forEach(ep => {
			const show = self._lineGrip === key;
			const el = svgEl('rect', {
				x: ep.x - 7, y: ep.y - 7, width: 14, height: 14, rx: 2,
				fill: show ? '#fff' : '#ffffff',
				'fill-opacity': show ? '1' : '0',
				stroke: show ? '#2563eb' : 'none',
				'stroke-width': show ? 1.6 : 0,
				style: 'cursor:move',
				'pointer-events': 'all'
			});
			el.addEventListener('pointerdown', function(ev) {
				if (ev.button || self.layoutLock)
					return;
				ev.stopPropagation();
				ev.preventDefault();
				const svg = document.getElementById('topo-svg');
				self.selected = key;
				self.selectedKind = kind;
				self._lineGrip = key;
				self._didDrag = false;
				self._dragging = true;
				try { el.setPointerCapture(ev.pointerId); } catch (e) {}
				function move(e) {
					const p = self.clientToSvg(svg, e.clientX, e.clientY);
					const x = snapVal(p.x, self.snapGrid);
					const y = snapVal(p.y, self.snapGrid);
					if (ep.which === 'a')
						self.setLinkEnds(key, x, y, x2, y2);
					else
						self.setLinkEnds(key, x1, y1, x, y);
					self._didDrag = true;
					if (!self._dragRaf) {
						self._dragRaf = requestAnimationFrame(function() {
							self._dragRaf = 0;
							if (self.model)
								self.rebuild(svg, self.model);
						});
					}
				}
				function up() {
					window.removeEventListener('pointermove', move);
					window.removeEventListener('pointerup', up);
					self._dragging = false;
					self._lineGrip = null;
					if (self._didDrag)
						self.saveLinks();
					if (self.model)
						self.rebuild(svg, self.model);
					self.fillDetail();
				}
				window.addEventListener('pointermove', move);
				window.addEventListener('pointerup', up);
			});
			dest.appendChild(el);
		});
	},

	drawPipe(layer, x1, y1, x2, y2, color, bps, live, key, kind, snap) {
		let e;
		if (snap) {
			e = { x1: x1, y1: y1, x2: x2, y2: y2 };
		} else {
			e = this.linkEnds(key, x1, y1, x2, y2);
		}
		const pts = [{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }];
		const sel = this.selected === key;
		this.drawPoly(layer, pts, color, 2.2 + (sel ? 1.4 : 0), live ? '0.32' : '0.5');
		if (snap)
			this.bindLineClick(layer, e.x1, e.y1, e.x2, e.y2, key, kind);
		else {
			this.bindLineMove(layer, e.x1, e.y1, e.x2, e.y2, key, kind);
			this.lineEndHandles(e.x1, e.y1, e.x2, e.y2, key, kind);
		}
		if (bps)
			this.addFlow(pts, bps, color, key);
		return polyMid(pts);
	},

	drawDuplex(layer, x1, y1, x2, y2, rx, tx, live, key, kind) {
		const e = this.linkEnds(key, x1, y1, x2, y2);
		const rails = railsStraight(e.x1, e.y1, e.x2, e.y2, 5);
		const down = rails.a;
		const up = reversePts(rails.b);
		const sel = this.selected === key ? 1.2 : 0;
		const op = live ? '0.32' : '0.5';
		this.drawPoly(layer, down, COL_RX, 2.2 + sel, op, 'url(#topo-arrow-rx)');
		this.drawPoly(layer, up, COL_TX, 2.2 + sel, op, 'url(#topo-arrow-tx)');
		this.bindLineMove(layer, e.x1, e.y1, e.x2, e.y2, key, kind);
		this.lineEndHandles(e.x1, e.y1, e.x2, e.y2, key, kind);
		this.addFlow(down, rx, COL_RX, key + ':rx');
		this.addFlow(up, tx, COL_TX, key + ':tx');
		return polyMid([{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }]);
	},

	drawNic(layer, st, bag, speed, up, key, kind, hostKey) {
		const color = speedColor(speed, up);
		const sel = this.selected === key;
		const x = st.x, y = st.y, rot = st.rot, s = st.s;
		bag = bag || {};
		const g = svgEl('g', {
			'class': 'topo-hit',
			'data-key': key,
			style: this.layoutLock ? 'cursor:pointer' : 'cursor:grab'
		});
		g.appendChild(svgEl('rect', {
			x: x - 30 * s, y: y - 26 * s, width: 60 * s, height: 52 * s, rx: 4,
			fill: '#ffffff', 'fill-opacity': '0', stroke: 'none',
			'pointer-events': 'all'
		}));
		const port = svgEl('g', {
			transform: 'translate(' + x + ',' + y + ') rotate(' + rot + ') scale(' + s + ')',
			fill: 'none',
			stroke: color,
			'stroke-width': (2.2 / s).toFixed(2),
			'stroke-linejoin': 'round'
		});
		port.appendChild(svgEl('path', { d: ETH_PORT, transform: 'translate(-25,-20)' }));
		g.appendChild(port);
		let labY = y + 22 * s + 12;
		this.shown(key, kind).forEach(id => {
			if (id === 'rate') {
				const m = this.rateMetrics(9);
				const left = x - m.width / 2;
				this.drawAlignedRate(g, left, labY, '↓', bag.rx, COL_RX, 9, key + ':rx');
				labY += 12;
				this.drawAlignedRate(g, left, labY, '↑', bag.tx, COL_TX, 9, key + ':tx');
				labY += 12;
				return;
			}
			let v = bag[id];
			if (id === 'name')
				v = trunc(bag.name || '', 8);
			if (v == null || v === '')
				return;
			g.appendChild(svgEl('text', {
				x: x, y: labY, 'text-anchor': 'middle',
				'font-size': id === 'name' ? 10 : 9,
				'font-weight': id === 'name' || id === 'status' ? 700 : 600,
				fill: (id === 'status' && up === false) ? color : 'currentColor'
			}, [String(v)]));
			labY += 12;
		});
		this.bindFollow(g, key, kind, hostKey);
		layer.appendChild(g);
		if (sel && !this.layoutLock)
			this.nicHandles(st, key, hostKey);
		return st;
	},

	nicHandles(st, key, hostKey) {
		const dest = this._handleLayer;
		if (!dest)
			return;
		const self = this;
		const hx = st.x - Math.sin(st.rot * Math.PI / 180) * (26 * st.s);
		const hy = st.y - Math.cos(st.rot * Math.PI / 180) * (26 * st.s);
		const rotH = svgEl('circle', {
			cx: hx, cy: hy, r: 6,
			fill: '#fff', stroke: '#2563eb', 'stroke-width': 1.6,
			style: 'cursor:grab'
		});
		rotH.addEventListener('pointerdown', function(ev) {
			if (ev.button || self.layoutLock)
				return;
			ev.stopPropagation();
			ev.preventDefault();
			const svg = document.getElementById('topo-svg');
			self._dragging = true;
			self._didDrag = false;
			try { rotH.setPointerCapture(ev.pointerId); } catch (e) {}
			function move(e) {
				const p = self.clientToSvg(svg, e.clientX, e.clientY);
				let ang = Math.atan2(p.x - st.x, p.y - st.y) * 180 / Math.PI;
				if (self.snapGrid)
					ang = Math.round(ang / 15) * 15;
				self.patchNic(key, { rot: ang });
				self._didDrag = true;
				if (!self._dragRaf) {
					self._dragRaf = requestAnimationFrame(function() {
						self._dragRaf = 0;
						if (self.model)
							self.rebuild(svg, self.model);
					});
				}
			}
			function up() {
				window.removeEventListener('pointermove', move);
				window.removeEventListener('pointerup', up);
				self._dragging = false;
				if (self._didDrag)
					self.savePos();
			}
			window.addEventListener('pointermove', move);
			window.addEventListener('pointerup', up);
		});
		const rad = (st.rot + 135) * Math.PI / 180;
		const reach = 28 * st.s;
		const sx = st.x + Math.sin(rad) * reach;
		const sy = st.y + Math.cos(rad) * reach;
		const scH = svgEl('circle', {
			cx: sx, cy: sy, r: 8,
			fill: '#fff', stroke: '#0f172a', 'stroke-width': 1.8,
			style: 'cursor:nwse-resize'
		});
		scH.addEventListener('pointerdown', function(ev) {
			if (ev.button || self.layoutLock)
				return;
			ev.stopPropagation();
			ev.preventDefault();
			const svg = document.getElementById('topo-svg');
			self._dragging = true;
			self._didDrag = false;
			const p0 = self.clientToSvg(svg, ev.clientX, ev.clientY);
			const d0 = Math.max(8, Math.hypot(p0.x - st.x, p0.y - st.y));
			const s0 = st.s || 1;
			try { scH.setPointerCapture(ev.pointerId); } catch (e) {}
			function move(e) {
				const p = self.clientToSvg(svg, e.clientX, e.clientY);
				let ns = s0 * Math.hypot(p.x - st.x, p.y - st.y) / d0;
				ns = Math.max(0.5, Math.min(2.8, ns));
				self.patchNic(key, { s: Math.round(ns * 20) / 20 });
				self._didDrag = true;
				if (!self._dragRaf) {
					self._dragRaf = requestAnimationFrame(function() {
						self._dragRaf = 0;
						if (self.model)
							self.rebuild(svg, self.model);
					});
				}
			}
			function up() {
				window.removeEventListener('pointermove', move);
				window.removeEventListener('pointerup', up);
				self._dragging = false;
				if (self._didDrag)
					self.savePos();
			}
			window.addEventListener('pointermove', move);
			window.addEventListener('pointerup', up);
		});
		dest.appendChild(rotH);
		dest.appendChild(scH);
	},

	bindFollow(g, key, kind, hostKey) {
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
			if (ev.button || self.layoutLock)
				return;
			ev.preventDefault();
			ev.stopPropagation();
			const svg = document.getElementById('topo-svg');
			if (!svg)
				return;
			self._didDrag = false;
			self._dragging = true;
			const start = self.clientToSvg(svg, ev.clientX, ev.clientY);
			const host = (self._nodes && self._nodes[hostKey]) || self.xy(hostKey, 0, 0);
			const cur = self.nicState(key, host, 0, 0, 0);
			const dx = start.x - cur.x, dy = start.y - cur.y;
			function move(e) {
				const p = self.clientToSvg(svg, e.clientX, e.clientY);
				const hx = (self._nodes && self._nodes[hostKey]) || host;
				self.patchNic(key, {
					rel: 1,
					x: snapVal(p.x - dx, self.snapGrid) - hx.x,
					y: snapVal(p.y - dy, self.snapGrid) - hx.y
				});
				self._didDrag = true;
				if (!self._dragRaf) {
					self._dragRaf = requestAnimationFrame(function() {
						self._dragRaf = 0;
						if (self.model)
							self.rebuild(svg, self.model);
					});
				}
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

	drawSpeedLegend(layer, x, y) {
		const items = [
			[100, true, '100M'],
			[1000, true, '1G'],
			[2500, true, '2.5G'],
			[10000, true, '10G'],
			[0, false, '离线']
		];
		items.forEach((it, i) => {
			const px = x + i * 58;
			const col = speedColor(it[0], it[1]);
			const g = svgEl('g', {
				transform: 'translate(' + px + ',' + (y + 8) + ') scale(0.42)',
				fill: 'none', stroke: col, 'stroke-width': '2.4', 'stroke-linejoin': 'round'
			});
			g.appendChild(svgEl('path', { d: ETH_PORT, transform: 'translate(-25,-20)' }));
			layer.appendChild(g);
			layer.appendChild(svgEl('text', {
				x: px + 16, y: y + 14,
				'font-size': 11, fill: 'currentColor'
			}, [it[2]]));
		});
	},

	rateMetrics(size) {
		const ch = size * 0.55;
		const glyph = size * 0.58;
		const arrowGap = 1;
		const num = RATE_NUM_W * ch;
		const gap = 2;
		const unit = RATE_UNIT_W * ch;
		return {
			size, ch, glyph, arrowGap, num, gap, unit,
			width: glyph + arrowGap + num + gap + unit
		};
	},

	rateTextAttrs(size, fill) {
		return {
			'font-size': size,
			'font-weight': 700,
			'font-family': RATE_FONT,
			'font-variant-numeric': 'tabular-nums lining-nums',
			fill: fill,
			stroke: 'var(--background-color-high, #ffffff)',
			'stroke-width': 3,
			'stroke-linejoin': 'round',
			'paint-order': 'stroke fill'
		};
	},

	drawAlignedRate(layer, left, y, arrow, bps, fill, size, tag) {
		const m = this.rateMetrics(size);
		const p = bitrateParts(bps);
		const unitStr = padFig(p.unit, RATE_UNIT_W, 'end');
		const numX = left + m.glyph + m.arrowGap;
		layer.appendChild(svgEl('text', Object.assign(this.rateTextAttrs(size, fill), {
			x: left, y: y, 'text-anchor': 'start'
		}), [arrow]));
		const numEl = svgEl('text', Object.assign(this.rateTextAttrs(size, fill), {
			x: numX, y: y, 'text-anchor': 'start'
		}), [p.num]);
		const unitEl = svgEl('text', Object.assign(this.rateTextAttrs(size, fill), {
			x: numX + m.num + m.gap, y: y, 'text-anchor': 'start'
		}), [unitStr]);
		if (tag) {
			numEl.setAttribute('data-rate-num', tag);
			unitEl.setAttribute('data-rate-unit', tag);
		}
		layer.appendChild(numEl);
		layer.appendChild(unitEl);
	},

	drawRateStack(layer, cx, yUp, yDown, tx, rx, size, prefix) {
		const left = cx - this.rateMetrics(size).width / 2;
		this.drawAlignedRate(layer, left, yUp, '↑', tx, COL_TX, size, prefix ? prefix + ':tx' : '');
		this.drawAlignedRate(layer, left, yDown, '↓', rx, COL_RX, size, prefix ? prefix + ':rx' : '');
	},

	strokeLabel(layer, x, y, txt, fill, size) {
		layer.appendChild(svgEl('text', {
			x: x, y: y, 'text-anchor': 'middle',
			'font-size': size || 11, 'font-weight': 700, fill: fill,
			stroke: 'var(--background-color-high, #ffffff)',
			'stroke-width': 4, 'stroke-linejoin': 'round',
			'paint-order': 'stroke fill'
		}, [txt]));
	},

	decorateLink(layer, mid, key, kind, bag) {
		if (!mid)
			return;
		bag = bag || {};
		const extras = [];
		let wantRate = false;
		this.shown(key, kind).forEach(id => {
			if (id === 'rate') {
				wantRate = true;
				return;
			}
			const v = bag[id];
			if (v == null || v === '')
				return;
			extras.push(String(v));
		});
		extras.forEach((t, i) => {
			this.strokeLabel(layer, mid.x,
				mid.y - 10 - (wantRate ? 14 : 0) - (extras.length - 1 - i) * 13,
				t, 'currentColor');
		});
		if (wantRate)
			this.drawRateStack(layer, mid.x, mid.y - 10, mid.y + 16, bag.tx, bag.rx, 11, key);
	},

	drawWanSum(layer, x, y, tx, rx) {
		const key = 'wan-sum';
		const kind = 'wan_sum';
		const p = this.xy(key, x, y);
		const sel = this.selected === key;
		const ids = this.shown(key, kind);
		const showTitle = ids.indexOf('title') >= 0 || !ids.length;
		const showRate = ids.indexOf('rate') >= 0;
		const muted = !ids.length;
		const g = svgEl('g', {
			'class': 'topo-hit',
			'data-key': key,
			style: this.layoutLock ? 'cursor:pointer' : 'cursor:grab'
		});
		const rw = showRate ? this.rateMetrics(12).width : 0;
		const boxW = Math.max(124, rw + 24);
		const boxH = showRate && showTitle ? 58 : 48;
		g.appendChild(svgEl('rect', {
			x: p.x - boxW / 2, y: p.y - 32, width: boxW, height: boxH, rx: 6,
			fill: '#ffffff', 'fill-opacity': sel ? '0.35' : '0',
			stroke: sel ? '#2563eb' : (muted ? '#94a3b8' : 'none'),
			'stroke-width': sel ? 1.4 : (muted ? 1 : 0),
			'stroke-dasharray': muted ? '3 3' : null,
			'pointer-events': 'all'
		}));
		let yOff = showRate ? -16 : -2;
		if (showTitle)
			g.appendChild(svgEl('text', {
				x: p.x, y: p.y + yOff, 'text-anchor': 'middle',
				'font-size': 11, 'font-weight': 750,
				fill: muted ? '#94a3b8' : 'currentColor',
				stroke: 'var(--background-color-high, #ffffff)',
				'stroke-width': 4, 'stroke-linejoin': 'round',
				'paint-order': 'stroke fill'
			}, ['总带宽']));
		if (showRate)
			this.drawRateStack(g, p.x, p.y + 2, p.y + 18, tx, rx, 12, 'wan-sum');
		this.bindFloat(g, key, kind);
		layer.appendChild(g);
	},

	bindFloat(g, key, kind) {
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
			if (ev.button || self.layoutLock)
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
				self.patchPos(key, {
					x: snapVal(p.x - dx, self.snapGrid),
					y: snapVal(p.y - dy, self.snapGrid)
				});
				self._didDrag = true;
				if (!self._dragRaf) {
					self._dragRaf = requestAnimationFrame(function() {
						self._dragRaf = 0;
						if (self.model)
							self.rebuild(svg, self.model);
					});
				}
			}
			function up() {
				window.removeEventListener('pointermove', move);
				window.removeEventListener('pointerup', up);
				self._dragging = false;
				if (self._didDrag)
					self.savePos();
			}
			window.addEventListener('pointermove', move);
			window.addEventListener('pointerup', up);
		});
	},

	device(layer, x, y, kind, title, lines, tone, key, fieldKind) {
		const color = healthColor(tone || 'ok');
		const sel = this.selected === key;
		const fk = fieldKind || kind;
		const cat = FIELD_CATALOG[fk] || [];
		const hasTitleField = cat.some(f => f.id === 'title');
		const bare = key === 'internet' || kind === 'cloud';
		const drawTitle = hasTitleField ? this.hasField(key, fk, 'title') : !bare;
		const nln = (lines || []).length;
		const n = Math.max(1, nln + (drawTitle ? 1 : 0));
		const box = this.nodeBox(key || title, kind, n);
		const w = box.w, h = box.h;
		const g = svgEl('g', {
			'class': 'topo-hit',
			'data-key': key || title,
			style: this.layoutLock ? 'cursor:pointer' : 'cursor:grab'
		});
		const s = bare ? Math.max(0.5, Math.min(w / 96, h / 72)) : 1;
		const iconH = (kind === 'router' ? 34 : (kind === 'cloud' ? 26 : 22)) * s;
		const gapIconTitle = drawTitle ? 8 * s : 0;
		const gapTitleLines = nln ? 6 * s : 0;
		const titleSize = 13 * s;
		const lineSize = 10 * s;
		const lineGap = 13 * s;
		const contentH = iconH + gapIconTitle + (drawTitle ? titleSize : 0) + gapTitleLines + nln * lineGap;
		const top = y - contentH / 2;
		const iconY = top + iconH / 2;
		const titleY = top + iconH + gapIconTitle + titleSize * 0.82;
		const linesBase = drawTitle ? titleY : (top + iconH);
		if (bare) {
			const hitW = Math.max(52 * s, 64);
			const hitH = contentH + 10;
			g.appendChild(svgEl('rect', {
				x: x - hitW / 2, y: top - 5, width: hitW, height: hitH, rx: 4,
				fill: '#ffffff', 'fill-opacity': '0', stroke: 'none',
				'pointer-events': 'all'
			}));
		} else {
			g.appendChild(svgEl('rect', {
				x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 12,
				fill: 'var(--background-color-high, #fff)',
				stroke: color,
				'stroke-width': (sel ? 4 : 2.4)
			}));
		}
		g.appendChild(this.icon(kind, x, iconY, color, s));
		if (drawTitle)
			g.appendChild(svgEl('text', {
				x: x, y: titleY, 'text-anchor': 'middle',
				'font-size': titleSize, 'font-weight': 750, fill: 'currentColor'
			}, [title]));
		(lines || []).forEach((ln, i) => {
			g.appendChild(svgEl('text', {
				x: x, y: linesBase + gapTitleLines + (i + 1) * lineGap - 2,
				'text-anchor': 'middle',
				'font-size': lineSize, fill: 'currentColor', opacity: '0.72'
			}, [ln]));
		});
		this.bindNode(g, key || title, fieldKind || kind);
		layer.appendChild(g);
		this._nodes = this._nodes || {};
		this._nodes[key || title] = { x: x, y: y, w: w, h: h };
		if (sel && !this.layoutLock && (key === 'internet' || key === 'gateway' || key === 'switch')) {
			if (bare) {
				const hitW = Math.max(52 * s, 64);
				this.nodeResizeHandles(key, x, y, hitW, contentH + 10);
			} else {
				this.nodeResizeHandles(key, x, y, w, h);
			}
		}
		return this._nodes[key || title];
	},

	clientLayout(list) {
		const shown = this.shown('cli-list', 'host');
		const size = 11;
		const ch = size * 0.52;
		const gap = 2;
		const cols = [];
		let x = 0;
		['name', 'ip', 'mac', 'rate', 'online'].forEach(id => {
			if (shown.indexOf(id) < 0)
				return;
			if (id === 'name') {
				let n = 3;
				(list || []).forEach(c => {
					n = Math.max(n, (clientHostname(c) || '').length);
				});
				n = Math.min(10, n);
				cols.push({ id: 'name', x, w: n * ch });
				x += n * ch + gap;
			} else if (id === 'ip') {
				let n = 7;
				(list || []).forEach(c => {
					n = Math.max(n, (c.ip || '').length);
				});
				n = Math.min(15, n);
				cols.push({ id: 'ip', x, w: n * ch });
				x += n * ch + gap;
			} else if (id === 'mac') {
				let n = 11;
				(list || []).forEach(c => {
					n = Math.max(n, (c.mac || '').length);
				});
				n = Math.min(17, n);
				cols.push({ id: 'mac', x, w: n * ch });
				x += n * ch + gap;
			} else if (id === 'online') {
				cols.push({ id: 'online', x, w: 4 * ch });
				x += 4 * ch + gap;
			} else if (id === 'rate') {
				x += 8;
				const rw = this.rateMetrics(size).width;
				cols.push({ id: 'rx', x, w: rw });
				x += rw + 4;
				cols.push({ id: 'tx', x, w: rw });
				x += rw + gap;
			}
		});
		return { cols, width: Math.max(64, x), size };
	},

	drawClient(layer, x, y, c, key, stackIndex, stackCount, layout, summary) {
		layout = layout || this.clientLayout([c]);
		const w = layout.width;
		const h = 18;
		const g = svgEl('g', {
			'class': 'topo-hit',
			'data-key': key,
			style: this.layoutLock ? 'cursor:pointer' : 'cursor:grab'
		});
		g.appendChild(svgEl('rect', {
			x: x, y: y - h / 2, width: w, height: h, rx: 2,
			fill: '#ffffff', 'fill-opacity': '0', stroke: 'none',
			'pointer-events': 'all'
		}));
		const base = {
			y: y + 4,
			'font-size': layout.size,
			'font-weight': 650,
			'font-family': RATE_FONT,
			'font-variant-numeric': 'tabular-nums lining-nums',
			fill: c.online === false ? '#94a3b8' : 'currentColor'
		};
		if (summary) {
			g.appendChild(svgEl('text', Object.assign({}, base, {
				x: x + 2, 'text-anchor': 'start'
			}), [c.ip || '']));
		} else {
			layout.cols.forEach(col => {
				if (col.id === 'rx') {
					this.drawAlignedRate(g, x + col.x, y + 4, '↓', c.rx, COL_RX, layout.size, key + ':rx');
					return;
				}
				if (col.id === 'tx') {
					this.drawAlignedRate(g, x + col.x, y + 4, '↑', c.tx, COL_TX, layout.size, key + ':tx');
					return;
				}
				let txt = '';
				if (col.id === 'name')
					txt = trunc(clientHostname(c) || '—', Math.max(1, Math.floor(col.w / (layout.size * 0.6))));
				else if (col.id === 'ip')
					txt = c.ip || '—';
				else if (col.id === 'mac')
					txt = c.mac || '—';
				else if (col.id === 'online')
					txt = c.online === false ? '离线' : '在线';
				g.appendChild(svgEl('text', Object.assign({}, base, {
					x: x + col.x, 'text-anchor': 'start'
				}), [txt]));
			});
		}
		this.bindClientStack(g, key, stackIndex, stackCount);
		layer.appendChild(g);
		this._nodes = this._nodes || {};
		this._nodes[key] = { x: x, y: y, w: w, h: h };
		return this._nodes[key];
	},

	bindClientStack(g, key, index, count) {
		const self = this;
		const pitch = CLI_PITCH;
		g.addEventListener('click', function(ev) {
			if (self._didDrag) {
				self._didDrag = false;
				ev.stopPropagation();
				return;
			}
			ev.stopPropagation();
			self.selected = key;
			self.selectedKind = 'host';
			self.fillDetail();
			if (self.model)
				self.rebuild(document.getElementById('topo-svg'), self.model);
		});
		g.addEventListener('pointerdown', function(ev) {
			if (ev.button || self.layoutLock)
				return;
			ev.preventDefault();
			ev.stopPropagation();
			const svg = document.getElementById('topo-svg');
			if (!svg)
				return;
			self._didDrag = false;
			self._dragging = true;
			const start = self.clientToSvg(svg, ev.clientX, ev.clientY);
			const n = Math.max(1, count || 1);
			const origin = self.xy('cli-stack', start.x, start.y);
			const firstY = origin.y - ((n - 1) * pitch) / 2;
			const thisY = firstY + (index || 0) * pitch;
			const dx = start.x - origin.x;
			const dy = start.y - thisY;
			function move(e) {
				const p = self.clientToSvg(svg, e.clientX, e.clientY);
				const newFirstY = p.y - dy - (index || 0) * pitch;
				const newCenterY = newFirstY + ((n - 1) * pitch) / 2;
				self.patchPos('cli-stack', {
					x: snapVal(p.x - dx, self.snapGrid),
					y: snapVal(newCenterY, self.snapGrid)
				});
				self._didDrag = true;
				if (!self._dragRaf) {
					self._dragRaf = requestAnimationFrame(function() {
						self._dragRaf = 0;
						if (self.model)
							self.rebuild(svg, self.model);
					});
				}
			}
			function up() {
				window.removeEventListener('pointermove', move);
				window.removeEventListener('pointerup', up);
				self._dragging = false;
				if (self._didDrag)
					self.savePos();
			}
			window.addEventListener('pointermove', move);
			window.addEventListener('pointerup', up);
		});
	},

	nodeResizeHandles(key, x, y, w, h) {
		const dest = this._handleLayer;
		if (!dest)
			return;
		const self = this;
		const specs = [
			{ dx: -1, dy: -1, cur: 'nwse-resize' },
			{ dx: 0, dy: -1, cur: 'ns-resize' },
			{ dx: 1, dy: -1, cur: 'nesw-resize' },
			{ dx: 1, dy: 0, cur: 'ew-resize' },
			{ dx: 1, dy: 1, cur: 'nwse-resize' },
			{ dx: 0, dy: 1, cur: 'ns-resize' },
			{ dx: -1, dy: 1, cur: 'nesw-resize' },
			{ dx: -1, dy: 0, cur: 'ew-resize' }
		];
		specs.forEach(sp => {
			const hx = x + sp.dx * w / 2;
			const hy = y + sp.dy * h / 2;
			const el = svgEl('rect', {
				x: hx - 5, y: hy - 5, width: 10, height: 10, rx: 1,
				fill: '#fff', stroke: '#0f172a', 'stroke-width': 1.5,
				style: 'cursor:' + sp.cur
			});
			el.addEventListener('pointerdown', function(ev) {
				if (ev.button || self.layoutLock)
					return;
				ev.stopPropagation();
				ev.preventDefault();
				const svg = document.getElementById('topo-svg');
				self._dragging = true;
				self._didDrag = false;
				const left0 = x - w / 2, right0 = x + w / 2;
				const top0 = y - h / 2, bot0 = y + h / 2;
				try { el.setPointerCapture(ev.pointerId); } catch (e) {}
				function move(e) {
					const p = self.clientToSvg(svg, e.clientX, e.clientY);
					let L = left0, R = right0, T = top0, B = bot0;
					if (sp.dx < 0)
						L = snapVal(p.x, self.snapGrid);
					if (sp.dx > 0)
						R = snapVal(p.x, self.snapGrid);
					if (sp.dy < 0)
						T = snapVal(p.y, self.snapGrid);
					if (sp.dy > 0)
						B = snapVal(p.y, self.snapGrid);
					if (R - L < 70) {
						if (sp.dx < 0)
							L = R - 70;
						else
							R = L + 70;
					}
					if (B - T < 48) {
						if (sp.dy < 0)
							T = B - 48;
						else
							B = T + 48;
					}
					self.patchPos(key, {
						x: (L + R) / 2,
						y: (T + B) / 2,
						w: R - L,
						h: B - T
					});
					self._didDrag = true;
					if (!self._dragRaf) {
						self._dragRaf = requestAnimationFrame(function() {
							self._dragRaf = 0;
							if (self.model)
								self.rebuild(svg, self.model);
						});
					}
				}
				function up() {
					window.removeEventListener('pointermove', move);
					window.removeEventListener('pointerup', up);
					self._dragging = false;
					if (self._didDrag)
						self.savePos();
				}
				window.addEventListener('pointermove', move);
				window.addEventListener('pointerup', up);
			});
			dest.appendChild(el);
		});
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
			if (ev.button || self.layoutLock)
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
				self.patchPos(key, {
					x: snapVal(p.x - dx, self.snapGrid),
					y: snapVal(p.y - dy, self.snapGrid)
				});
				self._didDrag = true;
				if (!self._dragRaf) {
					self._dragRaf = requestAnimationFrame(function() {
						self._dragRaf = 0;
						if (self.model)
							self.rebuild(svg, self.model);
					});
				}
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
		const active = [];
		(this.flows || []).forEach(f => {
			if (!f.pts || f.pts.length < 2)
				return;
			const px = flowPxPerSec(f.bps);
			if (!px)
				return;
			active.push({ pts: f.pts, attr: polyPoints(f.pts), color: f.color, px: px });
		});
		const sig = active.map(a => a.attr + '\t' + a.color).join('\n');
		if (this._flowSig !== sig || !this._flowEls || this._flowEls.length !== active.length) {
			this._flowSig = sig;
			while (layer.firstChild)
				layer.removeChild(layer.firstChild);
			this._flowEls = active.map(a => {
				const base = {
					points: a.attr,
					fill: 'none',
					'stroke-linecap': 'round',
					'stroke-linejoin': 'round',
					'pointer-events': 'none'
				};
				const glow = svgEl('polyline', Object.assign({}, base, {
					stroke: a.color,
					'stroke-width': '6.4',
					'stroke-dasharray': '18 16',
					opacity: '0.42',
					filter: 'url(#topo-current-glow)'
				}));
				const main = svgEl('polyline', Object.assign({}, base, {
					stroke: a.color,
					'stroke-width': '5',
					'stroke-dasharray': '18 16',
					opacity: '1'
				}));
				const white = svgEl('polyline', Object.assign({}, base, {
					stroke: '#ffffff',
					'stroke-width': '2.8',
					'stroke-dasharray': '12 22',
					opacity: '0.95'
				}));
				const bead = svgEl('circle', {
					r: '4.2',
					fill: '#ffffff',
					stroke: a.color,
					'stroke-width': '1.6',
					opacity: '0.95',
					'pointer-events': 'none'
				});
				layer.appendChild(glow);
				layer.appendChild(main);
				layer.appendChild(white);
				layer.appendChild(bead);
				return { glow: glow, main: main, white: white, bead: bead, px: a.px, pts: a.pts };
			});
		} else {
			this._flowEls.forEach((el, i) => {
				el.px = active[i].px;
				el.pts = active[i].pts;
			});
		}
		this._flowEls.forEach(el => {
			const off = -(t * el.px);
			el.glow.setAttribute('stroke-dashoffset', String(off));
			el.main.setAttribute('stroke-dashoffset', String(off));
			el.white.setAttribute('stroke-dashoffset', String(off));
			const len = Math.max(polyLen(el.pts), 1);
			const u = ((t * el.px / len) % 1 + 1) % 1;
			const p = polyAt(el.pts, u);
			el.bead.setAttribute('cx', p.x);
			el.bead.setAttribute('cy', p.y);
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
		const prev = this.prev;
		const clients = (snap.clients || []).slice().map(c => {
			const pc = (prev && prev.clients || []).find(x => (c.mac && x.mac === c.mac) || (c.ip && x.ip === c.ip));
			const rx = rateOf(pc && { ts: prev.ts, rx_bytes: pc.rx_bytes },
				{ ts: snap.ts, rx_bytes: c.rx_bytes }, 'rx_bytes');
			const tx = rateOf(pc && { ts: prev.ts, tx_bytes: pc.tx_bytes },
				{ ts: snap.ts, tx_bytes: c.tx_bytes }, 'tx_bytes');
			return Object.assign({}, c, { rx, tx });
		}).sort((a, b) => (b.rx + b.tx) - (a.rx + a.tx) || (b.online ? 1 : 0) - (a.online ? 1 : 0));
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
			return '运营商';
		if (key === 'wan-sum')
			return 'WAN 总带宽';
		if (key === 'gateway')
			return (this.board && this.board.hostname) || '网关';
		if (key === 'switch')
			return '核心交换机';
		if (key && key.indexOf('nic:') === 0)
			return key.slice(4);
		if (key && key.indexOf('wan:') === 0)
			return key.slice(4);
		if (key && key.indexOf('cli:') === 0) {
			const id = key.slice(4);
			const c = (this.model.clients || []).find(x => x.mac === id || x.ip === id);
			return (c && (clientHostname(c) || c.ip)) || '终端';
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
			facts.push('运营商侧。线段两端可单独拖；线段与设备位置互不影响。');
		else if (key === 'wan-sum') {
			let wanRx = 0, wanTx = 0;
			(m.wans || []).forEach(r => { wanRx += r.rx; wanTx += r.tx; });
			facts.push('全部 WAN 口总带宽：↑ ' + fmtBitrate(wanTx) + '　↓ ' + fmtBitrate(wanRx));
			facts.push('可拖动调整显示位置，不跟运营商图标绑在一起。');
			facts.push('取消全部勾选后仍会留下「总带宽」占位，点它可再勾选要显示的内容。');
		}
		else if (key === 'gateway') {
			const rel = (this.board && this.board.release) || {};
			facts.push((rel.description || rel.version || '') + ' · LAN ' + (m.lan.ipv4 || '') + ' · ' + (m.lan.device || ''));
			facts.push('CPU ' + (m.sys.cpu_pct || 0) + '% · 温度 ' + (m.sys.temp_c || '—') + '℃ · 连接 ' + (m.sys.conn || 0));
			(m.wans || []).forEach(r => {
				facts.push(r.w.name + ' · ' + protoLabel(r.w.proto) + ' · ' + (r.w.ipv4 || '无地址') +
					' · ' + r.text + ' · ↓ ' + fmtBitrate(r.rx) + ' ↑ ' + fmtBitrate(r.tx));
			});
		} else if (key === 'switch') {
			facts.push('网关 LAN 口合计，不是交换机每个物理口。');
			facts.push('↓ ' + fmtBitrate(m.lanTx) + '　↑ ' + fmtBitrate(m.lanRx));
		} else if (key.indexOf('nic:') === 0) {
			const name = key.slice(4);
			if (name === 'lan') {
				facts.push('网关 LAN 口');
				facts.push('↓ ' + fmtBitrate(m.lanTx) + '　↑ ' + fmtBitrate(m.lanRx));
			} else {
				const row = m.wans.find(r => r.w.name === name);
				if (row) {
					facts.push('网关网卡 ' + row.w.name + (row.w.speed ? ' · ' + speedTag(row.w.speed) : ''));
					facts.push(row.text + ' · ' + protoLabel(row.w.proto) + ' · ' + (row.w.ipv4 || '无地址'));
					facts.push('↓ ' + fmtBitrate(row.rx) + '　↑ ' + fmtBitrate(row.tx) + ' · 延迟 ' + fmtLatency(row.w.latency));
				}
			}
		} else if (key.indexOf('wan:') === 0) {
			const row = m.wans.find(r => r.w.name === key.slice(4));
			if (row) {
				facts.push(row.text + ' · ' + protoLabel(row.w.proto) + ' · ' + (row.w.ipv4 || '无地址'));
				facts.push('↓ ' + fmtBitrate(row.rx) + '　↑ ' + fmtBitrate(row.tx) + ' · 延迟 ' + fmtLatency(row.w.latency));
			}
		} else if (key.indexOf('cli:') === 0) {
			const id = key.slice(4);
			const c = m.clients.find(x => x.mac === id || x.ip === id);
			if (c)
				facts.push((c.online ? '在线' : '离线') + ' · ' + (c.ip || '') + ' · ' + (c.mac || ''));
			if (c && clientHostname(c))
				facts.push('名称 ' + clientHostname(c));
			if (c)
				facts.push('↓ ' + fmtBitrate(c.rx) + '　↑ ' + fmtBitrate(c.tx));
			facts.push('下方「图上显示」对全部客户端列表同时生效。');
		} else if (key.indexOf('link:inet:') === 0) {
			const row = m.wans.find(r => r.w.name === key.slice(10));
			if (row) {
				facts.push('网关 WAN 口 ' + row.w.name + '（不是独立设备）');
				facts.push(row.text + ' · ' + protoLabel(row.w.proto) + ' · ' + (row.w.ipv4 || '无地址'));
				facts.push('↓ ' + fmtBitrate(row.rx) + '　↑ ' + fmtBitrate(row.tx) + ' · 延迟 ' + fmtLatency(row.w.latency));
			}
		} else if (kind && kind.indexOf('link_') === 0)
			facts.push('两点直线。蓝点拖两端，中段可整段平移。移动设备不会带动线段。');

		box.appendChild(E('h4', {}, this.entityTitle(key, kind)));
		facts.forEach(t => box.appendChild(E('p', {}, t)));
		if (this.layoutLock)
			box.appendChild(E('p', {}, '布局已锁定，不能拖动或改网卡方向/大小。'));
		if (!this.layoutLock && (key === 'internet' || key === 'gateway' || key === 'switch')) {
			box.appendChild(E('p', { 'class': 'topo-edit-lab' }, '大小'));
			box.appendChild(E('p', {}, '选中后拖四边、四角：左右改宽、上下改高，对边不动。'));
		}

		if (key === 'switch') {
			box.appendChild(E('p', { 'class': 'topo-edit-lab' }, '客户端排行（综合速率）'));
			const num = E('input', {
				'type': 'number', min: '1', max: '20', step: '1',
				value: String(this.topN()),
				style: 'width:4.5em'
			});
			num.addEventListener('change', L.bind(function() {
				let n = Number(num.value);
				if (!(n >= 1))
					n = 1;
				if (n > 20)
					n = 20;
				this._topN = n;
				this.saveTopN();
				this.rebuild(document.getElementById('topo-svg'), this.model);
				this.fillDetail();
			}, this));
			box.appendChild(E('label', { 'class': 'topo-opt' }, ['显示前 ', num, ' 名']));
		}

		if (key.indexOf('nic:') === 0 && !this.layoutLock) {
			box.appendChild(E('p', { 'class': 'topo-edit-lab' }, '网卡方向 / 大小（也可拖蓝点旋转、拖角缩放）'));
			const dirs = E('div', { 'class': 'topo-edit' });
			[['朝左', -90], ['朝下', 0], ['朝右', 90], ['朝上', 180]].forEach(pair => {
				dirs.appendChild(E('button', {
					'class': 'btn',
					'click': L.bind(function(ev) {
						ev.preventDefault();
						this.patchNic(key, { rot: pair[1] });
						this.savePos();
						this.rebuild(document.getElementById('topo-svg'), this.model);
					}, this)
				}, pair[0]));
			});
			box.appendChild(dirs);
			const szRow = E('div', { 'class': 'topo-edit' });
			szRow.appendChild(E('button', {
				'class': 'btn',
				'click': L.bind(function(ev) {
					ev.preventDefault();
					const s = Math.max(0.5, ((this.pos[key] || {}).s || 1) - 0.15);
					this.patchNic(key, { s: Math.round(s * 20) / 20 });
					this.savePos();
					this.rebuild(document.getElementById('topo-svg'), this.model);
					this.fillDetail();
				}, this)
			}, '缩小'));
			szRow.appendChild(E('button', {
				'class': 'btn',
				'click': L.bind(function(ev) {
					ev.preventDefault();
					const s = Math.min(2.8, ((this.pos[key] || {}).s || 1) + 0.15);
					this.patchNic(key, { s: Math.round(s * 20) / 20 });
					this.savePos();
					this.rebuild(document.getElementById('topo-svg'), this.model);
					this.fillDetail();
				}, this)
			}, '放大'));
			box.appendChild(szRow);
		}

		const cat = FIELD_CATALOG[kind] || [];
		if (cat.length) {
			const lab = kind === 'host'
				? '图上显示（对全部客户端生效）'
				: '图上显示（只改当前选中的这一项）';
			box.appendChild(E('p', { 'class': 'topo-edit-lab' }, lab));
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
				self.selected = 'cli:' + (c.mac || c.ip);
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
		const host = (this.board && this.board.hostname) || '网关';
		const shown = m.clients.slice(0, 12);
		const extra = Math.max(0, m.clients.length - shown.length);
		const wanN = Math.max(1, m.wans.length);
		const rightN = Math.max(1, shown.length + (extra ? 1 : 0));
		const W = TOPO_CANVAS.w;
		const H = Math.max(TOPO_CANVAS.h,
			200 + Math.max((wanN - 1) * 52, (rightN - 1) * CLI_PITCH));
		svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

		while (svg.firstChild)
			svg.removeChild(svg.firstChild);
		svg.appendChild(this.defs());
		const pipes = svgEl('g', { id: 'topo-pipes' });
		const packets = svgEl('g', { id: 'topo-packets' });
		const nodes = svgEl('g', { id: 'topo-nodes' });
		const nics = svgEl('g', { id: 'topo-nics' });
		const labels = svgEl('g', { id: 'topo-labels' });
		this._handleLayer = svgEl('g', { id: 'topo-handles' });
		svg.appendChild(pipes);
		svg.appendChild(packets);
		svg.appendChild(nodes);
		svg.appendChild(nics);
		svg.appendChild(labels);
		svg.appendChild(this._handleLayer);
		this._nicLayer = nics;
		this._flowSig = '';
		this._flowEls = [];
		this.drawSpeedLegend(labels, 980, 22);

		this.flows = [];
		this._nodes = {};
		const T = TOPO_TEMPLATE;
		const inet = this.xy('internet', T.internet.x, T.internet.y);
		const gw = this.xy('gateway', T.gateway.x, T.gateway.y);
		const sw = this.xy('switch', T.switch.x, T.switch.y);

		this.device(nodes, inet.x, inet.y, 'cloud', '运营商',
			this.pick('internet', 'internet', { hint: 'Internet' }),
			'ok', 'internet', 'internet');

		const wanOk = m.wans.filter(r => r.health === 'ok').length;
		const gwTone = !m.wans.length ? 'warn' : (wanOk ? 'ok' : 'bad');
		const gwBox = this.device(nodes, gw.x, gw.y, 'router', trunc(host, 12), this.pick('gateway', 'gateway', {
			role: '网关',
			lanip: m.lan.ipv4 || m.lan.device || '',
			cpu: 'CPU ' + (m.sys.cpu_pct != null ? m.sys.cpu_pct : '—') + '%',
			temp: m.sys.temp_c ? m.sys.temp_c + '℃' : '',
			conn: '连接 ' + (m.sys.conn != null ? m.sys.conn : '—'),
			wans: (m.wans || []).map(r => r.w.name + ' ↓' + fmtBitrate(r.rx) + ' ↑' + fmtBitrate(r.tx))
		}), gwTone, 'gateway', 'gateway');

		if (!m.wans.length) {
			const noneMid = this.drawPipe(pipes, inet.x + T.inetJackDx, inet.y, gw.x - gwBox.w / 2, gw.y,
				'#94a3b8', 0, false, 'link:inet:none', 'link_inet_wan');
			this.decorateLink(labels, noneMid, 'link:inet:none', 'link_inet_wan', {});
		} else {
			m.wans.forEach((row, i) => {
				const nk = 'nic:' + row.w.name;
				const nic = this.nicState(nk, gw, -gwBox.w / 2 + 6, fan(0, i, wanN, 44), -90);
				const card = this.drawNic(nics, nic, {
					name: row.w.name,
					status: row.w.up === false ? '离线' : (row.text || ''),
					proto: protoLabel(row.w.proto),
					ip: row.w.ipv4 || '',
					lat: row.w.latency != null && row.w.latency !== '' ? fmtLatency(row.w.latency) : '',
					uptime: row.w.ifuptime ? fmtUptime(row.w.ifuptime) : '',
					rx: row.rx, tx: row.tx
				}, row.w.speed, row.w.up, nk, 'nic', 'gateway');
				const live = row.health === 'ok' && (row.rx + row.tx) > 200;
				const lk = 'link:inet:' + row.w.name;
				const mid = this.drawDuplex(pipes,
					inet.x + T.inetJackDx, inet.y + fan(0, i, wanN, T.wanFan),
					card.jackX, card.jackY,
					row.rx, row.tx, live, lk, 'link_inet_wan');
				this.decorateLink(labels, mid, lk, 'link_inet_wan', {
					name: row.w.name,
					status: row.text || '',
					lat: row.w.latency != null && row.w.latency !== '' ? fmtLatency(row.w.latency) : '',
					rx: row.rx, tx: row.tx
				});
			});
			if (m.wans.length >= 2) {
				let wanRx = 0, wanTx = 0;
				m.wans.forEach(r => { wanRx += r.rx; wanTx += r.tx; });
				this.drawWanSum(labels, inet.x + T.wanSum.dx, inet.y + T.wanSum.dy, wanTx, wanRx);
			}
		}

		const lanNic = this.nicState('nic:lan', gw, gwBox.w / 2 - 6, 8, 90);
		const lanCard = this.drawNic(nics, lanNic, {
			name: 'LAN',
			status: (m.lan && m.lan.up === false) ? '离线' : '',
			ip: (m.lan && m.lan.ipv4) || '',
			rx: m.lanRx, tx: m.lanTx
		}, (m.lan && m.lan.speed) || 0, !(m.lan && m.lan.up === false), 'nic:lan', 'nic', 'gateway');
		const lanLive = (m.lanRx + m.lanTx) > 200;

		const top = (m.clients || []).slice(0, this.topN());
		const rankLines = top.map(c =>
			(c.ip || c.name || '') + ' ↓' + fmtBitrate(c.rx) + ' ↑' + fmtBitrate(c.tx));
		const swPick = this.pick('switch', 'switch', {
			hint: 'LAN 上联合计',
			rate: '↓ ' + fmtBitrate(m.lanTx) + ' ↑ ' + fmtBitrate(m.lanRx),
			online: '在线 ' + ((m.sum && m.sum.online) || 0) + '/' + m.clients.length,
			rank: rankLines.length ? rankLines : ['暂无客户端速率']
		});
		const swBox = this.device(nodes, sw.x, sw.y, 'switch', '核心交换机', swPick, 'ok', 'switch', 'switch');

		const lanMid = this.drawDuplex(pipes, lanCard.jackX, lanCard.jackY, sw.x - swBox.w / 2, sw.y,
			m.lanTx, m.lanRx, lanLive, 'link:lan', 'link_gw_sw');
		this.decorateLink(labels, lanMid, 'link:lan', 'link_gw_sw', {
			name: 'LAN',
			rx: m.lanRx, tx: m.lanTx
		});

		const pitch = CLI_PITCH;
		const stackN = shown.length + (extra ? 1 : 0);
		const stack = this.xy('cli-stack', sw.x + swBox.w / 2 + T.lanStackDx, sw.y);
		const x0 = stack.x;
		const yFirst = stack.y - ((Math.max(1, stackN) - 1) * pitch) / 2;
		const edgeX = sw.x + swBox.w / 2;
		const span = stackN > 1 ? Math.min(Math.max(20, swBox.h - 24), (stackN - 1) * pitch) : 0;
		const yRail0 = sw.y - span / 2;
		if (stackN) {
			pipes.appendChild(svgEl('line', {
				x1: edgeX, y1: yRail0, x2: edgeX, y2: yRail0 + span,
				stroke: '#94a3b8', 'stroke-width': 2.2, 'stroke-linecap': 'round'
			}));
		}
		const cliLayout = this.clientLayout(shown);
		shown.forEach((c, i) => {
			const ck = 'cli:' + (c.mac || c.ip || i);
			const cy = yFirst + i * pitch;
			const ay = stackN > 1 ? yRail0 + i * (span / Math.max(1, stackN - 1)) : sw.y;
			const live = (c.rx + c.tx) > 200;
			const clk = 'link:cli:' + (c.mac || c.ip || i);
			const cmid = this.drawPipe(pipes, edgeX, ay, x0, cy,
				c.online ? '#64748b' : '#cbd5e1',
				0, live, clk, 'link_sw_cli', true);
			const rails = railsStraight(edgeX, ay, x0, cy, 4);
			this.addFlow(rails.a, c.rx, COL_RX, clk + ':rx');
			this.addFlow(reversePts(rails.b), c.tx, COL_TX, clk + ':tx');
			this.decorateLink(labels, cmid, clk, 'link_sw_cli', {
				name: clientHostname(c) || c.ip || '',
				rx: c.rx, tx: c.tx
			});
			this.drawClient(nodes, x0, cy, c, ck, i, stackN, cliLayout);
		});
		if (extra) {
			const i = shown.length;
			const cy = yFirst + i * pitch;
			const ay = stackN > 1 ? yRail0 + i * (span / Math.max(1, stackN - 1)) : sw.y;
			this.drawPipe(pipes, edgeX, ay, x0, cy,
				'#94a3b8', 0, false, 'link:cli-more', 'link_sw_cli', true);
			this.drawClient(nodes, x0, cy, {
				ip: '另有 ' + extra + ' 台',
				rx: 0, tx: 0, online: true
			}, 'cli-more', i, stackN, cliLayout, true);
		}
		if (this._linksDirty) {
			this._linksDirty = false;
			this.saveLinks();
		}
	},

	layoutSig(m) {
		const wans = (m.wans || []).map(r => r.w.name + ':' + (r.w.up ? '1' : '0') + ':' + (r.health || '')).join(',');
		const cli = (m.clients || []).slice(0, 12).map(c => c.mac || c.ip).join(',');
		return [wans, cli, m.clients.length, this.topN(), this.selected, this.layoutLock,
			JSON.stringify(this.fields || {})].join('|');
	},

	rateValue(m, tag) {
		if (!m || !tag)
			return 0;
		const parts = tag.split(':');
		const dir = parts[parts.length - 1];
		if (tag.indexOf('wan-sum:') === 0) {
			let s = 0;
			(m.wans || []).forEach(r => { s += (dir === 'tx' ? r.tx : r.rx); });
			return s;
		}
		if (tag === 'link:lan:tx' || tag === 'nic:lan:tx')
			return m.lanTx;
		if (tag === 'link:lan:rx' || tag === 'nic:lan:rx')
			return m.lanRx;
		if (tag.indexOf('link:inet:') === 0 || tag.indexOf('nic:') === 0) {
			const name = tag.indexOf('link:inet:') === 0
				? parts.slice(2, -1).join(':')
				: parts.slice(1, -1).join(':');
			const row = (m.wans || []).find(r => r.w.name === name);
			return row ? row[dir] : 0;
		}
		if (tag.indexOf('link:cli:') === 0) {
			const dir = parts[parts.length - 1];
			const id = parts.slice(2, -1).join(':');
			const c = (m.clients || []).find(x => x.mac === id || x.ip === id);
			if (!c)
				return 0;
			if (dir === 'rx' || dir === 'tx')
				return c[dir];
			return c.rx + c.tx;
		}
		if (tag.indexOf('cli:') === 0) {
			const id = parts.slice(1, -1).join(':');
			const c = (m.clients || []).find(x => x.mac === id || x.ip === id);
			return c ? c[dir] : 0;
		}
		return 0;
	},

	applyLiveRates(m) {
		const byId = {};
		(this.flows || []).forEach(f => {
			if (f.id)
				byId[f.id] = f;
		});
		(m.wans || []).forEach(row => {
			const k = 'link:inet:' + row.w.name;
			if (byId[k + ':rx'])
				byId[k + ':rx'].bps = row.rx;
			if (byId[k + ':tx'])
				byId[k + ':tx'].bps = row.tx;
		});
		if (byId['link:lan:rx'])
			byId['link:lan:rx'].bps = m.lanTx;
		if (byId['link:lan:tx'])
			byId['link:lan:tx'].bps = m.lanRx;
		(m.clients || []).forEach(c => {
			const k = 'link:cli:' + (c.mac || c.ip);
			if (byId[k + ':rx'])
				byId[k + ':rx'].bps = c.rx;
			if (byId[k + ':tx'])
				byId[k + ':tx'].bps = c.tx;
			if (byId[k])
				byId[k].bps = c.rx + c.tx;
		});
		const svg = document.getElementById('topo-svg');
		if (!svg)
			return;
		const self = this;
		svg.querySelectorAll('[data-rate-num]').forEach(function(el) {
			const tag = el.getAttribute('data-rate-num');
			const p = bitrateParts(self.rateValue(m, tag));
			el.textContent = p.num;
			const unit = svg.querySelector('[data-rate-unit="' + tag.replace(/"/g, '') + '"]');
			if (unit)
				unit.textContent = padFig(p.unit, RATE_UNIT_W, 'end');
		});
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
		const sig = this.layoutSig(m);
		if (svg.querySelector('#topo-pipes') && this._layoutSig === sig) {
			this.applyLiveRates(m);
			this.fillHud();
			this.fillTable();
			return;
		}
		this._layoutSig = sig;
		this.rebuild(svg, m);
		this.fillHud();
		this.fillDetail();
		this.fillTable();
	},

	render(data) {
		this.board = data[1] || {};
		this.info = data[2] || {};
		this.loadFields();
		this.loadPos();
		this.loadSnap();
		this.loadLock();
		this.loadTopN();
		this.loadLinks();
		const snapCk = E('input', { 'type': 'checkbox' });
		snapCk.checked = !!this.snapGrid;
		snapCk.addEventListener('change', L.bind(function() {
			this.snapGrid = !!snapCk.checked;
			this.saveSnap();
		}, this));
		const lockCk = E('input', { 'type': 'checkbox' });
		lockCk.checked = !!this.layoutLock;
		lockCk.addEventListener('change', L.bind(function() {
			this.layoutLock = !!lockCk.checked;
			this.saveLock();
			if (this.model)
				this.rebuild(document.getElementById('topo-svg'), this.model);
			this.fillDetail();
		}, this));
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
		const title = E('div', { 'class': 'topo-title' }, [
				E('h2', {}, '概览'),
				E('div', { 'class': 'topo-title-actions' }, [
					E('button', {
						'class': 'btn',
						'click': L.bind(function(ev) {
							ev.preventDefault();
							if (this.layoutLock)
								return;
							this.pos = {};
							this.links = {};
							this.savePos();
							this.saveLinks();
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
				])
			]);
		const wrap = E('div', { 'class': 'topo-wrap' }, [
			E('div', { 'class': 'topo-hud-row' }, [
				E('div', { 'id': 'topo-hud', 'class': 'topo-hud' }),
				E('div', { 'class': 'topo-hud-actions' }, [
					E('label', { 'class': 'topo-opt' }, [snapCk, ' 网格对齐']),
					E('label', { 'class': 'topo-opt' }, [lockCk, ' 锁定布局'])
				])
			]),
			svg,
			E('div', { 'id': 'topo-detail', 'class': 'topo-detail' }),
			E('h3', {}, '全部终端'),
			E('table', { 'class': 'table', 'id': 'topo-clients' })
		]);
		const page = E('div', { 'class': 'topo-page' }, [
			title,
			wrap,
			E('style', {}, `
				#maincontent h2 { display:none !important; }
				#maincontent .topo-title h2 { display:block !important; margin:0; font-size:1.4em; font-weight:700; background:transparent !important; }
				.topo-page { width:100%; max-width:none; }
				.topo-title {
					display:flex; align-items:center; justify-content:space-between; gap:12px;
					box-sizing:border-box; width:100%;
					background: var(--background-color-high, #ffffff);
					padding:10px 16px; margin:0 0 12px;
				}
				.topo-title-actions { display:flex; flex-wrap:wrap; gap:8px; }
				.topo-wrap { max-width: 1280px; }
				.topo-hud-row { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; margin:0 0 10px; }
				.topo-hud { display:flex; flex-wrap:wrap; gap:8px; margin:0; flex:1; }
				.topo-hud-actions { display:flex; flex-wrap:wrap; gap:12px; align-items:center; font-size:13px; margin-left:auto; }
				.topo-kpi { min-width:88px; padding:8px 10px; border-radius:10px;
					background: var(--background-color-high, #fff);
					border:1px solid var(--border-color-medium, rgba(127,127,127,.16)); }
				.topo-kpi .k { font-size:11px; opacity:.65; }
				.topo-kpi .v { font-size:15px; font-weight:750; font-variant-numeric: tabular-nums; }
				.topo-svg { width:100%; height:auto; display:block; min-height:520px;
					background: radial-gradient(1200px 500px at 20% 50%, rgba(37,99,235,.06), transparent 55%),
						var(--background-color-high, #fff);
					border:1px solid var(--border-color-medium, rgba(127,127,127,.16));
					border-radius:14px; color: var(--text-color-high, #1e293b); }
				.topo-detail { margin:12px 0; padding:12px 14px; border-radius:10px;
					border:1px solid var(--border-color-medium, rgba(127,127,127,.16));
					background: var(--background-color-high, #fff); min-height:88px; }
				.topo-detail h4 { margin:0 0 6px; }
				.topo-detail p { margin:4px 0; font-size:13px; }
				.topo-edit-lab { margin-top:10px !important; font-weight:650; }
				.topo-edit { display:flex; flex-wrap:wrap; gap:10px 14px; }
				.topo-opt { display:inline-flex; align-items:center; gap:4px; }
			`)
		]);

		this.paint(data[0] || {}, this.info, svg);
		requestAnimationFrame(function() {
			document.querySelectorAll('#maincontent h2').forEach(h => {
				if (h.closest && h.closest('.topo-title'))
					return;
				h.style.display = 'none';
			});
			const row = document.querySelector('.topo-title');
			const main = document.getElementById('maincontent');
			if (row && main) {
				const mr = main.getBoundingClientRect();
				const rr = row.getBoundingClientRect();
				const left = rr.left - mr.left;
				const right = mr.right - rr.right;
				row.style.marginLeft = (-left) + 'px';
				row.style.marginRight = (-right) + 'px';
				row.style.paddingLeft = (16 + Math.max(0, left)) + 'px';
				row.style.paddingRight = (16 + Math.max(0, right)) + 'px';
				row.style.width = mr.width + 'px';
			}
		});
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
		return page;
	}
});
