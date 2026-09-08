'use strict';
'require view';
'require poll';
'require rpc';

const callSnapshot = rpc.declare({
	object: 'wanmonitor',
	method: 'snapshot',
	expect: { wans: [] }
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

function spark(rxHist, txHist) {
	const w = 320, h = 72;
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
	svg.setAttribute('class', 'wanmon-spark');
	svg.setAttribute('preserveAspectRatio', 'none');

	const max = Math.max(1, ...rxHist, ...txHist);
	const line = (arr, color) => {
		const pts = arr.map((v, i) => {
			const x = arr.length <= 1 ? 0 : (i / (arr.length - 1)) * w;
			const y = h - 2 - (v / max) * (h - 6);
			return x.toFixed(1) + ',' + y.toFixed(1);
		}).join(' ');
		const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
		p.setAttribute('fill', 'none');
		p.setAttribute('stroke', color);
		p.setAttribute('stroke-width', '1.8');
		p.setAttribute('points', pts);
		svg.appendChild(p);
	};
	line(rxHist, '#27ae60');
	line(txHist, '#2980b9');
	return svg;
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

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	hist: {},
	prev: null,
	polling: false,

	load() {
		return callSnapshot();
	},

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

	kpi(label, value, sub) {
		return E('div', { 'class': 'wanmon-kpi' }, [
			E('div', { 'class': 'wanmon-kpi-val' }, value),
			E('div', { 'class': 'wanmon-kpi-label' }, label),
			sub ? E('div', { 'class': 'wanmon-kpi-sub' }, sub) : ''
		]);
	},

	build(data) {
		const now = data || {};
		const wans = now.wans || [];
		const lan = now.lan || {};
		const sum = now.clients_sum || {};
		const clients = now.clients || [];
		const prev = this.prev;

		const lanRx = rateOf(
			prev && prev.lan ? { ts: prev.ts, rx_bytes: prev.lan.rx_bytes } : null,
			{ ts: now.ts, rx_bytes: lan.rx_bytes },
			'rx_bytes');
		const lanTx = rateOf(
			prev && prev.lan ? { ts: prev.ts, tx_bytes: prev.lan.tx_bytes } : null,
			{ ts: now.ts, tx_bytes: lan.tx_bytes },
			'tx_bytes');
		this.pushHist('_lan', lanRx, lanTx);

		let wanRxTot = 0, wanTxTot = 0;
		const cards = wans.map(w => {
			const pw = (prev && prev.wans || []).find(x => x.name === w.name);
			const rx = rateOf(pw && { ts: prev.ts, rx_bytes: pw.rx_bytes }, { ts: now.ts, rx_bytes: w.rx_bytes }, 'rx_bytes');
			const tx = rateOf(pw && { ts: prev.ts, tx_bytes: pw.tx_bytes }, { ts: now.ts, tx_bytes: w.tx_bytes }, 'tx_bytes');
			wanRxTot += rx;
			wanTxTot += tx;
			this.pushHist(w.name, rx, tx);
			const h = this.hist[w.name];
			const st = w.up ? '在线' : '离线';
			return E('div', { 'class': 'wanmon-card' + (w.up ? '' : ' wanmon-down') }, [
				E('div', { 'class': 'wanmon-head' }, [
					E('strong', {}, w.name),
					E('span', { 'class': 'wanmon-badge' + (w.up ? ' ok' : ' bad') }, st)
				]),
				E('div', { 'class': 'wanmon-meta' },
					(w.device || '-') + (w.ipv4 ? ' · ' + w.ipv4 : '')),
				E('div', { 'class': 'wanmon-rates' }, [
					E('div', {}, [ E('span', { 'class': 'wanmon-rx' }, '↓ ' + fmtBitrate(rx)), E('small', {}, ' 下载') ]),
					E('div', {}, [ E('span', { 'class': 'wanmon-tx' }, '↑ ' + fmtBitrate(tx)), E('small', {}, ' 上传') ])
				]),
				spark(h.rx, h.tx),
				E('div', { 'class': 'wanmon-legend' }, [
					E('span', { 'class': 'rx' }, '绿=下载'),
					E('span', { 'class': 'tx' }, '蓝=上传'),
					E('span', {}, '累计 ' + fmtBytes(w.rx_bytes) + ' / ' + fmtBytes(w.tx_bytes))
				])
			]);
		});

		this.prev = now;

		const rows = clients.map(c => E('tr', {}, [
			E('td', {}, c.online ? E('span', { 'class': 'wanmon-dot ok' }, '在线') : E('span', { 'class': 'wanmon-dot' }, '离线')),
			E('td', {}, c.name || ''),
			E('td', {}, c.ip || ''),
			E('td', {}, c.mac || '')
		]));

		return E('div', {}, [
			E('div', { 'class': 'wanmon-kpis' }, [
				this.kpi('在线终端', String(sum.online != null ? sum.online : 0), 'LAN 邻居表（非 FAILED）'),
				this.kpi('DHCP 租约', String(sum.leases != null ? sum.leases : 0), '未过期地址分配'),
				this.kpi('无线关联', String(sum.wifi != null ? sum.wifi : 0), 'Wi-Fi 已认证客户端'),
				this.kpi('WAN 合计下载', fmtBitrate(wanRxTot), '各线路实时之和'),
				this.kpi('WAN 合计上传', fmtBitrate(wanTxTot), '各线路实时之和'),
				this.kpi('局域网', fmtBitrate(lanRx) + ' / ' + fmtBitrate(lanTx), lan.device || 'br-lan')
			]),
			E('h3', { 'class': 'wanmon-h' }, '各条宽带实时速率'),
			E('div', { 'class': 'wanmon-grid' }, cards.length ? cards : E('p', {}, '未发现 WAN。请先配置 mwan3 或 PPPoE/DHCP WAN。')),
			E('h3', { 'class': 'wanmon-h' }, '终端列表'),
			E('table', { 'class': 'table wanmon-table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, '状态'),
					E('th', { 'class': 'th' }, '名称'),
					E('th', { 'class': 'th' }, 'IP'),
					E('th', { 'class': 'th' }, 'MAC')
				]),
				rows.length ? rows : E('tr', { 'class': 'tr' }, E('td', { 'class': 'td', colspan: 4 }, '暂无 DHCP 租约'))
			])
		]);
	},

	render(first) {
		const root = E('div', { 'id': 'wanmon-root' }, this.build(first));
		if (!this.polling) {
			this.polling = true;
			poll.add(L.bind(function() {
				return callSnapshot().then(L.bind(function(d) {
					const el = document.getElementById('wanmon-root');
					if (!el)
						return;
					el.innerHTML = '';
					el.appendChild(this.build(d));
				}, this));
			}, this), 1);
		}
		return E('div', {}, [
			E('h2', {}, '宽带监控'),
			E('p', {}, '每秒刷新。下载/上传按各 WAN 网卡字节差换算；在线人数来自 LAN 邻居表，DHCP 为已分配租约。'),
			E('style', {}, `
				.wanmon-kpis { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:16px; }
				.wanmon-kpi { flex:1; min-width:140px; padding:14px 16px; border-radius:8px;
					background: var(--background-color-high, #fff); border:1px solid var(--border-color-medium, #ddd); }
				.wanmon-kpi-val { font-size:1.6em; font-weight:700; line-height:1.2; }
				.wanmon-kpi-label { opacity:.75; margin-top:4px; }
				.wanmon-kpi-sub { font-size:12px; opacity:.65; margin-top:2px; }
				.wanmon-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; }
				.wanmon-card { padding:14px; border-radius:8px; background: var(--background-color-high, #fff);
					border:1px solid var(--border-color-medium, #ddd); }
				.wanmon-card.wanmon-down { opacity:.72; }
				.wanmon-head { display:flex; justify-content:space-between; align-items:center; }
				.wanmon-meta { font-size:12px; opacity:.7; margin:4px 0 10px; }
				.wanmon-rates { display:flex; gap:18px; margin-bottom:8px; }
				.wanmon-rx { color:#27ae60; font-size:1.25em; font-weight:700; }
				.wanmon-tx { color:#2980b9; font-size:1.25em; font-weight:700; }
				.wanmon-spark { width:100%; height:72px; background:rgba(127,127,127,.08); border-radius:4px; }
				.wanmon-legend { display:flex; gap:12px; font-size:12px; opacity:.7; margin-top:6px; flex-wrap:wrap; }
				.wanmon-legend .rx { color:#27ae60; } .wanmon-legend .tx { color:#2980b9; }
				.wanmon-badge { font-size:12px; padding:2px 8px; border-radius:10px; }
				.wanmon-badge.ok { background:#e8f8ef; color:#1e8449; }
				.wanmon-badge.bad { background:#fdecea; color:#c0392b; }
				.wanmon-table { width:100%; margin-top:8px; }
				.wanmon-dot.ok { color:#1e8449; font-weight:600; }
				.wanmon-h { margin:20px 0 8px; }
			`),
			root
		]);
	}
});
