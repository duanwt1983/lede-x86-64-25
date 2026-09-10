'use strict';
'require view';
'require fs';
'require ui';

const CAP_DIR = '/tmp/tcpdump/cap/';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load() {
		return fs.list(CAP_DIR).catch(() => []);
	},

	safeBase(name) {
		return String(name || '').replace(/\.pcap$/i, '').replace(/[^a-zA-Z0-9._-]/g, '');
	},

	runAnalyze(base, mode) {
		const b = this.safeBase(base);
		if (!b)
			return Promise.reject(new Error(_('无效文件名')));
		const path = CAP_DIR + b + '.pcap';
		let cmd;
		if (mode === 'summary')
			cmd = `[ -x /usr/bin/tshark ] && tshark -r "${path}" -q -z io,phs 2>/dev/null || tcpdump -r "${path}" -nn -v -c 80 2>&1`;
		else if (mode === 'conv')
			cmd = `[ -x /usr/bin/tshark ] && tshark -r "${path}" -q -z conv,ip 2>/dev/null || tcpdump -r "${path}" -nn -q -r 2>&1 | head -n 100`;
		else if (mode === 'http')
			cmd = `[ -x /usr/bin/tshark ] && tshark -r "${path}" -Y "http or tls.handshake.type==1" -T fields -e frame.number -e ip.src -e ip.dst -e http.request.method -e http.request.uri -e tls.handshake.extensions_server_name 2>/dev/null | head -n 120 || tcpdump -r "${path}" -nn -A -s 256 '(tcp port 80 or tcp port 443)' -c 40 2>&1`;
		else
			cmd = `tcpdump -r "${path}" -nn -c 60 2>&1`;
		return fs.exec('/bin/sh', ['-c', cmd]).then(r => {
			const out = ((r.stdout || '') + (r.stderr || '')).trim();
			return out || _('（无输出）');
		});
	},

	render(caps) {
		const self = this;
		const files = (caps || []).filter(f => /\.pcap$/i.test(f)).sort().reverse();
		let selected = files.length ? files[0].replace(/\.pcap$/i, '') : '';
		const outBox = E('pre', {
			'style': 'white-space:pre-wrap;max-height:560px;overflow:auto;background:rgba(127,127,127,.08);padding:12px;border-radius:8px;font-size:12px;line-height:1.45'
		}, _('选择 .pcap 文件后点分析。抓包请先到「网络 → 网络抓包」。'));

		const sel = E('select', {
			'class': 'cbi-input-select',
			'change': ev => { selected = ev.target.value; }
		});
		if (!files.length)
			sel.appendChild(E('option', { 'value': '' }, _('暂无抓包文件')));
		files.forEach(f => {
			const base = f.replace(/\.pcap$/i, '');
			sel.appendChild(E('option', { 'value': base }, f));
		});

		function doRun(mode) {
			if (!selected) {
				ui.addNotification(null, E('p', {}, _('请先在「网络抓包」页面完成一次抓包')), 'warning');
				return;
			}
			outBox.textContent = _('分析中…');
			return self.runAnalyze(selected, mode).then(t => {
				outBox.textContent = t;
			}).catch(e => {
				ui.addNotification(null, E('p', {}, e.message || String(e)), 'error');
			});
		}

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('抓包分析')),
			E('p', {}, _('读取 Tcpdump 保存的 .pcap。路由器上已装 tshark 时会给出协议统计；也可在抓包页下载文件，用电脑 Wireshark 打开。')),
			E('p', {}, E('a', { 'href': L.url('admin/network/tcpdump') }, _('→ 网络抓包（Tcpdump）'))),
			E('div', { 'class': 'cbi-section' }, [
				E('label', {}, _('抓包文件 ')), sel,
				E('div', { 'style': 'margin-top:10px;display:flex;flex-wrap:wrap;gap:8px' }, [
					E('button', { 'class': 'btn cbi-button', 'click': ui.createHandlerFn(this, () => doRun('packets')) }, _('数据包列表')),
					E('button', { 'class': 'btn cbi-button', 'click': ui.createHandlerFn(this, () => doRun('summary')) }, _('协议摘要')),
					E('button', { 'class': 'btn cbi-button', 'click': ui.createHandlerFn(this, () => doRun('conv')) }, _('IP 会话')),
					E('button', { 'class': 'btn cbi-button', 'click': ui.createHandlerFn(this, () => doRun('http')) }, _('HTTP/TLS 线索')),
				]),
				E('div', { 'style': 'margin-top:12px' }, outBox)
			])
		]);
	}
});
