'use strict';
'require view';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	render() {
		const lanSrc = '/lan-speed/';
		const wanSrc = L.url('admin/network/netspeedtest/onlinespeedtest');

		const lanPane = E('div', { 'id': 'ns-lan', 'class': 'cbi-section' }, [
			E('p', {}, _('请在局域网设备打开。测 LAN 到路由器的带宽，不是宽带账号速率。')),
			E('iframe', {
				'src': lanSrc,
				'style': 'width:100%;min-height:640px;border:1px solid rgba(127,127,127,.25);border-radius:10px;background:#fff'
			})
		]);

		const wanFrame = E('iframe', {
			'id': 'ns-wan-frame',
			'src': wanSrc,
			'style': 'width:100%;min-height:780px;border:0;background:#fff'
		});

		const hideChrome = () => {
			try {
				const doc = wanFrame.contentDocument;
				if (!doc || !doc.head) return;
				if (doc.getElementById('ns-embed-css')) return;
				const st = doc.createElement('style');
				st.id = 'ns-embed-css';
				st.textContent = [
					'header,.main-left,#mainmenu,.nav,.showSide,.mobile-show,.cbi-tabmenu,',
					'.breadcrumbs,.breadcrumb,footer,.cbi-page-actions,#qmenu,.logout,',
					'.brand,.logo,.container > .title,h2 { display:none !important; }',
					'.main,.main-right,.container,.cbi-map { margin:0 !important; padding:0 !important;',
					'  width:100% !important; max-width:none !important; float:none !important; }',
					'.main-right { margin-left:0 !important; }',
					'body { background:transparent !important; }'
				].join('\n');
				doc.head.appendChild(st);
			} catch (e) {}
		};
		wanFrame.addEventListener('load', hideChrome);

		const wanPane = E('div', { 'id': 'ns-wan', 'class': 'cbi-section', 'style': 'display:none' }, [
			wanFrame
		]);

		const tabLan = E('li', { 'class': 'cbi-tab cbi-tab-active' }, E('a', { 'href': '#' }, _('内网测速')));
		const tabWan = E('li', { 'class': 'cbi-tab' }, E('a', { 'href': '#' }, _('外网测速')));

		const show = which => {
			const lan = which === 'lan';
			tabLan.classList.toggle('cbi-tab-active', lan);
			tabWan.classList.toggle('cbi-tab-active', !lan);
			lanPane.style.display = lan ? '' : 'none';
			wanPane.style.display = lan ? 'none' : '';
			if (!lan) setTimeout(hideChrome, 200);
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
