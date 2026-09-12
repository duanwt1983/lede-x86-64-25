'use strict';
'require view';
'require poll';
'require rpc';
'require view.status.ratechart as rc';

const callSnapshot = rpc.declare({
	object: 'wanmonitor',
	method: 'snapshot',
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

function legend(items) {
	return E('div', { 'class': 'wanmon-legend' }, items.map(it =>
		E('span', {}, [
			E('i', { 'style': 'display:inline-block;width:18px;height:0;margin-right:6px;vertical-align:middle;border-top:' +
				(it.dash ? '2px dashed ' : '2px solid ') + it.color }),
			it.label
		])));
}

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	hist: {},
	prev: null,
	polling: false,
	mode: (typeof localStorage !== 'undefined' && localStorage.getItem('wanmon-chart')) || 'cards',
	wanNames: '',

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

	syncSelect(sel, wans) {
		if (!sel)
			return;
		const list = wans || [];
		const names = list.map(w => w.name).join(',');
		if (this.wanNames !== names) {
			this.wanNames = names;
			while (sel.firstChild)
				sel.removeChild(sel.firstChild);
			sel.appendChild(E('option', { 'value': 'cards' }, '各条宽带分开显示'));
			sel.appendChild(E('option', { 'value': 'combo' }, '所有宽带叠在一张图'));
			list.forEach(w => sel.appendChild(E('option', { 'value': w.name }, '仅 ' + w.name)));
			if (!list.length)
				sel.appendChild(E('option', { 'value': 'lanrx', disabled: true }, '（未检测到 WAN，请先在 网络 → 接口 里添加宽带口）'));
		}
		const valid = this.mode === 'cards' || this.mode === 'combo' ||
			list.some(w => w.name === this.mode);
		if (!valid)
			this.mode = 'cards';
		sel.value = this.mode;
	},

	_modeSel: null,

	paintInto(data) {
		const now = data || {};
		const wans = now.wans || [];
		const lan = now.lan || {};
		const sum = now.clients_sum || {};
		const clients = now.clients || [];
		const prev = this.prev;

		const lanRxRaw = rateOf(
			prev && prev.lan ? { ts: prev.ts, rx_bytes: prev.lan.rx_bytes } : null,
			{ ts: now.ts, rx_bytes: lan.rx_bytes }, 'rx_bytes');
		const lanTxRaw = rateOf(
			prev && prev.lan ? { ts: prev.ts, tx_bytes: prev.lan.tx_bytes } : null,
			{ ts: now.ts, tx_bytes: lan.tx_bytes }, 'tx_bytes');
		const lanRx = lanTxRaw;
		const lanTx = lanRxRaw;
		this.pushHist('_lan', lanRx, lanTx);

		let wanRxTot = 0, wanTxTot = 0;
		const rows = [];
		wans.forEach((w, idx) => {
			const pw = (prev && prev.wans || []).find(x => x.name === w.name);
			const rxRaw = rateOf(pw && { ts: prev.ts, rx_bytes: pw.rx_bytes }, { ts: now.ts, rx_bytes: w.rx_bytes }, 'rx_bytes');
			const txRaw = rateOf(pw && { ts: prev.ts, tx_bytes: pw.tx_bytes }, { ts: now.ts, tx_bytes: w.tx_bytes }, 'tx_bytes');
			const rx = txRaw;
			const tx = rxRaw;
			wanRxTot += rx;
			wanTxTot += tx;
			this.pushHist(w.name, rx, tx);
			rows.push({ w, rx, tx, color: rc.COLORS[idx % rc.COLORS.length] });
		});

		this.prev = now;

		this.syncSelect(this._modeSel || document.getElementById('wanmon-mode'), wans);

		const kpis = document.getElementById('wanmon-kpis');
		if (kpis) {
			kpis.innerHTML = '';
			kpis.appendChild(this.kpi('在线终端', String(sum.online != null ? sum.online : 0), 'LAN 邻居表'));
			kpis.appendChild(this.kpi('DHCP 租约', String(sum.leases != null ? sum.leases : 0)));
			kpis.appendChild(this.kpi('WAN 合计下载', fmtBitrate(wanRxTot)));
			kpis.appendChild(this.kpi('WAN 合计上传', fmtBitrate(wanTxTot)));
		}

		let charts;
		if (this.mode === 'combo') {
			const series = rows.map(r => Object.assign({ color: r.color }, this.hist[r.w.name]));
			charts = E('div', {}, [
				legend(rows.flatMap(r => [
					{ color: r.color, label: r.w.name + ' 下载', dash: false },
					{ color: r.color, label: r.w.name + ' 上传', dash: true }
				])),
				rc.combo(series)
			]);
		} else if (!rows.length) {
			charts = E('p', { 'class': 'wanmon-meta' },
				'尚未识别到 WAN 口。宽带监控读的是「网络 → 接口」里的 wan（以及防火墙 WAN 区里的接口），不需要启用多线负载。');
		} else {
			const shown = this.mode === 'cards' ? rows : rows.filter(r => r.w.name === this.mode);
			charts = E('div', { 'class': 'wanmon-grid' }, shown.map(r => {
				const h = this.hist[r.w.name];
				return E('div', { 'class': 'wanmon-card' + (r.w.up ? '' : ' wanmon-down') }, [
					E('div', { 'class': 'wanmon-head' }, [
						E('strong', {}, r.w.name),
						E('span', { 'class': 'wanmon-badge' + (r.w.up ? ' ok' : ' bad') }, r.w.up ? '正常' : '掉线')
					]),
					E('div', { 'class': 'wanmon-meta' },
						(r.w.device || '-') + (r.w.ipv4 ? ' · ' + r.w.ipv4 : '')),
					E('div', { 'class': 'wanmon-rates' }, [
						E('span', { 'class': 'wanmon-rx' }, '↓ ' + fmtBitrate(r.rx)),
						E('span', { 'class': 'wanmon-tx' }, '↑ ' + fmtBitrate(r.tx))
					]),
					legend([
						{ color: '#16a34a', label: '下载', dash: false },
						{ color: '#2563eb', label: '上传', dash: true }
					]),
					rc.spark(h.rx, h.tx),
					E('div', { 'class': 'wanmon-meta' },
						'累计 ' + fmtBytes(r.w.tx_bytes) + ' / ' + fmtBytes(r.w.rx_bytes))
				]);
			}));
		}

		const chartsEl = document.getElementById('wanmon-charts');
		if (chartsEl) {
			chartsEl.innerHTML = '';
			chartsEl.appendChild(charts);
		}

		const lanH = this.hist._lan;
		const lanEl = document.getElementById('wanmon-lan');
		if (lanEl) {
			lanEl.innerHTML = '';
			lanEl.appendChild(legend([
				{ color: '#16a34a', label: '下载', dash: false },
				{ color: '#2563eb', label: '上传', dash: true }
			]));
			lanEl.appendChild(E('div', { 'class': 'wanmon-rates' }, [
				E('span', { 'class': 'wanmon-rx' }, '↓ ' + fmtBitrate(lanRx)),
				E('span', { 'class': 'wanmon-tx' }, '↑ ' + fmtBitrate(lanTx))
			]));
			lanEl.appendChild(rc.spark(lanH ? lanH.rx : [0, 0], lanH ? lanH.tx : [0, 0]));
		}

		const tbl = document.getElementById('wanmon-clients');
		if (tbl) {
			const clientRows = clients.map(c => E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, c.online ? E('span', { 'class': 'wanmon-dot ok' }, '在线') : E('span', {}, '离线')),
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
			if (clientRows.length)
				clientRows.forEach(r => tbl.appendChild(r));
			else
				tbl.appendChild(E('tr', { 'class': 'tr' },
					E('td', { 'class': 'td', 'colspan': 4 }, '暂无 DHCP 租约')));
		}
	},

	render(first) {
		const self = this;
		const sel = E('select', {
			'id': 'wanmon-mode',
			'class': 'cbi-input-select',
			'change': function() {
				self.mode = this.value;
				try { localStorage.setItem('wanmon-chart', self.mode); } catch (e) {}
				if (self.prev)
					self.paintInto(self.prev);
			}
		});
		this._modeSel = sel;

		const root = E('div', {}, [
			E('div', { 'class': 'wanmon-kpis', 'id': 'wanmon-kpis' }),
			E('h3', { 'class': 'wanmon-h' }, '宽带速率'),
			E('div', { 'class': 'wanmon-toolbar' }, [
				E('label', {}, '显示方式 '),
				sel
			]),
			E('div', { 'id': 'wanmon-charts' }),
			E('h3', { 'class': 'wanmon-h' }, '局域网'),
			E('div', { 'id': 'wanmon-lan' }),
			E('h3', { 'class': 'wanmon-h' }, '终端列表'),
			E('table', { 'class': 'table wanmon-table', 'id': 'wanmon-clients' })
		]);

		this.syncSelect(sel, (first && first.wans) || []);
		this.paintInto(first);

		if (!this.polling) {
			this.polling = true;
			poll.add(L.bind(function() {
				return callSnapshot().then(L.bind(this.paintInto, this));
			}, this), 1);
		}

		return E('div', {}, [
			E('h2', {}, '宽带监控'),
			E('p', {}, '实线为下载、虚线为上传。可选择单条、全部分开，或叠在同一张图。'),
			E('style', {}, `
				.wanmon-kpis { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:16px; }
				.wanmon-kpi { flex:1; min-width:140px; padding:14px 16px; border-radius:8px;
					background: var(--background-color-high, #fff); border:1px solid var(--border-color-medium, #ddd); }
				.wanmon-kpi-val { font-size:1.5em; font-weight:700; }
				.wanmon-kpi-label { opacity:.75; margin-top:4px; }
				.wanmon-kpi-sub { font-size:12px; opacity:.65; }
				.wanmon-toolbar { margin-bottom:10px; }
				.wanmon-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:12px; }
				.wanmon-card { padding:14px; border-radius:8px; background: var(--background-color-high, #fff);
					border:1px solid var(--border-color-medium, #ddd); }
				.wanmon-card.wanmon-down { opacity:.72; }
				.wanmon-head { display:flex; justify-content:space-between; align-items:center; }
				.wanmon-meta { font-size:12px; opacity:.7; margin:6px 0; }
				.wanmon-rates { display:flex; gap:18px; margin:8px 0; }
				.wanmon-rx { color:#16a34a; font-size:1.2em; font-weight:700; }
				.wanmon-tx { color:#2563eb; font-size:1.2em; font-weight:700; }
				.wanmon-legend { display:flex; gap:14px; font-size:12px; opacity:.8; margin:6px 0; flex-wrap:wrap; }
				.wanmon-badge { font-size:12px; padding:2px 8px; border-radius:10px; }
				.wanmon-badge.ok { background:#e8f8ef; color:#1e8449; }
				.wanmon-badge.bad { background:#fdecea; color:#c0392b; }
				.wanmon-table { width:100%; margin-top:8px; }
				.wanmon-dot.ok { color:#1e8449; font-weight:600; }
				.wanmon-h { margin:20px 0 8px; }
				.ratechart { width:100%; }
			`),
			root
		]);
	}
});
