'use strict';
'require view';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	render() {
		const lanSrc = '/lan-speed/';
		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('内网测速')),
			E('p', {}, _('请在局域网设备打开。测的是 LAN 到路由器的带宽，不是宽带账号速率。')),
			E('div', { 'id': 'ns-lan', 'class': 'cbi-section' }, [
				E('iframe', {
					'src': lanSrc,
					'style': 'width:100%;min-height:640px;border:1px solid rgba(127,127,127,.25);border-radius:10px;background:#fff'
				})
			])
		]);
	}
});
