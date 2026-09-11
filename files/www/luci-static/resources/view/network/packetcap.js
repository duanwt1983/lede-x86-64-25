'use strict';
'require view';
'require fs';
'require ui';
'require uci';
'require poll';

function shQuote(s) {
	return "'" + String(s || '').replace(/'/g, "'\\''") + "'";
}

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	state: {},
	polling: false,

	load() {
		return Promise.all([
			uci.load('packet_cap').catch(() => null),
			fs.exec('/usr/libexec/packet-cap', ['status']).then(r => {
				try {
					return JSON.parse((r.stdout || '').trim() || '{}');
				} catch (e) {
					return {};
				}
			}),
			fs.exec('/usr/libexec/packet-cap', ['ifaces']).then(r =>
				(r.stdout || '').trim().split(/\n/).filter(Boolean)
			).catch(() => [])
		]);
	},

	saveCapDir(dir) {
		dir = String(dir || '').trim() || '/overlay/pcap';
		if (!dir.startsWith('/'))
			dir = '/' + dir;
		if (!uci.get('packet_cap', 'settings'))
			uci.add('packet_cap', 'settings', 'settings');
		uci.set('packet_cap', 'settings', 'cap_dir', dir);
		return uci.save().then(() => {
			ui.addNotification(null, E('p', {}, _('存放路径已保存')), 'info');
		}).catch(() => Promise.resolve());
	},

runAnalyze(file, mode) {
		if (!file)
			return Promise.reject(new Error(_('当前没有可分析的抓包文件')));
		const path = shQuote(file);
		let cmd;
		if (mode === 'summary')
			cmd = `[ -x /usr/bin/tshark ] && tshark -r ${path} -q -z io,phs 2>/dev/null || tcpdump -r ${path} -nn -v -c 80 2>&1`;
		else if (mode === 'conv')
			cmd = `[ -x /usr/bin/tshark ] && tshark -r ${path} -q -z conv,ip 2>/dev/null || tcpdump -r ${path} -nn -q -r 2>&1 | head -n 100`;
		else if (mode === 'http')
			cmd = `[ -x /usr/bin/tshark ] && tshark -r ${path} -Y "http or tls.handshake.type==1" -T fields -e frame.number -e ip.src -e ip.dst -e http.request.method -e http.request.uri -e tls.handshake.extensions_server_name 2>/dev/null | head -n 120 || tcpdump -r ${path} -nn -A -s 256 '(tcp port 80 or tcp port 443)' -c 40 2>&1`;
		else
			cmd = `tcpdump -r ${path} -nn -c 60 2>&1`;
		return fs.exec('/bin/sh', ['-c', cmd]).then(r => {
			const out = ((r.stdout || '') + (r.stderr || '')).trim();
			return out || _('（无输出）');
		});
	},

	refreshStatus() {
		const wasActive = !!(this.state && this.state.active);
		return fs.exec('/usr/libexec/packet-cap', ['status']).then(r => {
			try {
				this.state = JSON.parse((r.stdout || '').trim() || '{}');
			} catch (e) {
				this.state = {};
			}
			this.paintStatus();
			if (wasActive && !this.state.active && this._outBox)
				this.analyzeCurrent('summary', this._outBox);
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
		const file = this.state && this.state.current_file;
		if (!file) {
			if (outBox) outBox.textContent = _('请先完成一次抓包');
			return Promise.resolve();
		}
		if (outBox) outBox.textContent = _('分析中…');
		return this.runAnalyze(file, mode).then(t => {
			if (outBox) outBox.textContent = t;
		}).catch(e => {
			if (outBox) outBox.textContent = e.message || String(e);
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

		const ifaceSel = E('select', { 'class': 'cbi-input-select', 'id': 'pcap-iface' });
		ifaces.forEach(n => ifaceSel.appendChild(E('option', { 'value': n }, n)));
		ifaceSel.appendChild(E('option', { 'value': 'any' }, 'any'));

		const filterInput = E('input', {
			'class': 'cbi-input-text',
			'style': 'min-width:280px',
			'placeholder': 'tcp port 443'
		});

		const limitInput = E('input', {
			'class': 'cbi-input-text',
			'type': 'number',
			'min': '0',
			'value': '30',
			'style': 'width:80px'
		});

		const unitSel = E('select', { 'class': 'cbi-input-select' }, [
			E('option', { 'value': 'T' }, _('秒')),
			E('option', { 'value': 'P' }, _('包数'))
		]);

		const outBox = E('pre', {
			'id': 'pcap-analyze-out',
			'style': 'white-space:pre-wrap;max-height:520px;overflow:auto;background:rgba(127,127,127,.08);padding:12px;border-radius:8px;font-size:12px;line-height:1.45'
		}, _('停止抓包后会自动做协议摘要分析。'));
		this._outBox = outBox;

		const btnStart = E('button', {
			'id': 'pcap-btn-start',
			'class': 'btn cbi-button cbi-button-action',
			'click': ui.createHandlerFn(this, function(ev) {
				ev.preventDefault();
				return self.saveCapDir(dirInput.value).then(() =>
					fs.exec('/usr/libexec/packet-cap', [
						'start',
						ifaceSel.value,
						filterInput.value || '',
						limitInput.value || '0',
						unitSel.value || 'T'
					])
				).then(r => {
					try { self.state = JSON.parse((r.stdout || '').trim() || '{}'); } catch (e) {}
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
			'class': 'btn cbi-button cbi-button-negative',
			'click': ui.createHandlerFn(this, function(ev) {
				ev.preventDefault();
				return fs.exec('/usr/libexec/packet-cap', ['stop']).then(r => {
					try { self.state = JSON.parse((r.stdout || '').trim() || '{}'); } catch (e) {}
					self.paintStatus();
					return self.analyzeCurrent('summary', outBox);
				}).catch(e => ui.addNotification(null, E('p', {}, e.message || String(e)), 'error'));
			})
		}, _('停止并分析'));

		const dlLink = E('a', {
			'id': 'pcap-dl',
			'class': 'btn cbi-button',
			'style': 'margin-left:8px',
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
			`),
			E('h2', {}, _('抓包分析')),
			E('p', {}, _('同一页完成抓包与分析。停止后自动分析本次文件，无需再选手动文件。')),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('存放路径')),
				E('div', { 'class': 'pcap-row' }, [
					dirInput,
					E('button', {
						'class': 'btn cbi-button',
						'click': ui.createHandlerFn(this, () => this.saveCapDir(dirInput.value))
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
				E('div', { 'class': 'pcap-row' }, [
					E('label', {}, _('接口 ')), ifaceSel,
					E('label', {}, _('过滤 ')), filterInput,
					E('label', {}, _('停止于 ')), limitInput, unitSel,
					btnStart, btnStop, dlLink
				])
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('分析（当前抓包）')),
				E('div', { 'class': 'pcap-row' }, [
					E('button', { 'class': 'btn cbi-button', 'click': ui.createHandlerFn(this, () => this.analyzeCurrent('packets', outBox)) }, _('数据包列表')),
					E('button', { 'class': 'btn cbi-button', 'click': ui.createHandlerFn(this, () => this.analyzeCurrent('summary', outBox)) }, _('协议摘要')),
					E('button', { 'class': 'btn cbi-button', 'click': ui.createHandlerFn(this, () => this.analyzeCurrent('conv', outBox)) }, _('IP 会话')),
					E('button', { 'class': 'btn cbi-button', 'click': ui.createHandlerFn(this, () => this.analyzeCurrent('http', outBox)) }, _('HTTP/TLS 线索'))
				]),
				outBox
			])
		]);
	}
});
