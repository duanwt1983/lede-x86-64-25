'use strict';
'require view';
'require form';
'require fs';
'require ui';
'require uci';

return view.extend({
	load() {
		return uci.load('wanalert');
	},

	render() {
		const m = new form.Map('wanalert', _('线路报警'),
			_('通过钉钉自定义机器人发送 WAN 异常通知。安全设置须与机器人页面一致：自定义关键词，或加签（SEC 开头密钥）。不要使用 IP 段（家用宽带地址会变）。Webhook 不要泄露。'));

		const s = m.section(form.NamedSection, 'main', 'wanalert', _('钉钉机器人'));
		s.addremove = false;

		let o = s.option(form.Flag, 'enabled', _('启用报警'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.Value, 'dingtalk_webhook', _('Webhook'),
			_('群设置 → 智能群助手 → 自定义机器人。形如 https://oapi.dingtalk.com/robot/send?access_token=…'));
		o.placeholder = 'https://oapi.dingtalk.com/robot/send?access_token=';
		o.rmempty = false;

		o = s.option(form.ListValue, 'security', _('安全设置（与钉钉机器人一致）'));
		o.value('keyword', _('自定义关键词'));
		o.value('sign', _('加签'));
		o.default = 'keyword';
		o.rmempty = false;

		o = s.option(form.Value, 'keyword', _('自定义关键词'),
			_('消息正文必须包含此词，否则钉钉会拒绝。默认「线路」。'));
		o.default = '线路';
		o.depends('security', 'keyword');

		o = s.option(form.Value, 'dingtalk_secret', _('加签密钥'),
			_('机器人安全设置里 SEC 开头的字符串。'));
		o.password = true;
		o.depends('security', 'sign');

		o = s.option(form.DynamicList, 'at_mobile', _('提醒手机号'),
			_('群内成员的钉钉绑定手机号，报警时 @ 对方。可留空。'));
		o.optional = true;

		o = s.option(form.Value, 'extra_text', _('附加说明'),
			_('每条报警末尾追加的文字，例如机房位置。'));
		o.optional = true;

		o = s.option(form.Flag, 'alert_down', _('线路掉线时报警'));
		o.default = o.enabled;

		o = s.option(form.Flag, 'alert_up', _('线路恢复时通知'));
		o.default = o.enabled;

		o = s.option(form.Flag, 'alert_all_down', _('全部 WAN 掉线时加发一条'));
		o.default = o.enabled;

		o = s.option(form.Value, 'cooldown', _('同一事件冷却（秒）'),
			_('避免反复抖动刷屏。钉钉每机器人每分钟最多约 20 条。'));
		o.datatype = 'uinteger';
		o.default = '120';

		o = s.option(form.Button, '_test', _('发送测试消息'));
		o.inputtitle = _('发送测试');
		o.inputstyle = 'apply';
		o.onclick = function() {
			return m.save().then(function() {
				return fs.exec('/usr/sbin/wan-alert', ['test', 'manual']);
			}).then(function(res) {
				const out = ((res && (res.stdout || res.stderr)) || '').trim();
				if (res && res.code)
					ui.addNotification(null, E('p', _('发送失败') + (out ? ': ' + out : '')), 'error');
				else
					ui.addNotification(null, E('p', _('已请求发送。请到钉钉群确认。') + (out ? ' ' + out : '')), 'info');
			}).catch(e => {
				ui.addNotification(null, E('p', _('发送失败: %s').format(e.message)), 'error');
			});
		};

		return m.render();
	}
});
