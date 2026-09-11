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

		const lanPane = E('div', { 'id': 'ns-lan', 'class': 'cbi-section' }, [
			E('p', {}, _('请在局域网设备打开。测 LAN 到路由器的带宽，不是宽带账号速率。')),
			E('p', {}, [
				E('a', { 'href': lanSrc, 'target': '_blank', 'rel': 'noreferrer' }, _('新窗口打开 LibreSpeed')),
				' · ',
				E('a', { 'href': 'http://' + location.hostname + ':8989/', 'target': '_blank', 'rel': 'noreferrer' }, _('直连 :8989'))
			]),
			E('iframe', {
				'src': lanSrc,
				'style': 'width:100%;min-height:640px;border:1px solid rgba(127,127,127,.25);border-radius:10px;background:#fff'
			})
		]);

		const wanPane = E('div', { 'id': 'ns-wan', 'class': 'cbi-section', 'style': 'display:none' }, [
			E('p', {}, _('在线测速走 Ookla；WAN 测速页可查看各 WAN 口测速记录（若已配置）。')),
			E('p', {}, [
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

		const tabLan = E('li', { 'class': 'cbi-tab cbi-tab-active' }, E('a', { 'href': '#' }, _('内网测速')));
		const tabWan = E('li', { 'class': 'cbi-tab' }, E('a', { 'href': '#' }, _('外网测速')));

		const show = which => {
			const lan = which === 'lan';
			tabLan.classList.toggle('cbi-tab-active', lan);
			tabWan.classList.toggle('cbi-tab-active', !lan);
			lanPane.style.display = lan ? '' : 'none';
			wanPane.style.display = lan ? 'none' : '';
		};

		tabLan.addEventListener('click', ev => { ev.preventDefault(); show('lan'); });
		tabWan.addEventListener('click', ev => { ev.preventDefault(); show('wan'); });

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('网络测速')),
			E('p', {}, _('内网测的是电脑到路由器；外网测的是路由器到运营商/公网。')),
			E('ul', { 'class': 'cbi-tabmenu' }, [ tabLan, tabWan ]),
			lanPane,
			wanPane
		]);
	}
});
