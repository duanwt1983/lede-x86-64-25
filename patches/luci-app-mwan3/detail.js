'use strict';
'require view';
'require rpc';
'require poll';
'require dom';
'require ui';
'require mwan3.components as components';

const callMwan3Status = rpc.declare({
	object: 'mwan3',
	method: 'status',
	params: ['section'],
	expect: {},
});

function trackingInfo(d) {
	switch (d.tracking) {
		case 'active':   return { label: _('Active'),   severity: 'success' };
		case 'paused':   return { label: _('Paused'),   severity: 'muted' };
		case 'down':     return { label: _('Down'),     severity: 'danger' };
		case 'disabled': return { label: _('Disabled'), severity: 'muted' };
		default:         return { label: d.tracking || _('Unknown'), severity: 'muted' };
	}
}

/* LuCI ui.Table.update() unwraps [sortKey, node] only when painting cells.
   deriveSortKey() still receives the raw cell. A Text node has no hasAttribute,
   so components.text() in a sortable column crashes the Status page. */
function sortCell(sortKey, node) {
	if (node && node.nodeType === 3)
		node = E('span', {}, [node]);
	if (node && node.nodeType === 1)
		node.setAttribute('data-value', String(sortKey));
	return node;
}

function asTrackList(trackIps) {
	if (Array.isArray(trackIps))
		return trackIps;
	if (trackIps && typeof trackIps === 'object')
		return Object.keys(trackIps).map(function(k) {
			var v = trackIps[k];
			if (v == null || typeof v !== 'object')
				return { ip: String(v != null ? v : k) };
			if (v.ip == null)
				v.ip = k;
			return v;
		});
	return [];
}

function buildTrackRows(d, trackIps) {
	var statusOrder = { 'up': 0, 'down': 1, 'skipped': 2 };
	var sorted = trackIps.slice().sort(function(a, b) {
		var oa = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 3;
		var ob = statusOrder[b.status] !== undefined ? statusOrder[b.status] : 3;
		return oa - ob;
	});

	var isDisabled = d.status !== 'online' && d.status !== 'offline' && d.status !== 'notracking';

	return sorted.map(function(t) {
		var statusRaw, statusEl;
		if (isDisabled) {
			statusRaw = 3;
			statusEl = components.statusText(_('Disabled'), 'muted', true);
		} else if (t.status === 'up') {
			statusRaw = 0;
			statusEl = components.statusText(_('Up'), 'success', true);
		} else if (t.status === 'down') {
			statusRaw = 1;
			statusEl = components.statusText(_('Down'), 'danger', true);
		} else if (t.status === 'skipped') {
			statusRaw = 2;
			statusEl = components.statusText(_('Ignored'), 'muted', true);
		} else {
			statusRaw = 3;
			statusEl = components.statusText(t.status || _('Unknown'), 'muted', true);
		}

		var latencyKey, latencyEl, lossKey, lossEl;
		if (isDisabled) {
			latencyKey = -1;
			latencyEl = E('em', { 'class': 'mwan3-muted' }, '-');
			lossKey = -1;
			lossEl = E('em', { 'class': 'mwan3-muted' }, '-');
		} else if (!d.check_quality) {
			latencyKey = -1;
			latencyEl = E('em', { 'class': 'mwan3-muted' }, _('Not enabled'));
			lossKey = -1;
			lossEl = E('em', { 'class': 'mwan3-muted' }, _('Not enabled'));
		} else if (t.status === 'down') {
			latencyKey = 1e15;
			latencyEl = E('span', { 'class': 'mwan3-infinity' }, '\u221e');
			lossKey = Math.round(Number(t.packetloss) || 0);
			lossEl = E('span', {}, t.packetloss + '%');
		} else if (t.status === 'skipped') {
			latencyKey = -1;
			latencyEl = E('em', { 'class': 'mwan3-muted' }, '-');
			lossKey = -1;
			lossEl = E('em', { 'class': 'mwan3-muted' }, '-');
		} else {
			latencyKey = Math.round(Number(t.latency) || 0);
			latencyEl = E('span', {}, t.latency + ' ms');
			lossKey = Math.round(Number(t.packetloss) || 0);
			lossEl = E('span', {}, t.packetloss + '%');
		}

		return [
			sortCell(t.ip || '', E('span', { 'class': 'mwan3-mono' }, t.ip || '')),
			sortCell(statusRaw, statusEl),
			sortCell(latencyKey, latencyEl),
			sortCell(lossKey, lossEl),
		];
	});
}

function renderInterfacePanel(iface, d) {
	var si = components.statusInfo(d);
	var ti = trackingInfo(d);

	var header = components.card(si.severity, [
		E('strong', { 'class': 'mwan3-detail-label' }, components.text(iface)),
		components.statusText(si.label, si.severity, true),
		E('strong', { 'class': 'mwan3-detail-label' }, _('Tracking') + ':'),
		components.statusText(ti.label, ti.severity, true),
		E('strong', { 'class': 'mwan3-detail-label' }, _('Score') + ':'),
		E('strong', { 'class': 'mwan3-detail-label' }, String(d.score || 0)),
	], 'mwan3-detail-header');

	var trackIps = asTrackList(d.track_ip);
	var body;

	if (!trackIps.length) {
		body = components.emptyHint(_('No tracking IPs configured'));
	} else {
		var table = new ui.Table(
			[ _('Target IP'), _('Status'), _('Latency'), _('Packet Loss') ],
			{
				id: 'mwan3-detail-' + iface,
				sortable: true,
				classes: 'mwan3-detail-table',
				captionClasses: [ 'mwan3-col-target', 'mwan3-col-num', 'mwan3-col-num', 'mwan3-col-num' ],
			},
			components.emptyHint(_('No tracking IPs configured'))
		);
		table.update(buildTrackRows(d, trackIps));
		body = table.render();
	}

	return E('div', { 'class': 'cbi-section mwan3-section-gap' }, [ header, body ]);
}

function renderStatus(interfaces) {
	if (!interfaces)
		return [ components.emptyHint(_('No interfaces found')) ];

	return Object.keys(interfaces).map(function(iface) {
		return renderInterfacePanel(iface, interfaces[iface]);
	});
}

return view.extend({
	load: function() {
		return callMwan3Status('interfaces');
	},

	render: function(result) {
		components.loadStyle();
		result = result || {};

		var statusRegion = E('div', {}, renderStatus(result.interfaces));

		poll.add(function() {
			return callMwan3Status('interfaces').then(function(res) {
				dom.content(statusRegion, renderStatus((res || {}).interfaces));
			});
		}, 5);

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', { 'class': 'mwan3-title' }, _('MultiWAN Manager - Status')),
			statusRegion,
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null,
});
