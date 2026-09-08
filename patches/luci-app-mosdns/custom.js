'use strict';
'require form';
'require fs';
'require uci';
'require view';

return view.extend({
	load() {
		return uci.load(['mosdns', 'network']);
	},

	handleSaveApply(ev, mode) {
		uci.set('mosdns', 'config', 'configfile', '/etc/mosdns/config_custom.yaml');
		return this.super('handleSaveApply', [ev, mode]).then(() =>
			fs.exec('/etc/init.d/mosdns', ['restart']));
	},

	handleSave(ev) {
		uci.set('mosdns', 'config', 'configfile', '/etc/mosdns/config_custom.yaml');
		return this.super('handleSave', [ev]);
	},

	render() {
		const m = new form.Map('mosdns', 'MosDNS 自定义配置',
			'本页参数写入 UCI，MosDNS 启动时生成 /etc/mosdns/config_custom.yaml（不再在网页里改 YAML）。保存后会切到自定义配置并重启 MosDNS。');

		const s = m.section(form.NamedSection, 'config', 'mosdns', '通用');
		s.addremove = false;

		let o = s.option(form.Value, 'listen_port', 'DNS 监听端口');
		o.datatype = 'port';
		o.default = '5335';

		o = s.option(form.Value, 'listen_port_api', 'API / 统计端口');
		o.datatype = 'port';
		o.default = '9091';
		o.description = '统计页读取此端口，须与生成文件里的 api.http 一致。';

		o = s.option(form.ListValue, 'log_level', '日志级别');
		o.value('debug', 'debug');
		o.value('info', 'info');
		o.value('warn', 'warn');
		o.value('error', 'error');
		o.default = 'info';

		o = s.option(form.Value, 'cache_size', '缓存条数');
		o.datatype = 'uinteger';
		o.default = '20000';

		o = s.option(form.Value, 'lazy_cache_ttl', 'Lazy cache TTL（秒）');
		o.datatype = 'uinteger';
		o.default = '86400';

		o = s.option(form.Value, 'stats_capacity', '统计环形缓冲');
		o.datatype = 'uinteger';
		o.default = '2000';

		o = s.option(form.Flag, 'prefer_ipv4', '优先 IPv4');
		o.default = o.enabled;

		o = s.option(form.Value, 'custom_bound_ms', '多 WAN 回退超时（毫秒）');
		o.datatype = 'uinteger';
		o.default = '200';
		o.description = '多条 WAN 绑定时，等这么久再试下一条出口。';

		o = s.option(form.Value, 'custom_sys_ms', '未绑定回退超时（毫秒）');
		o.datatype = 'uinteger';
		o.default = '250';
		o.description = '最后走不带 bind_to_device 的上游，跟剩余默认路由。';

		o = s.option(form.Value, 'custom_remote_or_local_ms', '远程/国内分流超时（毫秒）');
		o.datatype = 'uinteger';
		o.default = '400';

		const w = m.section(form.TypedSection, 'wan', 'WAN DNS 出口',
			'每条 WAN 一行。运营商 CGNAT（对端 IP 相同）请打开「绑定 WAN 设备」；公网独立网关可关掉绑定。');
		w.addremove = true;
		w.anonymous = true;
		w.addbtntitle = '添加 WAN';

		o = w.option(form.ListValue, 'network', '网络接口');
		o.rmempty = false;
		uci.sections('network', 'interface', sid => {
			if (sid === 'loopback' || sid === 'lan')
				return;
			o.value(sid);
		});

		o = w.option(form.Flag, 'bind_device', '绑定 WAN 设备');
		o.default = o.enabled;
		o.description = '开：查询从该接口的三层设备发出（如 pppoe-wan1）。关：不写 bind_to_device。';

		o = w.option(form.DynamicList, 'local_dns', '国内上游');
		o.datatype = 'or(ipaddr,string)';
		o.placeholder = '223.5.5.5';

		o = w.option(form.DynamicList, 'remote_dns', '远程上游');
		o.datatype = 'or(ipaddr,string)';
		o.placeholder = '8.8.8.8';

		o = w.option(form.Value, 'idle_timeout', '空闲超时（秒）');
		o.datatype = 'uinteger';
		o.default = '5';
		o.optional = true;

		return m.render();
	}
});
