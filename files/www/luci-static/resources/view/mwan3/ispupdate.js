'use strict';
'require view';
'require uci';
'require view.mwan3.ispbar as ispbar';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load() {
		return uci.load('isp-ip').catch(() => null);
	},

	render() {
		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('运营商地址库')),
			ispbar.toolbar()
		]);
	}
});
