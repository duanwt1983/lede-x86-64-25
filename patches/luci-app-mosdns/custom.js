'use strict';
'require form';
'require uci';

const CUSTOM = '/etc/mosdns/config_custom.yaml';

const LOCAL_DNS = [
	['223.5.5.5', '阿里 DNS (223.5.5.5)'],
	['223.6.6.6', '阿里 DNS (223.6.6.6)'],
	['119.29.29.29', '腾讯 DNS (119.29.29.29)'],
	['119.28.28.28', '腾讯 DNS (119.28.28.28)'],
	['180.76.76.76', '百度 DNS (180.76.76.76)'],
	['114.114.114.114', '114 DNS'],
	['114.114.115.115', '114 DNS 备用'],
	['180.184.1.1', '火山引擎 DNS'],
	['1.12.12.12', 'DNSPod (1.12.12.12)'],
	['https://dns.alidns.com/dns-query', '阿里 DoH'],
	['https://doh.pub/dns-query', '腾讯 DoH'],
	['https://doh.360.cn/dns-query', '360 DoH'],
	['tls://dns.alidns.com', '阿里 DoT'],
	['tls://dot.pub', '腾讯 DoT'],
	['quic://dns.alidns.com', '阿里 DoQ'],
	['h3://dns.alidns.com/dns-query', '阿里 DoH3']
];

const REMOTE_DNS = [
	['tls://8.8.8.8', 'Google DoT (8.8.8.8)'],
	['tls://8.8.4.4', 'Google DoT (8.8.4.4)'],
	['tls://1.1.1.1', 'Cloudflare DoT (1.1.1.1)'],
	['tls://1.0.0.1', 'Cloudflare DoT (1.0.0.1)'],
	['tls://9.9.9.9', 'Quad9 DoT (9.9.9.9)'],
	['tls://149.112.112.112', 'Quad9 DoT (149.112.112.112)'],
	['tls://208.67.222.222', 'Cisco DoT (208.67.222.222)'],
	['tls://208.67.220.220', 'Cisco DoT (208.67.220.220)'],
	['https://dns.google/dns-query', 'Google DoH'],
	['https://cloudflare-dns.com/dns-query', 'Cloudflare DoH'],
	['https://dns.quad9.net/dns-query', 'Quad9 DoH']
];

function fillDns(o, list) {
	list.forEach(pair => o.value(pair[0], pair[1]));
}

function wanIfaces() {
	const names = [];
	const seen = {};
	const add = sid => {
		if (!sid || seen[sid] || sid === 'loopback' || sid === 'lan' || /_6$/.test(sid) || sid === 'wan6')
			return;
		seen[sid] = true;
		names.push(sid);
	};
	uci.sections('mwan3', 'interface', sid => {
		const en = uci.get('mwan3', sid, 'enabled');
		if (en === '0' || en === 'off')
			return;
		add(sid);
	});
	if (!names.length) {
		uci.sections('network', 'interface', sid => {
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
		if (kids[i] && kids[i].section === 'config')
			return kids[i];
	}
	return null;
}

function detachFromMap(m, section) {
	const kids = m.children || [];
	const i = kids.indexOf(section);
	if (i >= 0)
		kids.splice(i, 1);
}

function fillWanSection(w) {
	w.anonymous = true;
	w.addremove = true;
	w.addbtntitle = _('添加 WAN DNS');

	let n = w.option(form.ListValue, 'network', _('网络接口'));
	n.rmempty = false;
	const ifaces = wanIfaces();
	if (ifaces.length)
		ifaces.forEach(name => n.value(name));
	else
		n.value('', _('（暂无 WAN，请先配置网络或多线负载）'));

	n = w.option(form.MultiValue, 'local_dns', _('国内上游'));
	n.rmempty = false;
	fillDns(n, LOCAL_DNS);

	n = w.option(form.MultiValue, 'remote_dns', _('远程上游'));
	n.rmempty = false;
	fillDns(n, REMOTE_DNS);

	n = w.option(form.Value, 'idle_timeout', _('空闲超时（秒）'));
	n.datatype = 'uinteger';
	n.default = '5';
	n.optional = true;
}

return {
	attach(m) {
		const s = findConfigSection(m);
		if (!s || typeof s.taboption !== 'function')
			return;

		let o = s.taboption('basic', form.Value, 'custom_bound_ms', _('多 WAN 回退超时（毫秒）'));
		o.datatype = 'uinteger';
		o.default = '200';
		o.depends('configfile', CUSTOM);

		o = s.taboption('basic', form.Value, 'custom_sys_ms', _('系统出口回退超时（毫秒）'));
		o.datatype = 'uinteger';
		o.default = '250';
		o.depends('configfile', CUSTOM);

		o = s.taboption('basic', form.Value, 'custom_remote_or_local_ms', _('远程/国内分流超时（毫秒）'));
		o.datatype = 'uinteger';
		o.default = '400';
		o.depends('configfile', CUSTOM);

		if (form.SectionValue) {
			o = s.taboption('basic', form.SectionValue, '_wan_dns', _('WAN DNS 出口'),
				_('默认一条即可。有多条宽带时点「添加」再选对应接口。'));
			o.depends('configfile', CUSTOM);
			const w = new form.TypedSection(m, 'wan');
			detachFromMap(m, w);
			fillWanSection(w);
			o.subsection = w;
		} else {
			const w = m.section(form.TypedSection, 'wan', _('WAN DNS 出口'),
				_('默认一条即可。有多条宽带时点「添加」再选对应接口。'));
			w.depends({ 'config.configfile': CUSTOM });
			fillWanSection(w);
		}
	}
};
