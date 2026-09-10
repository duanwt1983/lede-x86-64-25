'use strict';
'require view';
'require fs';
'require ui';
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
	const body = (rows || []).slice().reverse().map(r => E('tr', { 'class': 'tr', 'title': r.raw || '' }, [
		E('td', { 'class': 'td', 'style': 'white-space:nowrap' }, r.time || ''),
		E('td', { 'class': 'td' }, E('span', { 'class': 'label label-' + levelClass(r.level) }, r.level || '')),
		E('td', { 'class': 'td' }, r.cat || ''),
		E('td', { 'class': 'td' }, E('strong', {}, r.title || '')),
		E('td', { 'class': 'td' }, r.detail || '')
	]));
	if (!body.length)
		body.push(E('tr', { 'class': 'tr' },
			E('td', { 'class': 'td', colspan: 5 }, _('暂无系统日志。'))));
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

return view.extend({
	load() {
		return fs.exec('/usr/libexec/lede-log-read', ['read', 'syslog', '400', 'all']).then(r => parseJson(r && r.stdout));
	},

	render(rows) {
		const view = this;
		view._filter = 'all';
		view._box = E('div');

		view._refresh = function() {
			return fs.exec('/usr/libexec/lede-log-read', ['read', 'syslog', '400', view._filter]).then(r => {
				dom.content(view._box, renderTable(parseJson(r && r.stdout)));
			});
		};

		const tab = (id, label, on) => E('li', {
			'class': on ? 'cbi-tab cbi-tab-active' : 'cbi-tab',
			'click': ui.createHandlerFn(view, function(ev) {
				ev.preventDefault();
				view._filter = id;
				[...view._tabs.querySelectorAll('li')].forEach(li => li.classList.remove('cbi-tab-active'));
				ev.currentTarget.classList.add('cbi-tab-active');
				return view._refresh();
			})
		}, E('a', { href: '#' }, label));

		view._tabs = E('ul', { 'class': 'cbi-tabmenu' }, [
			tab('all', _('全部'), true),
			tab('net', _('网络'), false),
			tab('dhcp', _('DHCP'), false),
			tab('auth', _('登录'), false),
			tab('kern', _('内核'), false),
			tab('svc', _('服务'), false),
			tab('alert', _('严重/警告'), false)
		]);

		dom.content(view._box, renderTable(rows || []));
		poll.add(L.bind(view._refresh, view), 20);

		return E('div', {}, [
			E('h2', {}, _('系统日志')),
			E('p', {}, _('已按「发生了什么」翻译。悬停一行可看内核原文。需要改存储路径请到「状态 → 日志中心」。')),
			view._tabs,
			E('div', { 'style': 'margin:.5em 0' }, [
				E('button', {
					'class': 'btn cbi-button cbi-button-action',
					'click': ui.createHandlerFn(view, view._refresh)
				}, _('刷新'))
			]),
			view._box
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
