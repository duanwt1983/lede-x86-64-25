'use strict';
'require view';
'require poll';
'require rpc';
'require view.status.ratechart as rc';

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

const HIST = 90;

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

function fmtBytes(n) {
	n = Number(n) || 0;
	if (n < 1024)
		return n + ' B';
	if (n < 1048576)
		return (n / 1024).toFixed(1) + ' KB';
	if (n < 1073741824)
		return (n / 1048576).toFixed(1) + ' MB';
	return (n / 1073741824).toFixed(2) + ' GB';
}

function fmtCount(n) {
	n = Number(n) || 0;
	if (n >= 10000)
		return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
	if (n >= 1000)
		return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
	return String(n);
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
		return d + ' 天 ' + h + ' 小时';
	if (h)
		return h + ' 小时 ' + m + ' 分';
	return m + ' 分钟';
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

function bar(pct, tone) {
	pct = Math.min(100, Math.max(0, Number(pct) || 0));
	return E('div', { 'class': 'ov-bar' },
		E('div', {
			'class': 'ov-bar-fill ' + (tone || ''),
			'style': 'width:' + pct.toFixed(1) + '%'
		}));
}

function toneOf(pct, warn, bad) {
	if (pct >= bad)
		return 'bad';
	if (pct >= warn)
		return 'warn';
	return 'ok';
}

const STYLE = `
.ov-wrap { max-width: 1180px; }
.ov-uptime { display:inline-block; margin-bottom:12px; padding:4px 12px; border-radius:99px;
	background:#e8f8ef; color:#1e8a4c; font-size:13px; font-weight:600; }
.ov-id { display:flex; flex-wrap:wrap; justify-content:space-between; gap:12px; align-items:center;
	margin-bottom:14px; padding:16px 18px; border-radius:12px;
	background: var(--background-color-high, #fff);
	border:1px solid var(--border-color-medium, rgba(127,127,127,.16)); }
.ov-clock { font-size:2.2em; font-weight:750; letter-spacing:.05em;
	font-variant-numeric: tabular-nums; line-height:1; }
.ov-clock-day { margin-top:6px; opacity:.65; font-size:13px; }
.ov-id-meta h2 { margin:0; font-size:1.2em; }
.ov-id-meta p { margin:4px 0 0; opacity:.7; font-size:13px; }
.ov-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; margin-bottom:14px; }
.ov-stat { padding:16px 18px; border-radius:12px;
	background: var(--background-color-high, #fff);
	border:1px solid var(--border-color-medium, rgba(127,127,127,.16)); }
.ov-stat-title { font-size:13px; opacity:.7; margin-bottom:8px; }
.ov-stat-num { font-size:2em; font-weight:750; line-height:1.1; }
.ov-stat-split { display:flex; gap:16px; margin-top:10px; font-size:13px; }
.ov-stat-split b { font-weight:700; }
.ov-stat-split .muted { opacity:.65; margin-right:4px; }
.ov-wanbox { padding:16px 18px; border-radius:12px; margin-bottom:14px;
	background: var(--background-color-high, #fff);
	border:1px solid var(--border-color-medium, rgba(127,127,127,.16)); }
.ov-wanbox h3 { margin:0 0 12px; font-size:14px; font-weight:650; }
.ov-wanline { display:grid; grid-template-columns: 88px 72px 1fr auto; gap:10px 14px;
	align-items:center; padding:12px 0; border-top:1px solid rgba(127,127,127,.12); }
.ov-wanline:first-of-type { border-top:none; padding-top:0; }
.ov-pill { display:inline-block; padding:2px 10px; border-radius:99px; font-size:12px; font-weight:700; }
.ov-pill.ok { background:#e8f8ef; color:#1e8a4c; }
.ov-pill.warn { background:#fff6e0; color:#b47b00; }
.ov-pill.bad { background:#fdecea; color:#c0392b; }
.ov-wan-rates { text-align:right; font-variant-numeric: tabular-nums; font-size:13px; }
.ov-wan-rates .up { color:#3b82f6; }
.ov-wan-rates .down { color:#16a34a; }
.ov-wan-sub { font-size:12px; opacity:.65; }
.ov-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(132px,1fr)); gap:10px; margin-bottom:14px; }
.ov-kpi { padding:12px 14px; border-radius:12px;
	background: var(--background-color-high, #fff);
	border:1px solid var(--border-color-medium, rgba(127,127,127,.16)); }
.ov-kpi-val { font-size:1.35em; font-weight:700; }
.ov-kpi-label { margin-top:4px; font-size:12px; opacity:.7; }
.ov-kpi.warn { border-color: rgba(240,180,60,.45); }
.ov-kpi.bad { border-color: rgba(255,107,107,.5); }
.ov-kpi.ok { border-color: rgba(61,204,138,.35); }
.ov-sys { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:10px; margin-bottom:16px; }
.ov-sys-card { padding:12px 14px; border-radius:12px;
	background: var(--background-color-high, #fff);
	border:1px solid var(--border-color-medium, rgba(127,127,127,.16)); }
.ov-sys-card .lbl { font-size:12px; opacity:.7; margin-bottom:6px; display:flex; justify-content:space-between; }
.ov-bar { height:8px; border-radius:99px; background:rgba(127,127,127,.16); overflow:hidden; }
.ov-bar-fill { height:100%; border-radius:99px; background:#3b82f6; }
.ov-bar-fill.ok { background:#16a34a; }
.ov-bar-fill.warn { background:#e0b34a; }
.ov-bar-fill.bad { background:#ef4444; }
.ov-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; }
.ov-card { padding:14px; border-radius:12px;
	background: var(--background-color-high, #fff);
	border:1px solid var(--border-color-medium, rgba(127,127,127,.16));
	border-left-width:5px; }
.ov-card.ok { border-left-color:#16a34a; }
.ov-card.warn { border-left-color:#e0b34a; }
.ov-card.bad { border-left-color:#ef4444; }
.ov-head { display:flex; justify-content:space-between; align-items:center; }
.ov-meta { font-size:12px; opacity:.65; margin:6px 0 10px; }
.ov-rates { display:flex; gap:16px; margin-bottom:8px; }
.ov-rx { color:#16a34a; font-size:1.1em; font-weight:700; }
.ov-tx { color:#3b82f6; font-size:1.1em; font-weight:700; }
.ratechart { width:100%; height:150px; border-radius:8px; }
.ov-h { margin:18px 0 8px; font-size:1.05em; }
.ov-table { width:100%; }
.ov-dot.ok { color:#16a34a; font-weight:600; }
.ov-links { margin-top:8px; font-size:13px; }
`;

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	hist: {},
	prev: null,
	polling: false,
	board: null,

	pushHist(key, rx, tx) {
		if (!this.hist[key])
			this.hist[key] = { rx: [], tx: [] };
		const h = this.hist[key];
		h.rx.push(rx);
		h.tx.push(tx);
		if (h.rx.length > HIST) {
			h.rx.shift();
			h.tx.shift();
		}
	},

	kpi(label, value, tone) {
		return E('div', { 'class': 'ov-kpi' + (tone ? ' ' + tone : '') }, [
			E('div', { 'class': 'ov-kpi-val' }, value),
			E('div', { 'class': 'ov-kpi-label' }, label)
		]);
	},

	load() {
		return Promise.all([
			callBoard(),
			callInfo(),
			callSnapshot().catch(() => ({ wans: [] }))
		]);
	},

	paint(board, info, snap) {
		board = board || this.board || {};
		info = info || {};
		snap = snap || {};
		this.board = board;

		const rel = board.release || {};
		const mem = info.memory || {};
		const total = Number(mem.total) || 0;
		const avail = Number(mem.available != null ? mem.available : mem.free) || 0;
		const used = Math.max(0, total - avail);
		const mpct = total ? (used / total) * 100 : 0;
		const load = (info.load && info.load[0] != null) ? (info.load[0] / 65535).toFixed(2) : '-';
		const wans = snap.wans || [];
		const lan = snap.lan || {};
		const sum = snap.clients_sum || {};
		const sys = snap.sys || {};
		const disks = snap.disks || [];
		const clients = (snap.clients || []).slice().sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
		const prev = this.prev;

		const lanRx = rateOf(
			prev && prev.lan ? { ts: prev.ts, rx_bytes: prev.lan.rx_bytes } : null,
			{ ts: snap.ts, rx_bytes: lan.rx_bytes }, 'rx_bytes');
		const lanTx = rateOf(
			prev && prev.lan ? { ts: prev.ts, tx_bytes: prev.lan.tx_bytes } : null,
			{ ts: snap.ts, tx_bytes: lan.tx_bytes }, 'tx_bytes');

		let wanRxTot = 0, wanTxTot = 0;
		const wanRows = [];
		const cards = wans.map(w => {
			const pw = (prev && prev.wans || []).find(x => x.name === w.name);
			const rx = rateOf(pw && { ts: prev.ts, rx_bytes: pw.rx_bytes },
				{ ts: snap.ts, rx_bytes: w.rx_bytes }, 'rx_bytes');
			const tx = rateOf(pw && { ts: prev.ts, tx_bytes: pw.tx_bytes },
				{ ts: snap.ts, tx_bytes: w.tx_bytes }, 'tx_bytes');
			wanRxTot += rx;
			wanTxTot += tx;
			this.pushHist(w.name, rx, tx);
			const h = this.hist[w.name];
			const health = w.health || (w.up ? 'ok' : 'bad');
			const htext = w.health_text || (w.up ? '正常' : '掉线');
			wanRows.push({ w, rx, tx, health, htext });
			return E('div', { 'class': 'ov-card ' + health }, [
				E('div', { 'class': 'ov-head' }, [
					E('strong', {}, w.name),
					E('span', { 'class': 'ov-pill ' + health }, htext)
				]),
				E('div', { 'class': 'ov-meta' },
					protoLabel(w.proto) + (w.ipv4 ? ' · ' + w.ipv4 : ' · 无 IPv4') +
					(w.ifuptime ? ' · 已连 ' + fmtUptime(w.ifuptime) : '')),
				E('div', { 'class': 'ov-rates' }, [
					E('span', { 'class': 'ov-rx' }, '↓ ' + fmtBitrate(rx)),
					E('span', { 'class': 'ov-tx' }, '↑ ' + fmtBitrate(tx))
				]),
					rc.spark(h.rx, h.tx)
			]);
		});

		this.prev = snap;

		const rows = clients.slice(0, 16).map(c => E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' },
				E('span', { 'class': 'ov-dot' + (c.online ? ' ok' : '') }, c.online ? '在线' : '离线')),
			E('td', { 'class': 'td' }, c.name || ''),
			E('td', { 'class': 'td' }, c.ip || ''),
			E('td', { 'class': 'td' }, c.mac || '')
		]));

		const host = board.hostname || 'OpenWrt';
		const fw = rel.description || rel.version || '';
		const lanip = lan.ipv4 || '';
		const temp = Number(sys.temp_c) || 0;
		const cpu = Number(sys.cpu_pct) || 0;
		const conn = Number(sys.conn) || 0;
		const connMax = Number(sys.conn_max) || 0;
		const connPct = connMax ? (conn / connMax) * 100 : 0;
		const clock = sys.clock_hms || '';
		const day = sys.clock_day || '';

		const diskCards = disks.length ? disks.map(d => {
			const pct = Number(d.pct) || 0;
			const t = toneOf(pct, 80, 92);
			return E('div', { 'class': 'ov-sys-card' }, [
				E('div', { 'class': 'lbl' }, [
					E('span', {}, '硬盘 ' + (d.mount || '')),
					E('span', {}, pct.toFixed(0) + '% · ' + fmtBytes((d.used_kb || 0) * 1024) + ' / ' + fmtBytes((d.total_kb || 0) * 1024))
				]),
				bar(pct, t)
			]);
		}) : [E('div', { 'class': 'ov-sys-card' }, [
			E('div', { 'class': 'lbl' }, '硬盘'),
			E('div', {}, '未发现磁盘分区')
		])];

		const onlineN = Number(sum.online) || 0;
		const connTcp = Number(sys.conn_tcp) || 0;
		const connUdp = Number(sys.conn_udp) || 0;
		const connIcmp = Number(sys.conn_icmp) || 0;

		const wanBox = E('div', { 'class': 'ov-wanbox' }, [
			E('h3', {}, 'WAN 信息'),
			...(wanRows.length ? wanRows.map(row => E('div', { 'class': 'ov-wanline' }, [
				E('strong', {}, row.w.name),
				E('span', { 'class': 'ov-pill ' + row.health }, row.htext),
				E('div', {}, [
					E('div', {}, row.w.ipv4 || '无地址'),
					E('div', { 'class': 'ov-wan-sub' },
						[protoLabel(row.w.proto), row.w.ifuptime ? '已连 ' + fmtUptime(row.w.ifuptime) : '',
							'延迟 ' + fmtLatency(row.w.latency)].filter(Boolean).join(' · '))
				]),
				E('div', { 'class': 'ov-wan-rates' }, [
					E('div', { 'class': 'down' }, '↓ ' + fmtBitrate(row.rx)),
					E('div', { 'class': 'up' }, '↑ ' + fmtBitrate(row.tx))
				])
			])) : [E('p', {}, '未发现 WAN 接口')])
		]);

		return E('div', { 'class': 'ov-wrap' }, [
			E('div', { 'class': 'ov-uptime' }, '系统运行时间：' + fmtUptime(info.uptime)),
			E('div', { 'class': 'ov-id' }, [
				E('div', {}, [
					E('div', { 'class': 'ov-clock' }, clock || '--:--:--'),
					E('div', { 'class': 'ov-clock-day' }, day || '')
				]),
				E('div', { 'class': 'ov-id-meta' }, [
					E('h2', {}, host),
					E('p', {}, [fw, lanip ? 'IP: ' + lanip : ''].filter(Boolean).join(' · '))
				])
			]),
			E('div', { 'class': 'ov-row' }, [
				E('div', { 'class': 'ov-stat' }, [
					E('div', { 'class': 'ov-stat-title' }, '下联终端'),
					E('div', { 'class': 'ov-stat-num' }, String(onlineN)),
					E('div', { 'class': 'ov-stat-split' }, [
						E('span', {}, [E('span', { 'class': 'muted' }, 'DHCP '), E('b', {}, String(sum.leases != null ? sum.leases : 0))])
					])
				]),
				E('div', { 'class': 'ov-stat' }, [
					E('div', { 'class': 'ov-stat-title' }, '连接数'),
					E('div', { 'class': 'ov-stat-num' }, fmtCount(conn)),
					E('div', { 'class': 'ov-stat-split' }, [
						E('span', {}, [E('span', { 'class': 'muted' }, 'TCP '), E('b', {}, fmtCount(connTcp))]),
						E('span', {}, [E('span', { 'class': 'muted' }, 'UDP '), E('b', {}, fmtCount(connUdp))]),
						E('span', {}, [E('span', { 'class': 'muted' }, 'ICMP '), E('b', {}, fmtCount(connIcmp))])
					])
				]),
				E('div', { 'class': 'ov-stat' }, [
					E('div', { 'class': 'ov-stat-title' }, '温度'),
					E('div', { 'class': 'ov-stat-num' }, temp > 0 ? temp + '℃' : '—'),
					E('div', { 'class': 'ov-stat-split' }, [
						E('span', {}, [E('span', { 'class': 'muted' }, 'CPU '), E('b', {}, cpu + '%')]),
						E('span', {}, [E('span', { 'class': 'muted' }, '负载 '), E('b', {}, String(load))])
					])
				])
			]),
			wanBox,
			E('div', { 'class': 'ov-kpis' }, [
				this.kpi('内存', mpct.toFixed(0) + '%', toneOf(mpct, 80, 92)),
				this.kpi('连接占用', connPct.toFixed(0) + '%', toneOf(connPct, 70, 90)),
				this.kpi('WAN 下载', fmtBitrate(wanRxTot)),
				this.kpi('WAN 上传', fmtBitrate(wanTxTot)),
				this.kpi('DHCP 租约', String(sum.leases != null ? sum.leases : 0))
			]),
			E('div', { 'class': 'ov-sys' }, [
				E('div', { 'class': 'ov-sys-card' }, [
					E('div', { 'class': 'lbl' }, [
						E('span', {}, '内存'),
						E('span', {}, fmtBytes(used) + ' / ' + fmtBytes(total))
					]),
					bar(mpct, toneOf(mpct, 80, 92))
				]),
				E('div', { 'class': 'ov-sys-card' }, [
					E('div', { 'class': 'lbl' }, [
						E('span', {}, '连接跟踪'),
						E('span', {}, conn + (connMax ? ' / ' + connMax : ''))
					]),
					bar(connPct, toneOf(connPct, 70, 90))
				]),
				...diskCards
			]),
			E('h3', { 'class': 'ov-h' }, '宽带速率'),
			E('p', { 'class': 'ov-wan-sub' }, '实线下载、虚线上传。下面总图叠全部线路，再往下是每条宽带。'),
			rc.combo(wanRows.map((row, i) => Object.assign({
				color: rc.COLORS[i % rc.COLORS.length],
				rx: (this.hist[row.w.name] || {}).rx || [0],
				tx: (this.hist[row.w.name] || {}).tx || [0]
			}))),
			E('div', { 'class': 'ov-grid' },
				cards.length ? cards : E('p', {}, '未发现 WAN 接口')),
			E('h3', { 'class': 'ov-h' }, '终端'),
			E('table', { 'class': 'table ov-table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, '状态'),
					E('th', { 'class': 'th' }, '名称'),
					E('th', { 'class': 'th' }, 'IP'),
					E('th', { 'class': 'th' }, 'MAC')
				]),
				rows.length ? rows : E('tr', { 'class': 'tr' },
					E('td', { 'class': 'td', 'colspan': 4 }, '暂无 DHCP 租约'))
			]),
			E('p', { 'class': 'ov-links' },
				E('a', { 'href': L.url('admin/status/wanmonitor') }, '完整宽带监控与终端列表 →'))
		]);
	},

	render(data) {
		const board = data[0], info = data[1], snap = data[2];
		const root = E('div', { 'id': 'ov-root' }, this.paint(board, info, snap));
		if (!this.polling) {
			this.polling = true;
			poll.add(L.bind(function() {
				return Promise.all([
					callInfo(),
					callSnapshot().catch(() => ({ wans: [] }))
				]).then(L.bind(function(res) {
					const el = document.getElementById('ov-root');
					if (!el)
						return;
					el.innerHTML = '';
					el.appendChild(this.paint(this.board, res[0], res[1]));
				}, this));
			}, this), 1);
		}
		return E('div', {}, [
			E('style', {}, STYLE),
			root
		]);
	}
});
