'use strict';
'require baseclass';
'require form';
'require uci';

function wanIfaces() {
	const names = [];
	const seen = {};
	const add = sid => {
		if (!sid || typeof sid !== 'string' || seen[sid] || sid === 'loopback' || sid === 'lan' || /_6$/.test(sid) || sid === 'wan6')
			return;
		seen[sid] = true;
		names.push(sid);
	};
	uci.sections('mwan3', 'interface', function(s) {
		const sid = (s && s['.name']) || s;
		const en = uci.get('mwan3', sid, 'enabled');
		if (en === '0' || en === 'off')
			return;
		add(sid);
	});
	if (!names.length) {
		uci.sections('network', 'interface', function(s) {
			const sid = (s && s['.name']) || s;
			const proto = uci.get('network', sid, 'proto');
			if (['pppoe', 'dhcp', 'static', 'pptp', 'l2tp', '3g', 'ncm', 'qmi', 'modemmanager'].indexOf(proto) >= 0)
				add(sid);
		});
	}
	return names;
}

function findConfigSection(m) {
	const kids = m.children || [];
	for (let i = 0; i < kids.length; i++) {
		const c = kids[i];
		if (c && (c.section === 'config' || c.sectiontype === 'config'))
			return c;
	}
	return kids.length ? kids[0] : null;
}

return baseclass.extend({
	attach(m) {
		try {
			const s = findConfigSection(m);
			if (!s || typeof s.taboption !== 'function')
				return;

			const multiWan = wanIfaces().length >= 2;
			let o;

			if (multiWan) {
				o = s.taboption('basic', form.Flag, 'dns_follow_wan', _('DNS 跟随宽带（按源 IP）'),
					_('同一内网 IP 的 DNS 解析和上网从同一条当前可用的 WAN 出去。国内/远程上游共用一套，只是出口网卡不同。'));
				o.default = '1';
				o.rmempty = false;

				o = s.taboption('basic', form.Value, 'custom_bound_ms', _('多 WAN 回退超时（毫秒）'));
				o.datatype = 'uinteger';
				o.default = '200';
				o.depends('dns_follow_wan', '0');

				o = s.taboption('basic', form.Value, 'custom_sys_ms', _('系统出口回退超时（毫秒）'));
				o.datatype = 'uinteger';
				o.default = '250';
				o.depends('dns_follow_wan', '0');
			}

			o = s.taboption('basic', form.Value, 'custom_remote_or_local_ms', _('远程/国内分流超时（毫秒）'));
			o.datatype = 'uinteger';
			o.default = '400';

			o = s.taboption('basic', form.Value, 'custom_idle_timeout', _('上游空闲超时（秒）'));
			o.datatype = 'uinteger';
			o.default = '5';
			o.optional = true;
		} catch (e) {
			console.error('mosdns custom.attach', e);
		}
	}
});
