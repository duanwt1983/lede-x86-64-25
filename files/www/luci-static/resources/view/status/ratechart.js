'use strict';
'require baseclass';

function grid(svg, w, h) {
	for (let i = 1; i <= 3; i++) {
		const y = (h / 4) * i;
		const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
		l.setAttribute('x1', '0');
		l.setAttribute('x2', String(w));
		l.setAttribute('y1', String(y));
		l.setAttribute('y2', String(y));
		l.setAttribute('stroke', 'rgba(127,127,127,.22)');
		l.setAttribute('stroke-width', '1');
		svg.appendChild(l);
	}
}

function poly(svg, arr, w, h, max, color, dash) {
	if (!arr || !arr.length)
		arr = [0, 0];
	const pts = arr.map((v, i) => {
		const x = arr.length <= 1 ? 0 : (i / (arr.length - 1)) * w;
		const y = h - 4 - ((Number(v) || 0) / max) * (h - 10);
		return x.toFixed(1) + ',' + y.toFixed(1);
	}).join(' ');
	const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
	p.setAttribute('fill', 'none');
	p.setAttribute('stroke', color);
	p.setAttribute('stroke-width', '2.2');
	if (dash)
		p.setAttribute('stroke-dasharray', '6 4');
	p.setAttribute('points', pts);
	svg.appendChild(p);
}

function svgBox(w, h) {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
	svg.setAttribute('class', 'ratechart');
	svg.setAttribute('preserveAspectRatio', 'none');
	svg.style.width = '100%';
	svg.style.height = h + 'px';
	svg.style.display = 'block';
	svg.style.background = 'rgba(127,127,127,.06)';
	svg.style.borderRadius = '8px';
	grid(svg, w, h);
	return svg;
}

return baseclass.extend({
	COLORS: ['#16a34a', '#2563eb', '#ea580c', '#7c3aed', '#db2777', '#0891b2'],

	spark(rxHist, txHist) {
		const w = 720, h = 150;
		const svg = svgBox(w, h);
		const rx = rxHist && rxHist.length ? rxHist : [0, 0];
		const tx = txHist && txHist.length ? txHist : [0, 0];
		const max = Math.max(1, ...rx, ...tx);
		poly(svg, rx, w, h, max, '#16a34a', false);
		poly(svg, tx, w, h, max, '#2563eb', true);
		return svg;
	},

	combo(series) {
		const w = 800, h = 200;
		const svg = svgBox(w, h);
		const all = [0];
		(series || []).forEach(s => {
			(s.rx || []).forEach(v => all.push(v));
			(s.tx || []).forEach(v => all.push(v));
		});
		const max = Math.max(1, ...all);
		(series || []).forEach(s => {
			poly(svg, s.rx, w, h, max, s.color, false);
			poly(svg, s.tx, w, h, max, s.color, true);
		});
		return svg;
	}
});
