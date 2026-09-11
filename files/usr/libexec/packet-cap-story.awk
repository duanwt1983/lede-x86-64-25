# Translate tshark -T fields (tab) into Chinese event lines.
# Field order must match packet-cap analyze_overview.
BEGIN {
	FS = "\t"
	MAX = 220
}

function first(s,    a) {
	split(s, a, ",")
	return a[1]
}

function nice(ip) {
	ip = first(ip)
	if (ip == "") return "?"
	if (ip == "255.255.255.255") return "局域网广播"
	if (ip ~ /^224\./ || ip ~ /^ff/) return "组播 " ip
	return ip
}

function svc(port) {
	port = port + 0
	if (port == 53) return "DNS"
	if (port == 80) return "HTTP"
	if (port == 443) return "HTTPS"
	if (port == 22) return "SSH"
	if (port == 25) return "SMTP"
	if (port == 110) return "POP3"
	if (port == 143) return "IMAP"
	if (port == 67 || port == 68) return "DHCP"
	if (port == 123) return "NTP"
	if (port == 443) return "HTTPS"
	if (port == 853) return "DoT"
	if (port == 1900) return "SSDP"
	if (port == 5353) return "mDNS"
	if (port == 8080) return "HTTP"
	if (port == 8443) return "HTTPS"
	return ""
}

function dportof() {
	if ($8 != "") return $8 + 0
	if ($10 != "") return $10 + 0
	return 0
}

function sportof() {
	if ($7 != "") return $7 + 0
	if ($9 != "") return $9 + 0
	return 0
}

function peerport(sip, dip, sp, dp,    a, b) {
	a = svc(dp); b = svc(sp)
	if (a != "") return dp
	if (b != "") return sp
	return dp
}

function proto_of(p, sp, dp,    s) {
	if (p ~ /^TLS/) return "HTTPS/TLS"
	if (p == "QUIC") return "QUIC/HTTP3"
	if (p == "DNS" || p == "MDNS") return p == "MDNS" ? "mDNS" : "DNS"
	if (p != "" && p != "TCP" && p != "UDP" && p != "IPv4" && p != "IPv6") return p
	s = svc(dp)
	if (s != "") return s
	s = svc(sp)
	if (s != "") return s
	if (p != "") return p
	return "IP"
}

function flush() {
	if (hold == "") return
	if (shown < MAX) {
		if (holdn > 1) print hold "  （同样动作重复 " holdn " 次）"
		else print hold
		shown++
	} else skipped++
	hold = ""; holdk = ""; holdn = 0
}

function emit(s, k) {
	if (k == "") k = s
	if (k == holdk) { holdn++; return }
	flush()
	hold = s
	holdk = k
	holdn = 1
}

function ts(t) {
	sub(/\.[0-9]+$/, "", t)
	return t
}

{
	n++
	bytes += ($15 + 0)
	t = $1
	sip = first($2); dip = first($3)
	if (sip == "") sip = first($4)
	if (dip == "") dip = first($5)
	p = $6
	if (p != "") pcnt[p]++
	sp = sportof(); dp = dportof()
	syn = $11 + 0; ack = $12 + 0; fin = $13 + 0; rst = $14 + 0
	len = $15 + 0
	arp_op = $16; arp_s = $17; arp_t = $18
	dns_r = $19; dns_n = $20; dns_a = $21; dns_aaaa = $22; dns_cname = $23
	http_m = $24; http_h = $25; http_u = $26; http_c = $27; http_ph = $28
	tls_t = $29; sni = $30
	icmp = $31; icmp6 = $32
	dhcp = $33; dhcphn = $34
	info = $35
	role = proto_of(p, sp, dp)
	src = nice(sip)
	dst = nice(dip)

	if (p == "ARP" || arp_op != "") {
		if (arp_op == "1" || arp_op == "request")
			emit(ts(t) "  " nice(arp_s != "" ? arp_s : sip) "  通过 ARP 询问：谁是 " nice(arp_t != "" ? arp_t : dip), "arp-q-" arp_s "-" arp_t)
		else if (arp_op == "2" || arp_op == "reply")
			emit(ts(t) "  " nice(arp_s != "" ? arp_s : sip) "  通过 ARP 回答：我是 " nice(arp_s != "" ? arp_s : sip), "arp-a-" arp_s)
		else
			emit(ts(t) "  " src "  通过 ARP 与 " dst " 做局域网寻址", "arp-o")
		next
	}

	if (p == "MDNS" || p == "LLMNR" || p == "NBNS") {
		emit(ts(t) "  " src "  通过 " p " 在局域网做设备发现", "disc-" p "-" sip)
		next
	}

	if (dns_n != "") {
		dns_n = first(dns_n)
		ans = first(dns_a)
		if (dns_aaaa != "") ans = (ans == "" ? dns_aaaa : ans ", " dns_aaaa)
		if (dns_cname != "") ans = (ans == "" ? "CNAME " dns_cname : ans "（别名 " dns_cname "）")
		if (dns_r == "1" || dns_r == "True" || dns_r == "true") {
			if (ans == "") ans = "无地址（可能失败或只含其他记录）"
			emit(ts(t) "  " src "  通过 " role " 返回 " dns_n " → " ans, "dns-a-" dns_n "-" ans)
		} else {
			emit(ts(t) "  " src "  通过 " role " 向 " dst " 查询 " dns_n, "dns-q-" sip "-" dns_n)
		}
		next
	}

	if (http_m == "M-SEARCH" || p == "SSDP" || dp == 3702 || p ~ /XML/) {
		emit(ts(t) "  " src "  通过 SSDP/WS-Discovery 在局域网搜索设备", "ssdp-" sip)
		next
	}

	if (http_m != "" && http_h != "") {
		emit(ts(t) "  " src "  通过 HTTP " http_m " 访问 " http_h http_u, "http-" sip "-" http_h http_u)
		next
	}
	if (http_c != "") {
		emit(ts(t) "  " src "  通过 HTTP 返回 " http_c (http_ph == "" ? "" : " " http_ph), "http-r-" sip "-" http_c)
		next
	}

	if (sni != "") {
		emit(ts(t) "  " src "  通过 HTTPS 访问站点 " sni "（对端 " dst (dp ? ":" dp : "") "，之后正文加密看不到）", "sni-" sip "-" sni)
		tls_seen[sip ":" sni] = 1
		next
	}
	if (index(tls_t, "2") > 0) {
		emit(ts(t) "  " src "  通过 HTTPS 完成加密握手，同意与 " dst " 通信（后续数据已加密）", "tls-sh-" sip "-" dip)
		next
	}

	if (dhcp != "") {
		msg = dhcp
		if (dhcp == "1") msg = "发现（找 DHCP 服务器）"
		else if (dhcp == "2") msg = "提供地址"
		else if (dhcp == "3") msg = "请求地址"
		else if (dhcp == "5") msg = "确认分配地址"
		else if (dhcp == "6") msg = "拒绝"
		hn = dhcphn == "" ? "" : "，主机名 " dhcphn
		emit(ts(t) "  " src "  通过 DHCP " msg hn, "dhcp-" sip "-" dhcp)
		next
	}

	if (icmp != "" || icmp6 != "") {
		ic = icmp != "" ? icmp : icmp6
		im = ic
		if (ic == "8" || ic == "128") im = "发出 ping"
		else if (ic == "0" || ic == "129") im = "返回 ping 应答"
		else if (ic == "3" || ic == "1") im = "报告目的不可达"
		else if (ic == "11") im = "报告超时"
		else if (ic == "135") im = "询问邻居地址"
		else if (ic == "136") im = "通告自己的链路地址"
		else if (ic == "133") im = "请求路由器"
		else if (ic == "134") im = "通告路由前缀"
		else im = "ICMP 类型 " ic
		emit(ts(t) "  " src "  通过 ICMP 对 " dst " " im, "icmp-" sip "-" dip "-" ic)
		next
	}

	if (p == "NTP" || dp == 123 || sp == 123) {
		emit(ts(t) "  " src "  通过 NTP 向 " dst " 对时", "ntp-" sip "-" dip)
		next
	}

	if (syn && !ack) {
		emit(ts(t) "  " src "  通过 TCP 向 " dst ":" dp " 发起连接" (svc(dp) == "" ? "" : "（" svc(dp) "）"), "syn-" sip "-" dip "-" dp)
		next
	}
	if (syn && ack) {
		emit(ts(t) "  " src "  通过 TCP 同意与 " dst " 建立连接", "sa-" sip "-" dip)
		next
	}
	if (rst) {
		emit(ts(t) "  " src "  通过 TCP 拒绝/重置与 " dst " 的连接", "rst-" sip "-" dip)
		next
	}
	if (fin) {
		emit(ts(t) "  " src "  通过 TCP 结束与 " dst " 的连接", "fin-" sip "-" dip)
		next
	}

	if (p ~ /^TLS/ || p == "QUIC") {
		emit(ts(t) "  " src "  通过 HTTPS 与 " dst " 传输加密数据（看不到内容）", "tlsdata-" sip "-" dip)
		next
	}
	if (p == "MDNS" || p == "LLMNR" || p == "NBNS") {
		emit(ts(t) "  " src "  通过 " p " 在局域网做设备发现", "disc-" p "-" sip)
		next
	}
	if (p == "IGMP" || p ~ /^IGMP/) {
		emit(ts(t) "  " src "  通过 IGMP 处理组播（局域网视频/发现类流量）", "igmp-" sip)
		next
	}
	if (p == "SSDP") {
		emit(ts(t) "  " src "  通过 SSDP 在局域网查找设备", "ssdp-" sip)
		next
	}

	if (p ~ /^0x/ || p == "Ethernet") {
		data_skip++
		next
	}

	if (sip != "" && dip != "") {
		fk = sip "<->" dip
		fc[fk]++; fb[fk] += len
		if (svc(dp) != "" || svc(sp) != "")
			fsvc[fk] = (svc(dp) != "" ? svc(dp) : svc(sp))
	}

	# Remaining application-looking packets: one line per flow+protocol, not every frame.
	if (p == "TCP" || p == "UDP" || p == "IPv4" || p == "IPv6" || p == "") {
		data_skip++
		next
	}
	emit(ts(t) "  " src "  通过 " role " 与 " dst " 通信" (info == "" ? "" : "：" info), "gen-" sip "-" dip "-" p "-" info)
}

END {
	flush()
	print ""
	print "—— 以上按时间翻译；重复的同样动作已合并。加密传输只能看到站点名/IP，看不到网页正文。"
	if (data_skip > 0)
		print "另有 " data_skip " 个包是连接建立后的数据传输（多半已加密），不再逐条列出。"
	if (skipped > 0)
		print "译文超过 " MAX " 条，后面已省略。"
}
