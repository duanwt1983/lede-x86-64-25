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
			E('td', { 'class': 'td', colspan: 5 },
				_('还没有报警记录。请到「系统报警」打开写入日志，并确认钉钉/阈值会触发。存储路径在「日志中心」。'))));
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
		return fs.exec('/usr/libexec/lede-log-read', ['read', 'alert', '500', 'alarm']).then(r => parseJson(r && r.stdout));
	},

	render(rows) {
		const view = this;
		view._box = E('div');
		view._refresh = function() {
			return fs.exec('/usr/libexec/lede-log-read', ['read', 'alert', '500', 'alarm']).then(r => {
				dom.content(view._box, renderTable(parseJson(r && r.stdout)));
			}).catch(e => {
				dom.content(view._box, E('p', {}, e.message || String(e)));
			});
		};
		dom.content(view._box, renderTable(rows || []));
		poll.add(L.bind(view._refresh, view), 15);

		return E('div', {}, [
			E('h2', {}, _('报警日志')),
			E('p', {}, _('线路掉线/恢复、CPU/内存/磁盘/温度/DHCP 池不足等。不含定时状态采样。钉钉机器人在「系统报警」里配。')),
			E('div', { 'style': 'margin:.5em 0 1em' }, [
				E('button', {
					'class': 'btn cbi-button cbi-button-action',
					'click': ui.createHandlerFn(view, view._refresh)
				}, _('刷新')),
				' ',
				E('a', {
					'class': 'btn cbi-button',
					'href': L.url('admin/status/wanalert')
				}, _('报警设置')),
				' ',
				E('a', {
					'class': 'btn cbi-button',
					'href': L.url('admin/status/logs')
				}, _('日志中心 / 存储路径'))
			]),
			view._box
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
