'use strict';
'require uci';
'require form';

function ip2n(s) {
	const p = String(s || '').split('.');
	if (p.length !== 4)
		return null;
	const n = p.map(x => Number(x));
	if (n.some(x => !isFinite(x) || x < 0 || x > 255))
		return null;
	return ((n[0] << 24) >>> 0) + (n[1] << 16) + (n[2] << 8) + n[3];
}

function n2ip(n) {
	n = n >>> 0;
	return [ (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255 ].join('.');
}

function netBase(ip, mask) {
	const a = ip2n(ip), m = ip2n(mask);
	if (a == null || m == null)
		return null;
	return (a & m) >>> 0;
}

function dhcpOpts(sid) {
	return L.toArray(uci.get('dhcp', sid, 'dhcp_option'));
}

function optValues(sid, code) {
	const pref = code + ',';
	for (const x of dhcpOpts(sid)) {
		const s = String(x);
		if (s.indexOf(pref) === 0)
			return s.slice(pref.length).split(',').map(t => t.trim()).filter(Boolean);
	}
	return [];
}

function rewriteOpt(sid, code, values) {
	const pref = code + ',';
	const keep = dhcpOpts(sid).filter(x => String(x).indexOf(pref) !== 0);
	if (values && values.length)
		keep.push(code + ',' + values.join(','));
	if (keep.length)
		uci.set('dhcp', sid, 'dhcp_option', keep);
	else
		uci.unset('dhcp', sid, 'dhcp_option');
}

function dnsmasqSid() {
	const secs = uci.sections('dhcp', 'dnsmasq') || [];
	return secs.length ? secs[0]['.name'] : null;
}

function lanMask(ifcName) {
	return uci.get('network', ifcName, 'netmask') || '255.255.255.0';
}

function lanIp(ifcName) {
	return uci.get('network', ifcName, 'ipaddr');
}

return L.Class.extend({
	attach(ss, ifc) {
		if (!ss || !ifc || ifc.getName() !== 'lan')
			return;

		const hideStock = child => {
			if (!child)
				return;
			if (child.option === 'start' || child.option === 'limit') {
				child.hidden = true;
				child.readonly = true;
			}
		};
		for (const child of ss.children || [])
			hideStock(child);
		if (ss.tabs) {
			Object.keys(ss.tabs).forEach(tab => {
				const items = ss.tabs[tab];
				if (Array.isArray(items))
					items.forEach(hideStock);
			});
		}

		const ifcName = ifc.getName();

		let so = ss.taboption('ipv4', form.Value, '_pool_start', _('起始地址'),
			_('池内第一个可分配地址，例如 192.168.9.100。'));
		so.datatype = 'ip4addr';
		so.optional = true;
		so.cfgvalue = function(section_id) {
			const ip = lanIp(ifcName);
			const mask = lanMask(ifcName);
			const start = Number(uci.get('dhcp', section_id, 'start') || 100);
			const base = netBase(ip, mask);
			if (base == null)
				return '';
			return n2ip(base + start);
		};
		so.write = function() {};
		so.remove = function() {};

		so = ss.taboption('ipv4', form.Value, '_pool_end', _('结束地址'),
			_('池内最后一个可分配地址，例如 192.168.9.200。'));
		so.datatype = 'ip4addr';
		so.optional = true;
		so.cfgvalue = function(section_id) {
			const ip = lanIp(ifcName);
			const mask = lanMask(ifcName);
			const start = Number(uci.get('dhcp', section_id, 'start') || 100);
			const limit = Number(uci.get('dhcp', section_id, 'limit') || 150);
			const base = netBase(ip, mask);
			if (base == null)
				return '';
			return n2ip(base + start + limit - 1);
		};
		so.validate = function(section_id, value) {
			if (!value)
				return true;
			const startIp = this.section.formvalue(section_id, '_pool_start');
			const mask = this.section.formvalue(section_id, '_pool_mask') || lanMask(ifcName);
			const ip = lanIp(ifcName);
			const base = netBase(ip, mask);
			const a = ip2n(startIp), b = ip2n(value), m = ip2n(mask);
			if (base == null || a == null || b == null || m == null)
				return _('请填写有效的起始和结束地址');
			if (((a & m) >>> 0) !== base || ((b & m) >>> 0) !== base)
				return _('起始/结束地址必须在 LAN 网段内');
			if (b < a)
				return _('结束地址不能小于起始地址');
			return true;
		};
		so.write = function(section_id, value) {
			const startIp = this.section.formvalue(section_id, '_pool_start');
			const mask = this.section.formvalue(section_id, '_pool_mask') || lanMask(ifcName);
			const ip = lanIp(ifcName);
			const base = netBase(ip, mask);
			const a = ip2n(startIp), b = ip2n(value);
			if (base == null || a == null || b == null || b < a)
				return;
			uci.set('dhcp', section_id, 'start', String(a - base));
			uci.set('dhcp', section_id, 'limit', String(b - a + 1));
		};

		so = ss.taboption('ipv4', form.Value, '_pool_mask', _('掩码'),
			_('写入 LAN 接口。客户端默认也用这个掩码。'));
		so.datatype = 'ip4addr';
		so.optional = true;
		so.cfgvalue = () => lanMask(ifcName);
		so.write = function(section_id, value) {
			if (value)
				uci.set('network', ifcName, 'netmask', value);
			uci.unset('dhcp', section_id, 'netmask');
		};

		so = ss.taboption('ipv4', form.Value, '_pool_gw', _('网关'),
			_('留空 = 路由器 LAN 地址。'));
		so.datatype = 'ip4addr';
		so.optional = true;
		so.placeholder = lanIp(ifcName) || '192.168.9.1';
		so.cfgvalue = function(section_id) {
			return optValues(section_id, '3')[0] || '';
		};
		so.write = function(section_id, value) {
			rewriteOpt(section_id, '3', value ? [ value ] : null);
		};
		so.remove = function(section_id) {
			rewriteOpt(section_id, '3', null);
		};

		so = ss.taboption('ipv4', form.DynamicList, '_pool_dns', _('DNS'),
			_('留空 = 路由器自己。可填多个。'));
		so.datatype = 'ip4addr';
		so.optional = true;
		so.cfgvalue = function(section_id) {
			return optValues(section_id, '6');
		};
		so.write = function(section_id, value) {
			const list = L.toArray(value).filter(Boolean);
			rewriteOpt(section_id, '6', list.length ? list : null);
		};
		so.remove = function(section_id) {
			rewriteOpt(section_id, '6', null);
		};

		so = ss.taboption('ipv4', form.DynamicList, 'exclude', _('排除的 IP'),
			_('这些地址不会动态分配。可写单个 IP，或一段 192.168.9.80-192.168.9.90。'));
		so.optional = true;
		so.placeholder = '192.168.9.50';

		so = ss.taboption('ipv4', form.Flag, '_sequential_ip', _('顺序分配'),
			_('从池内最低可用地址依次分配。关闭时按 MAC 哈希，租约过期后地址更不容易变。'));
		so.optional = true;
		so.default = so.disabled;
		so.cfgvalue = function() {
			const sid = dnsmasqSid();
			return sid ? uci.get('dhcp', sid, 'sequential_ip') : null;
		};
		so.write = function(section_id, value) {
			const sid = dnsmasqSid();
			if (!sid)
				return;
			if (value === '1')
				uci.set('dhcp', sid, 'sequential_ip', '1');
			else
				uci.unset('dhcp', sid, 'sequential_ip');
		};
		so.remove = function() {
			const sid = dnsmasqSid();
			if (sid)
				uci.unset('dhcp', sid, 'sequential_ip');
		};
	}
});
