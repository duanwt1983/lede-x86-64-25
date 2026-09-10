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
		const m = new form.Map('wanalert', _('系统报警'),
			_('钉钉自定义机器人通知 WAN 异常和本机资源阈值。安全设置须与机器人页面一致：自定义关键词，或加签。采样数据同时写入日志文件。Webhook 不要泄露。'));

		let s = m.section(form.NamedSection, 'main', 'wanalert', _('钉钉机器人'));
		s.addremove = false;

		let o = s.option(form.Flag, 'enabled', _('启用钉钉推送'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.Value, 'dingtalk_webhook', _('Webhook'),
			_('群设置 → 智能群助手 → 自定义机器人。形如 https://oapi.dingtalk.com/robot/send?access_token=…'));
		o.placeholder = 'https://oapi.dingtalk.com/robot/send?access_token=';
		o.rmempty = true;

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

		s = m.section(form.NamedSection, 'main', 'wanalert', _('日志文件'));
		s.addremove = false;

		o = s.option(form.Flag, 'log_enabled', _('写入日志'));
		o.default = o.enabled;
		o.rmempty = false;

		o = s.option(form.Value, 'log_path', _('日志路径'),
			_('须为绝对路径。默认 /overlay/logs/sys-alert.log。各应用路径请到「状态 → 日志中心」统一改。目录写不了时退到 /var/log（重启会丢）。U 盘例如 /mnt/sda1/logs/sys-alert.log。'));
		o.placeholder = '/overlay/logs/sys-alert.log';
		o.default = '/overlay/logs/sys-alert.log';
		o.rmempty = false;

		o = s.option(form.Value, 'log_max_kb', _('单文件上限（KB）'),
			_('超过后轮转为 同名.old。'));
		o.datatype = 'uinteger';
		o.default = '512';

		o = s.option(form.Flag, 'log_sample', _('定期记录当前数值'),
			_('未超阈值也会写一行 CPU/内存/负载/磁盘/温度/DHCP。'));
		o.default = o.enabled;

		o = s.option(form.Value, 'check_interval', _('检查间隔（秒）'),
			_('最短 30 秒。'));
		o.datatype = 'uinteger';
		o.default = '60';

		s = m.section(form.NamedSection, 'main', 'wanalert', _('资源阈值'));
		s.addremove = false;

		o = s.option(form.Flag, 'alert_dhcp', _('DHCP 池不足时报警'));
		o.default = o.enabled;

		o = s.option(form.Value, 'dhcp_remain', _('剩余地址少于（个）'),
			_('统计 dnsmasq 各 DHCP 池：/tmp/dhcp.leases 中落在地址段内的租约。'));
		o.datatype = 'uinteger';
		o.default = '8';
		o.depends('alert_dhcp', '1');

		o = s.option(form.Flag, 'alert_cpu', _('CPU 过高时报警'));
		o.default = o.enabled;

		o = s.option(form.Value, 'cpu_percent', _('CPU 使用率（%）'));
		o.datatype = 'range(1,100)';
		o.default = '90';
		o.depends('alert_cpu', '1');

		o = s.option(form.Flag, 'alert_load', _('系统负载过高时报警'));
		o.default = o.enabled;

		o = s.option(form.Value, 'load_warn', _('1 分钟负载'),
			_('与 uptime / /proc/loadavg 第一个数字比较。x86 多核能适当调高。'));
		o.default = '2.00';
		o.depends('alert_load', '1');

		o = s.option(form.Flag, 'alert_mem', _('内存不足时报警'));
		o.default = o.enabled;

		o = s.option(form.Value, 'mem_percent', _('内存使用率（%）'),
			_('按 MemAvailable 计算。'));
		o.datatype = 'range(1,100)';
		o.default = '90';
		o.depends('alert_mem', '1');

		o = s.option(form.Flag, 'alert_disk', _('磁盘空间不足时报警'));
		o.default = o.enabled;

		o = s.option(form.Value, 'disk_percent', _('磁盘已用（%）'));
		o.datatype = 'range(1,100)';
		o.default = '90';
		o.depends('alert_disk', '1');

		o = s.option(form.DynamicList, 'disk_path', _('检查路径'),
			_('对每个路径所在文件系统检查一次。默认 / 与 /overlay。'));
		o.default = '/';
		o.depends('alert_disk', '1');

		o = s.option(form.Flag, 'alert_temp', _('温度过高时报警'));
		o.default = o.enabled;

		o = s.option(form.Value, 'temp_c', _('温度（℃）'),
			_('与概览相同：读取 /sys/class/hwmon/*/temp*_input 和 thermal_zone。没有温度源则跳过。'));
		o.datatype = 'uinteger';
		o.default = '80';
		o.depends('alert_temp', '1');

		return m.render();
	}
});
