'use strict';
'require view';
'require uci';
'require view.status.alertmap as AlertMap';

return view.extend({
	load() {
		return uci.load('wanalert');
	},

	render() {
		this.map = AlertMap.makeMap();
		return this.map.render();
	}
});
