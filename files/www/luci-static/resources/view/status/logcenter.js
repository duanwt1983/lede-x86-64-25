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

function parseJson(stdout) {
	const t = (stdout || '').trim();
	if (!t)
		return [];
	try {
		return JSON.parse(t);
	} catch (e) {
		return [];
	}
}

function renderTable(rows) {
	const body = rows.slice().reverse().map(r => E('tr', { 'class': 'tr' }, [
		E('td', { 'class': 'td' }, r.time || ''),
		E('td', { 'class': 'td' }, E('span', {
			'class': 'label label-' + levelClass(r.level)
		}, r.level || '')),
		E('td', { 'class': 'td' }, r.cat || ''),
		E('td', { 'class': 'td' }, E('strong', {}, r.title || '')),
		E('td', { 'class': 'td' }, r.detail || '')
	]));

	if (!body.length)
		body.push(E('tr', { 'class': 'tr' },
			E('td', { 'class': 'td', colspan: 5 }, _('暂无记录。可到「系统报警」开启写入日志。'))));

	return E('table', { 'class': 'table cbi-section-table' }, [
		E('tr', { 'class': 'tr table-titles' }, [
			E('th', { 'class': 'th' }, _('时间')),
			E('th', { 'class': 'th' }, _('级别')),
			E('th', { 'class': 'th' }, _('类型')),
			E('th', { 'class': 'th' }, _('标题')),
			E('th', { 'class': 'th' }, _('详情'))
		]),
		...body
	]);
}

return view.extend({
	load() {
		return Promise.all([
			uci.load('wanalert'),
			uci.load('system'),
			fs.exec('/usr/libexec/lede-log-read', ['list']).then(r => parseJson(r && r.stdout)),
			fs.exec('/usr/libexec/lede-log-read', ['read', 'sys-alert', '400', 'all']).then(r => parseJson(r && r.stdout))
		]);
	},

	render([_w, _s, apps, rows]) {
		const view = this;
		view._filter = 'event';
		view._box = E('div', { 'class': 'cbi-section' });

		const applyFilter = (all) => {
			const f = view._filter;
			if (f === 'alert')
				return all.filter(r => r.level === '严重' || r.level === '中等');
			if (f === 'sample')
				return all.filter(r => r.title === '状态采样');
			if (f === 'event')
				return all.filter(r => r.title !== '状态采样');
			return all;
		};

		view._refresh = function() {
			return fs.exec('/usr/libexec/lede-log-read', ['read', 'sys-alert', '400', 'all']).then(r => {
				dom.content(view._box, renderTable(applyFilter(parseJson(r && r.stdout))));
			}).catch(e => {
				dom.content(view._box, E('p', {}, e.message || String(e)));
			});
		};

		const makeTab = (id, label, active) => E('li', {
			'class': active ? 'cbi-tab cbi-tab-active' : 'cbi-tab',
			'click': ui.createHandlerFn(view, function(ev) {
				ev.preventDefault();
				view._filter = id;
				[...view._tabs.querySelectorAll('li')].forEach(li => {
					li.classList.remove('cbi-tab-active');
				});
				ev.currentTarget.classList.add('cbi-tab-active');
				return view._refresh();
			})
		}, E('a', { href: '#' }, label));

		view._tabs = E('ul', { 'class': 'cbi-tabmenu' }, [
			makeTab('event', _('系统事件'), true),
			makeTab('alert', _('告警'), false),
			makeTab('sample', _('状态采样'), false),
			makeTab('all', _('全部'), false)
		]);

		dom.content(view._box, renderTable(applyFilter(rows || [])));

		const storageRows = (apps || []).map(a => E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' }, a.title || a.id),
			E('td', { 'class': 'td' }, E('code', {}, a.path || '')),
			E('td', { 'class': 'td' }, a.max_kb != null ? (a.max_kb + ' KB') : '—'),
			E('td', { 'class': 'td' }, a.exists ? ((a.size / 1024).toFixed(1) + ' KB') : _('尚无文件'))
		]));

		const m = new form.Map('wanalert', _('业务日志存储'),
			_('根分区空间紧张时，请把路径改到外置盘，例如 /mnt/sda1/logs/sys-alert.log。单文件超上限会轮转为 .old。'));
		view.map = m;

		const s = m.section(form.NamedSection, 'main', 'wanalert', _('系统事件 / 告警（wanalert）'));
		s.addremove = false;

		let o = s.option(form.Flag, 'log_enabled', _('写入日志'));
		o.default = o.enabled;
		o.rmempty = false;

		o = s.option(form.Value, 'log_path', _('存储路径'));
		o.placeholder = '/overlay/logs/sys-alert.log';
		o.default = '/overlay/logs/sys-alert.log';
		o.rmempty = false;

		o = s.option(form.Value, 'log_max_kb', _('单文件上限（KB）'));
		o.datatype = 'uinteger';
		o.default = '512';

		o = s.option(form.Flag, 'log_sample', _('定期写状态采样'),
			_('未超阈值也记一行 CPU/内存等，方便看趋势；占空间时关掉。'));
		o.default = o.enabled;

		const mSys = new form.Map('system');
		view.mapSys = mSys;
		m.chain('system');

		const ss = mSys.section(form.TypedSection, 'system', _('原始系统日志 logd（调试用）'));
		ss.anonymous = true;
		ss.addremove = false;
		ss.description = _('「状态 → 系统日志」里的内核/守护进程原文。默认只在内存，不必写盘。若写文件，务必放外置盘并限制大小。');

		o = ss.option(form.Value, 'log_file', _('文件路径'),
			_('留空 = 内存环形缓冲。'));
		o.optional = true;
		o.placeholder = _('留空=内存');

		o = ss.option(form.Value, 'log_size', _('文件大小（KB）'));
		o.datatype = 'uinteger';
		o.optional = true;
		o.placeholder = '64';

		poll.add(L.bind(view._refresh, view), 20);

		return Promise.all([m.render(), mSys.render()]).then(([nodeAlert, nodeSys]) => E('div', {}, [
			E('h2', {}, _('日志中心')),
			E('p', {}, _('参考爱快：日常看「系统事件 / 告警」人话记录；原始内核日志仅作排障。')),
			view._tabs,
			E('div', { 'style': 'margin:.5em 0 1em' }, [
				E('button', {
					'class': 'btn cbi-button cbi-button-action',
					'click': ui.createHandlerFn(view, view._refresh)
				}, _('刷新'))
			]),
			view._box,
			E('h3', {}, _('当前存储一览')),
			E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, _('用途')),
					E('th', { 'class': 'th' }, _('路径')),
					E('th', { 'class': 'th' }, _('上限')),
					E('th', { 'class': 'th' }, _('当前大小'))
				]),
				...storageRows
			]),
			E('hr'),
			nodeAlert,
			nodeSys
		]));
	},

	handleSave(ev) {
		const tasks = [];
		if (this.map)
			tasks.push(this.map.save());
		if (this.mapSys)
			tasks.push(this.mapSys.save());
		return Promise.all(tasks);
	},

	handleSaveApply(ev, mode) {
		return this.handleSave(ev).then(() => ui.changes.apply(mode == '0'));
	},

	handleReset() {
		const tasks = [];
		if (this.map)
			tasks.push(this.map.reset());
		if (this.mapSys)
			tasks.push(this.mapSys.reset());
		return Promise.all(tasks);
	}
});
