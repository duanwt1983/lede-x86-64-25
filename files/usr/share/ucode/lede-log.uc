'use strict';

import { open, readfile } from 'fs';
import { now_fmt, file_size } from '/usr/share/ucode/lede-metrics.uc';

function join(sep, arr) {
	let s = '';
	for (let i = 0; i < length(arr); i++) {
		if (i > 0)
			s += sep;
		s += arr[i];
	}
	return s;
}

function slice(arr, from) {
	let out = [];
	for (let i = from; i < length(arr); i++)
		push(out, arr[i]);
	return out;
}

export function ensure_dir(path) {
	let dir = replace(`${path}`, /\/[^\/]+$/, '');
	if (dir == '' || dir == path)
		dir = '/';
	system(sprintf("mkdir -p '%s' 2>/dev/null", dir));
	return dir;
}

export function rotate_if_needed(path, max_kb) {
	max_kb = +max_kb;
	if (!(max_kb > 0))
		max_kb = 512;
	if (max_kb < 32)
		max_kb = 32;
	if (file_size(path) > max_kb * 1024)
		system(sprintf("mv -f '%s' '%s.old' 2>/dev/null", path, path));
}

/* line: TIME|LEVEL|CAT|TITLE|DETAIL */
export function append_event(path, max_kb, level, cat, title, detail) {
	if (path == null || path == '' || !match(path, /^\//))
		return null;
	ensure_dir(path);
	rotate_if_needed(path, max_kb);
	let fh = open(path, 'a');
	if (!fh) {
		let fallback = '/var/log/' + replace(path, /.*\//, '');
		if (fallback == path)
			fallback = '/var/log/lede-event.log';
		ensure_dir(fallback);
		fh = open(fallback, 'a');
		path = fallback;
	}
	if (!fh)
		return null;
	level = level || '信息';
	cat = cat || '系统';
	title = replace(`${title || ''}`, /\|/g, '/');
	detail = replace(`${detail || ''}`, /\|/g, '/');
	fh.write(sprintf('%s|%s|%s|%s|%s\n', now_fmt(), level, cat, title, detail));
	fh.close();
	return path;
}

export function parse_line(line) {
	line = replace(`${line}`, /\r$/, '');
	if (line == '')
		return null;
	let p = split(line, '|');
	if (length(p) >= 5) {
		return {
			time: p[0],
			level: p[1],
			cat: p[2],
			title: p[3],
			detail: join('|', slice(p, 4))
		};
	}
	/* legacy: "TIME KIND msg..." */
	let m = match(line, /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+(\S+)\s+(.*)$/);
	if (m) {
		let kind = m[2];
		let level = '信息';
		let cat = '系统';
		if (kind == 'ALERT') { level = '中等'; cat = '资源'; }
		else if (kind == 'WAN') { level = '严重'; cat = '线路'; }
		else if (kind == 'TEST') { level = '一般'; cat = '系统'; }
		return { time: m[1], level, cat, title: kind, detail: m[3] };
	}
	return { time: '', level: '信息', cat: '系统', title: '原始', detail: line };
}

export function read_tail(path, max_lines) {
	max_lines = +max_lines;
	if (!(max_lines > 0))
		max_lines = 200;
	if (max_lines > 2000)
		max_lines = 2000;
	if (path == null || path == '' || !match(path, /^\//))
		return [];
	let text = readfile(path);
	if (text == null || text == '')
		return [];
	let lines = split(text, '\n');
	let out = [];
	let start = length(lines) - max_lines;
	if (start < 0)
		start = 0;
	for (let i = start; i < length(lines); i++) {
		let row = parse_line(lines[i]);
		if (row)
			push(out, row);
	}
	return out;
}
