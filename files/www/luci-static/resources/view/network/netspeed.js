'use strict';
'require view';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	render() {
		const lanSrc = '/lan-speed/';
		const wanOnline = L.url('admin/network/netspeedtest/onlinespeedtest');
		const wanOokla = L.url('admin/network/netspeedtest/wanspeedtest');

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('网络测速')),
			E('p', {}, _('内网测的是电脑到路由器；外网测的是路由器到运营商/公网。')),

			E('h3', {}, _('内网测速')),
			E('p', {}, _('请在局域网设备打开。测 LAN 到路由器的带宽，不是宽带账号速率。')),
			E('p', {}, [
				E('a', { 'href': lanSrc, 'target': '_blank', 'rel': 'noreferrer' }, _('新窗口打开 LibreSpeed')),
				' · ',
				E('a', { 'href': 'http://' + location.hostname + ':8989/', 'target': '_blank', 'rel': 'noreferrer' }, _('直连 :8989'))
			]),
			E('iframe', {
				'src': lanSrc,
				'style': 'width:100%;min-height:640px;border:1px solid rgba(127,127,127,.25);border-radius:10px;background:#fff;margin-bottom:24px'
			}),

			E('h3', {}, _('外网测速')),
			E('p', {}, _('在线测速走 Ookla；WAN 测速页可查看各 WAN 口测速记录（若已配置）。')),
			E('p', { 'class': 'cbi-section' }, [
				E('a', {
					'href': wanOnline,
					'class': 'btn cbi-button cbi-button-action',
					'style': 'margin-right:8px'
				}, _('在线测速 (Ookla)')),
				E('a', {
					'href': wanOokla,
					'class': 'btn cbi-button cbi-button-action'
				}, _('WAN 测速 / 日志'))
			]),
			E('iframe', {
				'src': wanOnline,
				'style': 'width:100%;min-height:720px;border:1px solid rgba(127,127,127,.25);border-radius:10px;background:#fff'
			})
		]);
	}
});
