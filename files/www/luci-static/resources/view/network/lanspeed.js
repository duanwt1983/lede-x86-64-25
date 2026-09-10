'use strict';
'require view';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	render() {
		const src = '/lan-speed/';
		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('内网测速')),
			E('p', {}, _('测的是电脑到路由器这一段，不是运营商宽带。请用局域网设备打开本页。')),
			E('p', {}, [
				E('a', { 'href': src, 'target': '_blank', 'rel': 'noreferrer' }, _('新窗口打开 LibreSpeed')),
				' · ',
				E('a', { 'href': 'http://' + location.hostname + ':8989/', 'target': '_blank', 'rel': 'noreferrer' }, _('直连 :8989'))
			]),
			E('iframe', {
				'src': src,
				'style': 'width:100%;min-height:720px;border:1px solid rgba(127,127,127,.25);border-radius:10px;background:#fff'
			})
		]);
	}
});
