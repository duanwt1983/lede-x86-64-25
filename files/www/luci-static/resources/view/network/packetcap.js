'use strict';
'require view';
'require fs';
'require ui';
'require uci';
'require poll';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	state: {},
	polling: false,

	parseStatus(r) {
		const raw = String((r && r.stdout) || '').trim();
		const i = raw.indexOf('{');
		const j = raw.lastIndexOf('}');
		if (i < 0 || j <= i)
			return null;
		try {
			return JSON.parse(raw.slice(i, j + 1));
		} catch (e) {
			return null;
		}
	},

	load() {
		return Promise.all([
			uci.load('packet_cap').catch(() => null),
			fs.exec('/usr/libexec/packet-cap', ['status']).then(r => this.parseStatus(r) || {}),
			fs.exec('/usr/libexec/packet-cap', ['ifaces']).then(r =>
				(r.stdout || '').trim().split(/\n/).filter(Boolean)
			).catch(() => [])
		]);
	},

	saveCapDir(dir, notify) {
		dir = String(dir || '').trim() || '/overlay/pcap';
		if (!dir.startsWith('/'))
			dir = '/' + dir;
		if (!uci.get('packet_cap', 'settings'))
			uci.add('packet_cap', 'settings', 'settings');
		uci.set('packet_cap', 'settings', 'cap_dir', dir);
		return uci.save().then(() => {
			if (notify)
				ui.addNotification(null, E('p', {}, _('存放路径已保存')), 'info');
		}).catch(() => Promise.resolve());
	},

	runAnalyze(mode) {
		return fs.exec('/usr/libexec/packet-cap', ['analyze', mode || 'overview']).then(r => {
			const out = ((r.stdout || '') + (r.stderr || '')).trim();
			return out || _('（无输出）');
		});
	},

	refreshStatus() {
		const wasActive = !!(this.state && this.state.active);
		return fs.exec('/usr/libexec/packet-cap', ['status']).then(r => {
			const st = this.parseStatus(r);
			if (st)
				this.state = st;
			this.paintStatus();
			if (wasActive && this.state && !this.state.active && this.state.current_file && this._outBox && !this._analyzing)
				this.analyzeCurrent('overview', this._outBox);
			return this.state;
		});
	},

	paintStatus() {
		const st = this.state || {};
		const badge = document.getElementById('pcap-status-badge');
		const meta = document.getElementById('pcap-status-meta');
		const btnStart = document.getElementById('pcap-btn-start');
		const btnStop = document.getElementById('pcap-btn-stop');
		if (badge) {
			badge.textContent = st.active ? _('抓包中…') : _('空闲');
			badge.className = 'pcap-badge ' + (st.active ? 'on' : 'off');
		}
		if (meta) {
			const kb = st.size ? (Number(st.size) / 1024).toFixed(1) + ' KB' : '0';
			meta.textContent = st.current_file
				? (_('当前文件：') + st.current_name + ' · ' + kb)
				: _('尚未抓包');
		}
		if (btnStart) btnStart.disabled = !!st.active;
		if (btnStop) btnStop.disabled = !st.active;
		const dl = document.getElementById('pcap-dl');
		if (dl) {
			if (st.current_file)
				dl.href = '/cgi-bin/cgi-download?' + encodeURIComponent(st.current_file);
			else
				dl.removeAttribute('href');
		}
	},

	analyzeCurrent(mode, outBox) {
		this._analyzing = true;
		if (outBox) outBox.textContent = _('分析中…');
		return this.runAnalyze(mode).then(t => {
			if (outBox) outBox.textContent = t;
		}).catch(e => {
			if (outBox) outBox.textContent = e.message || String(e);
		}).then(() => {
			this._analyzing = false;
		});
	},

	render(data) {
		const self = this;
		const capDir = uci.get('packet_cap', 'settings', 'cap_dir') || '/overlay/pcap';
		const ifaces = data[2] || [];
		this.state = data[1] || {};

		const dirInput = E('input', {
			'class': 'cbi-input-text',
			'style': 'min-width:280px',
			'value': capDir,
			'placeholder': '/overlay/pcap'
		});

		const ifaceSel = E('select', { 'class': 'cbi-input-select', 'id': 'pcap-iface', 'style': 'width:110px' });
		ifaces.forEach(n => ifaceSel.appendChild(E('option', { 'value': n }, n)));
		ifaceSel.appendChild(E('option', { 'value': 'any' }, 'any'));

		const filterSel = E('select', { 'class': 'cbi-input-select', 'id': 'pcap-filter', 'style': 'width:150px' }, [
			E('option', { 'value': '' }, _('全部流量')),
			E('option', { 'value': 'tcp' }, _('仅 TCP')),
			E('option', { 'value': 'udp' }, _('仅 UDP')),
			E('option', { 'value': 'icmp' }, _('仅 ICMP')),
			E('option', { 'value': 'arp' }, _('仅 ARP')),
			E('option', { 'value': 'port 53' }, _('DNS（53）')),
			E('option', { 'value': 'tcp port 80' }, _('HTTP（80）')),
			E('option', { 'value': 'tcp port 443' }, _('HTTPS（443）')),
			E('option', { 'value': 'tcp port 80 or tcp port 443' }, _('网页（80 或 443）')),
			E('option', { 'value': 'udp port 67 or udp port 68' }, _('DHCP')),
			E('option', { 'value': 'tcp port 22' }, _('SSH（22）')),
			E('option', { 'value': 'udp port 123' }, _('NTP（123）'))
		]);

		const srcInput = E('input', {
			'class': 'cbi-input-text',
			'style': 'width:118px',
			'placeholder': _('可选')
		});
		const dstInput = E('input', {
			'class': 'cbi-input-text',
			'style': 'width:118px',
			'placeholder': _('可选')
		});

		const stopSel = E('select', { 'class': 'cbi-input-select', 'id': 'pcap-stop', 'style': 'width:108px' }, [
			E('option', { 'value': 'manual', 'selected': 'selected' }, _('手动停止')),
			E('option', { 'value': 'T' }, _('按时长')),
			E('option', { 'value': 'P' }, _('按包数'))
		]);

		const limitInput = E('input', {
			'class': 'cbi-input-text',
			'type': 'number',
			'min': '1',
			'value': '30',
			'style': 'width:80px'
		});
		const limitWrap = E('span', { 'id': 'pcap-limit-wrap', 'style': 'display:none' }, [
			limitInput, ' ', E('span', { 'id': 'pcap-limit-unit' }, _('秒'))
		]);

		stopSel.addEventListener('change', function() {
			const v = stopSel.value;
			limitWrap.style.display = v === 'manual' ? 'none' : '';
			document.getElementById('pcap-limit-unit').textContent =
				v === 'P' ? _('包') : _('秒');
		});

		const validHost = function(v, label) {
			v = String(v || '').trim();
			if (!v)
				return '';
			if (!/^[A-Za-z0-9.:-]+$/.test(v))
				throw new Error(_('%s 只能包含字母、数字、点、冒号和短横线').format(label));
			return v;
		};

		const buildFilter = function() {
			const parts = [];
			const proto = String(filterSel.value || '').trim();
			const src = validHost(srcInput.value, _('源 IP'));
			const dst = validHost(dstInput.value, _('目的 IP'));
			if (proto)
				parts.push('(' + proto + ')');
			if (src)
				parts.push('src host ' + src);
			if (dst)
				parts.push('dst host ' + dst);
			return parts.join(' and ');
		};

		const outBox = E('pre', {
			'id': 'pcap-analyze-out',
			'style': 'white-space:pre-wrap;max-height:520px;overflow:auto;background:rgba(127,127,127,.08);padding:12px;border-radius:8px;font-size:12px;line-height:1.45'
		}, _('停止后会把数据包翻译成白话：哪个 IP、通过什么协议、做了什么、对端回了什么。'));
		this._outBox = outBox;

		const btnStart = E('button', {
			'id': 'pcap-btn-start',
			'type': 'button',
			'class': 'btn cbi-button cbi-button-action',
			'click': ui.createHandlerFn(this, function(ev) {
				ev.preventDefault();
				let filter, limit, unit;
				try {
					filter = buildFilter();
				} catch (e) {
					ui.addNotification(null, E('p', {}, e.message || String(e)), 'error');
					return Promise.resolve();
				}
				if (stopSel.value === 'manual') {
					limit = '0';
					unit = 'T';
				} else {
					limit = String(limitInput.value || '0');
					unit = stopSel.value;
					if (!limit || Number(limit) <= 0) {
						ui.addNotification(null, E('p', {}, _('请填写停止数量')), 'error');
						return Promise.resolve();
					}
				}
				return self.saveCapDir(dirInput.value, false).then(() =>
					fs.exec('/usr/libexec/packet-cap', [
						'start',
						ifaceSel.value,
						filter || '',
						limit,
						unit
					])
				).then(r => {
					const st = self.parseStatus(r);
					if (st) self.state = st;
					self.paintStatus();
					outBox.textContent = _('抓包已开始…');
					if (!self.polling) {
						self.polling = true;
						poll.add(L.bind(self.refreshStatus, self), 2);
					}
				}).catch(e => ui.addNotification(null, E('p', {}, e.message || String(e)), 'error'));
			})
		}, _('开始抓包'));

		const btnStop = E('button', {
			'id': 'pcap-btn-stop',
			'type': 'button',
			'class': 'btn cbi-button cbi-button-negative',
			'click': ui.createHandlerFn(this, function(ev) {
				ev.preventDefault();
				self._analyzing = true;
				return fs.exec('/usr/libexec/packet-cap', ['stop']).then(r => {
					const st = self.parseStatus(r);
					if (st) self.state = Object.assign({}, self.state, st, { active: 0 });
					else self.state = Object.assign({}, self.state, { active: 0 });
					self.paintStatus();
					return self.analyzeCurrent('overview', outBox);
				}).catch(e => {
					self._analyzing = false;
					ui.addNotification(null, E('p', {}, e.message || String(e)), 'error');
				});
			})
		}, _('停止并分析'));

		const dlLink = E('a', {
			'id': 'pcap-dl',
			'class': 'btn cbi-button',
			'target': '_blank',
			'rel': 'noreferrer'
		}, _('下载当前 pcap'));

		this.paintStatus();

		if (this.state.active && !this.polling) {
			this.polling = true;
			poll.add(L.bind(this.refreshStatus, this), 2);
		}

		return E('div', { 'class': 'cbi-map' }, [
			E('style', {}, `
				.pcap-badge { display:inline-block; padding:2px 10px; border-radius:999px; font-size:12px; margin-left:8px; }
				.pcap-badge.on { background:#fdecea; color:#c0392b; }
				.pcap-badge.off { background:#e8f8ef; color:#1e8449; }
				.pcap-row { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin:8px 0; }
				.pcap-filters { display:flex; flex-wrap:nowrap; gap:8px 12px; align-items:center; margin:8px 0; overflow-x:auto; }
				.pcap-field { display:flex; align-items:center; gap:6px; white-space:nowrap; }
				.pcap-field label { margin:0; }
				.pcap-field select, .pcap-field input { min-width:0; }
			`),
			E('h2', {}, _('抓包分析')),
			E('p', {}, _('同一页完成抓包与分析。停止后自动分析本次文件，无需再选手动文件。')),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('存放路径')),
				E('div', { 'class': 'pcap-row' }, [
					dirInput,
					E('button', {
						'type': 'button',
						'class': 'btn cbi-button',
						'click': ui.createHandlerFn(this, () => this.saveCapDir(dirInput.value, true))
					}, _('保存路径'))
				]),
				E('p', { 'class': 'hint' }, _('建议使用 /overlay/pcap，重启不丢；/tmp 重启会清空。'))
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, [
					_('抓包'),
					E('span', { 'id': 'pcap-status-badge', 'class': 'pcap-badge off' }, _('空闲'))
				]),
				E('div', { 'id': 'pcap-status-meta', 'class': 'hint' }),
				E('div', { 'class': 'pcap-filters' }, [
					E('span', { 'class': 'pcap-field' }, [E('label', {}, _('接口')), ifaceSel]),
					E('span', { 'class': 'pcap-field' }, [E('label', {}, _('协议')), filterSel]),
					E('span', { 'class': 'pcap-field' }, [E('label', {}, _('源 IP')), srcInput]),
					E('span', { 'class': 'pcap-field' }, [E('label', {}, _('目的 IP')), dstInput]),
					E('span', { 'class': 'pcap-field' }, [E('label', {}, _('停止')), stopSel, limitWrap]),
					E('span', { 'class': 'pcap-field' }, [btnStart, btnStop, dlLink])
				]),
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('分析（当前抓包）')),
				E('div', { 'class': 'pcap-row' }, [
					E('button', { 'type': 'button', 'class': 'btn cbi-button', 'click': ui.createHandlerFn(this, () => this.analyzeCurrent('overview', outBox)) }, _('白话翻译')),
					E('button', { 'type': 'button', 'class': 'btn cbi-button', 'click': ui.createHandlerFn(this, () => this.analyzeCurrent('packets', outBox)) }, _('原始包'))
				]),
				outBox
			])
		]);
	}
});
