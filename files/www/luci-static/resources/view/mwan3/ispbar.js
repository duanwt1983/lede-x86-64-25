'use strict';
'require baseclass';
'require uci';
'require fs';
'require ui';

return baseclass.extend({
	toolbar() {
		const auto = (uci.get('isp-ip', 'main', 'auto') !== '0');
		const cron = uci.get('isp-ip', 'main', 'cron') || '17 4 * * *';
		const urlCt = uci.get('isp-ip', 'main', 'url_chinanet') || 'https://ispip.clang.cn/chinatelecom.txt';
		const urlCu = uci.get('isp-ip', 'main', 'url_unicom') || 'https://ispip.clang.cn/unicom_cnc.txt';
		const urlCm = uci.get('isp-ip', 'main', 'url_cmcc') || 'https://ispip.clang.cn/cmcc.txt';
		const urlOt = uci.get('isp-ip', 'main', 'url_other') || 'https://ispip.clang.cn/othernet.txt';

		const autoBox = E('input', { 'type': 'checkbox' });
		if (auto) autoBox.checked = true;
		const cronIn = E('input', { 'class': 'cbi-input-text', 'value': cron, 'style': 'min-width:160px' });
		const ctIn = E('input', { 'class': 'cbi-input-text', 'value': urlCt, 'style': 'width:100%;max-width:640px' });
		const cuIn = E('input', { 'class': 'cbi-input-text', 'value': urlCu, 'style': 'width:100%;max-width:640px' });
		const cmIn = E('input', { 'class': 'cbi-input-text', 'value': urlCm, 'style': 'width:100%;max-width:640px' });
		const otIn = E('input', { 'class': 'cbi-input-text', 'value': urlOt, 'style': 'width:100%;max-width:640px' });

		function ensureSection() {
			if (!uci.get('isp-ip', 'main'))
				uci.add('isp-ip', 'update', 'main');
		}

		function saveUrls() {
			ensureSection();
			uci.set('isp-ip', 'main', 'auto', autoBox.checked ? '1' : '0');
			uci.set('isp-ip', 'main', 'cron', cronIn.value || '17 4 * * *');
			uci.set('isp-ip', 'main', 'url_chinanet', ctIn.value.trim());
			uci.set('isp-ip', 'main', 'url_unicom', cuIn.value.trim());
			uci.set('isp-ip', 'main', 'url_cmcc', cmIn.value.trim());
			uci.set('isp-ip', 'main', 'url_other', otIn.value.trim());
			return uci.save().then(function() {
				return fs.exec('/usr/libexec/isp-ip-update', ['sync-cron']);
			});
		}

		const row = function(label, input) {
			return E('div', { 'style': 'margin:6px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, [
				E('label', { 'style': 'min-width:4em;font-weight:600' }, label), input
			]);
		};

		return E('div', { 'class': 'cbi-section', 'style': 'margin-bottom:16px;padding:12px;border:1px solid rgba(127,127,127,.25);border-radius:8px' }, [
			E('h3', { 'style': 'margin-top:0' }, _('运营商地址库')),
			E('p', {}, _('填写电信/联通/移动/其它的 CIDR 列表地址，下载后写入 /etc/mwan3/isp/*.cidr 并加载到下面的 IP 集。不会自动改分流规则。')),
			row(_('电信'), ctIn),
			row(_('联通'), cuIn),
			row(_('移动'), cmIn),
			row(_('其它'), otIn),
			E('div', { 'style': 'margin:10px 0 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [
				E('label', {}, [ autoBox, ' ', _('自动更新') ]),
				E('label', {}, [ _('计划任务 '), cronIn ]),
				E('button', {
					'class': 'btn cbi-button',
					'click': function(ev) {
						ev.preventDefault();
						const btn = ev.currentTarget;
						btn.disabled = true;
						return saveUrls().then(function() {
							ui.addNotification(null, E('p', {}, _('已保存更新地址和自动更新设置')), 'info');
						}).catch(function(e) {
							ui.addNotification(null, E('p', {}, e.message || String(e)), 'error');
						}).finally(function() { btn.disabled = false; });
					}
				}, _('保存设置')),
				E('button', {
					'class': 'btn cbi-button cbi-button-action',
					'click': function(ev) {
						ev.preventDefault();
						const btn = ev.currentTarget;
						btn.disabled = true;
						return saveUrls().then(function() {
							return fs.exec('/usr/libexec/isp-ip-update');
						}).then(function(r) {
							const msg = ((r && (r.stdout || r.stderr)) || _('更新完成')).toString().slice(-800);
							ui.addNotification(null, E('p', {}, msg));
							return fs.exec('/etc/init.d/mwan3', ['reload']);
						}).catch(function(e) {
							ui.addNotification(null, E('p', {}, e.message || String(e)), 'error');
						}).finally(function() {
							btn.disabled = false;
							window.location.reload();
						});
					}
				}, _('立即更新地址库'))
			])
		]);
	}
});
