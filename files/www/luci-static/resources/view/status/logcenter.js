'use strict';
'require view';
'require fs';
'require ui';
'require form';
'require uci';
'require poll';
'require dom';

function levelClass(lv) {
	if (lv === '严重') return 'danger';
	if (lv === '中等') return 'warning';
	if (lv === '一般') return 'notice';
	return 'info';
}

function parseJson(stdout, fallback) {
	const t = (stdout || '').trim();
	if (!t)
		return fallback;
	try {
		return JSON.parse(t);
	} catch (e) {
		return fallback;
	}
}

function renderTable(rows, emptyHint) {
	const body = (rows || []).slice().reverse().map(r => E('tr', { 'class': 'tr', 'title': r.raw || '' }, [
		E('td', { 'class': 'td', 'style': 'white-space:nowrap' }, r.time || ''),
		E('td', { 'class': 'td' }, E('span', { 'class': 'label label-' + levelClass(r.level) }, r.level || '')),
		E('td', { 'class': 'td' }, r.cat || ''),
		E('td', { 'class': 'td' }, E('strong', {}, r.title || '')),
		E('td', { 'class': 'td' }, r.detail || '')
	]));

	if (!body.length)
		body.push(E('tr', { 'class': 'tr' },
			E('td', { 'class': 'td', colspan: 5 }, emptyHint || _('暂无记录。'))));

	return E('table', { 'class': 'table cbi-section-table' }, [
		E('tr', { 'class': 'tr table-titles' }, [
			E('th', { 'class': 'th' }, _('时间')),
			E('th', { 'class': 'th' }, _('级别')),
			E('th', { 'class': 'th' }, _('类型')),
			E('th', { 'class': 'th' }, _('发生了什么')),
			E('th', { 'class': 'th' }, _('说明'))
		]),
		...body
	]);
}

function sizeText(a) {
	if (!a || !a.path)
		return _('仅内存 / 未写文件');
	if (!a.exists)
		return _('尚无文件');
	return ((a.size / 1024).toFixed(1) + ' KB');
}

return view.extend({
	load() {
		return Promise.all([
			uci.load('lede-log').catch(() => null),
			uci.load('wanalert').catch(() => null),
			uci.load('system'),
			uci.load('mosdns').catch(() => null),
			fs.exec('/usr/libexec/lede-log-read', ['list']).then(r => parseJson(r && r.stdout, [])),
			fs.exec('/usr/libexec/lede-log-read', ['summary']).then(r => parseJson(r && r.stdout, {})),
			fs.exec('/usr/libexec/lede-log-read', ['read', 'alert', '400', 'alarm']).then(r => parseJson(r && r.stdout, []))
		]);
	},

	render([_l, _w, _s, _m, apps, summary, syslogRows]) {
		const view = this;
		view._tab = 'alert';
		view._filter = 'alarm';
		view._box = E('div', { 'class': 'cbi-section' });

		const hint = {
			syslog: _('来自 logd 环形缓冲。默认不写盘。鼠标悬停一行可看原文。'),
			alert: _('线路掉线/恢复、资源超阈值。不含定时采样。路径在本页最下方「报警日志」。'),
			mosdns: _('MosDNS 进程日志，偏调试。')
		};

		view._refresh = function() {
			return fs.exec('/usr/libexec/lede-log-read', ['read', view._tab, '400', view._filter]).then(r => {
				dom.content(view._box, [
					E('p', { 'style': 'opacity:.8' }, hint[view._tab] || ''),
					renderTable(parseJson(r && r.stdout, []), _('这一类暂时没有记录。'))
				]);
			}).catch(e => {
				dom.content(view._box, E('p', {}, e.message || String(e)));
			});
		};

		const makeTab = (id, label, filt, active) => E('li', {
			'class': active ? 'cbi-tab cbi-tab-active' : 'cbi-tab',
			'click': ui.createHandlerFn(view, function(ev) {
				ev.preventDefault();
				view._tab = id;
				view._filter = filt || 'all';
				[...view._tabs.querySelectorAll('li')].forEach(li => li.classList.remove('cbi-tab-active'));
				ev.currentTarget.classList.add('cbi-tab-active');
				return view._refresh();
			})
		}, E('a', { href: '#' }, label));

		view._tabs = E('ul', { 'class': 'cbi-tabmenu' }, [
			makeTab('alert', _('报警日志'), 'alarm', true),
			makeTab('alert', _('系统事件'), 'event', false),
			makeTab('alert', _('状态采样'), 'sample', false),
			makeTab('syslog', _('系统日志'), 'all', false),
			makeTab('syslog', _('网络'), 'net', false),
			makeTab('syslog', _('DHCP'), 'dhcp', false),
			makeTab('syslog', _('登录'), 'auth', false),
			makeTab('mosdns', _('MosDNS'), 'all', false)
		]);

		const headlines = [];
		(summary.alert || []).forEach(x => headlines.push(x));
		(summary.syslog || []).forEach(x => headlines.push(x));
		const statusBox = E('div', { 'class': 'alert-message notice', 'style': 'margin-bottom:1em' }, [
			E('strong', {}, _('当前状况')),
			E('ul', {}, (headlines.length ? headlines : [_('暂无值得单独列出的事件。')]).slice(0, 6).map(t => E('li', {}, t)))
		]);

		dom.content(view._box, [
			E('p', { 'style': 'opacity:.8' }, hint.syslog),
			renderTable(syslogRows, _('还没有报警记录。请到「系统报警」打开写入日志。'))
		]);

		const storageRows = (apps || []).map(a => E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' }, a.title || a.id),
			E('td', { 'class': 'td' }, E('code', {}, a.path || _('（内存，不占磁盘）'))),
			E('td', { 'class': 'td' }, a.max_kb ? (a.max_kb + ' KB') : '—'),
			E('td', { 'class': 'td' }, sizeText(a)),
			E('td', { 'class': 'td' }, a.persist ? _('重启保留') : _('重启可能丢失'))
		]));

		const m = new form.Map('lede-log', _('各应用日志存哪'),
			_('根分区很小。能放 U 盘就放 U 盘，例如 /mnt/sda1/logs/…. 不要把大日志写到 / 或默认 overlay 根上。单文件超上限时告警日志会轮转成 .old。'));
		view.map = m;

		let s = m.section(form.NamedSection, 'alert', 'store', _('报警日志'));
		s.addremove = false;
		s.description = _('线路和资源告警写入这个文件，也就是「报警日志」页的数据。');
		let o = s.option(form.Flag, 'enabled', _('写入文件'));
		o.default = o.enabled;
		o = s.option(form.Value, 'path', _('存储路径'));
		o.placeholder = '/overlay/logs/sys-alert.log';
		o.rmempty = false;
		o = s.option(form.Value, 'max_kb', _('单文件上限（KB）'));
		o.datatype = 'uinteger';
		o.placeholder = '512';

		s = m.section(form.NamedSection, 'syslog', 'store', _('系统日志 logd'));
		s.addremove = false;
		s.description = _('默认只在内存里转，状态 → 系统日志 也能看。只有排障需要落盘时才打开，并务必改到外置盘。');
		o = s.option(form.Flag, 'enabled', _('写到文件（不推荐放 overlay）'));
		o.default = o.disabled;
		o = s.option(form.Value, 'path', _('存储路径'));
		o.placeholder = '/mnt/sda1/logs/system.log';
		o.depends('enabled', '1');
		o = s.option(form.Value, 'max_kb', _('文件大小（KB）'));
		o.datatype = 'uinteger';
		o.placeholder = '256';
		o.depends('enabled', '1');

		s = m.section(form.NamedSection, 'mosdns', 'store', _('MosDNS'));
		s.addremove = false;
		s.description = _('关掉则仍写 /var/log/mosdns.log（内存）。改路径后需要重启 MosDNS 才生效。');
		o = s.option(form.Flag, 'enabled', _('写到持久路径'));
		o.default = o.disabled;
		o = s.option(form.Value, 'path', _('存储路径'));
		o.placeholder = '/overlay/logs/mosdns.log';
		o.depends('enabled', '1');
		o = s.option(form.Value, 'max_kb', _('参考上限（KB）'));
		o.datatype = 'uinteger';
		o.placeholder = '256';
		o.depends('enabled', '1');

		poll.add(L.bind(view._refresh, view), 25);

		return m.render().then(node => E('div', {}, [
			E('h2', {}, _('日志中心')),
			E('p', {}, _('对照爱快：上面看「发生了什么」，下面给每个应用单独指定磁盘路径，避免撑爆根分区。')),
			statusBox,
			view._tabs,
			E('div', { 'style': 'margin:.5em 0 1em' }, [
				E('button', {
					'class': 'btn cbi-button cbi-button-action',
					'click': ui.createHandlerFn(view, view._refresh)
				}, _('刷新'))
			]),
			view._box,
			E('h3', {}, _('当前占用')),
			E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, _('用途')),
					E('th', { 'class': 'th' }, _('路径')),
					E('th', { 'class': 'th' }, _('上限')),
					E('th', { 'class': 'th' }, _('已用')),
					E('th', { 'class': 'th' }, _('持久'))
				]),
				...storageRows
			]),
			E('hr'),
			node
		]));
	},

	handleSave(ev) {
		if (!this.map)
			return Promise.resolve();
		return this.map.save().then(() => {
			const enA = uci.get('lede-log', 'alert', 'enabled');
			const pathA = uci.get('lede-log', 'alert', 'path');
			const maxA = uci.get('lede-log', 'alert', 'max_kb');
			uci.set('wanalert', 'main', 'log_enabled', (enA === '0') ? '0' : '1');
			if (pathA)
				uci.set('wanalert', 'main', 'log_path', pathA);
			if (maxA)
				uci.set('wanalert', 'main', 'log_max_kb', maxA);

			const enS = uci.get('lede-log', 'syslog', 'enabled');
			const pathS = uci.get('lede-log', 'syslog', 'path');
			const maxS = uci.get('lede-log', 'syslog', 'max_kb');
			const sysSid = (uci.sections('system', 'system')[0] || {})['.name'];
			if (sysSid) {
				if (enS === '1' && pathS) {
					uci.set('system', sysSid, 'log_file', pathS);
					uci.set('system', sysSid, 'log_size', maxS || '256');
				} else {
					uci.unset('system', sysSid, 'log_file');
				}
			}

			const enM = uci.get('lede-log', 'mosdns', 'enabled');
			const pathM = uci.get('lede-log', 'mosdns', 'path');
			if (uci.get('mosdns', 'config', 'configfile') != null || uci.get('mosdns', 'config', 'log_file') != null) {
				if (enM === '1' && pathM)
					uci.set('mosdns', 'config', 'log_file', pathM);
				else
					uci.set('mosdns', 'config', 'log_file', '/var/log/mosdns.log');
			}

			return uci.save();
		});
	},

	handleSaveApply(ev, mode) {
		return this.handleSave(ev).then(() => ui.changes.apply(mode == '0'));
	}
});
