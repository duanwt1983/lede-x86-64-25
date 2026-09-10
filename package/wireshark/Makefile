#
# CLI-only Wireshark (tshark + dumpcap). No GUI, no Lua plugins.
#
# Runtime dependency tree (OpenWrt package names):
#   wireshark
#     ├─ libpcap, libcap, libnl-{core,genl,route}   (capture)
#     ├─ libgcrypt → libgpg-error                   (decryption)
#     ├─ glib2 → libffi, libpcre2, zlib             (core runtime)
#     ├─ libxml2 → zlib                               (config / dissectors)
#     ├─ libgnutls → libnettle, libgmp, libtasn1    (TLS)
#     ├─ libcares                                   (DNS resolution)
#     ├─ libnghttp2                                 (HTTP/2 dissection)
#     └─ libiconv-full, libintl-full (NLS)          (i18n)
#

include $(TOPDIR)/rules.mk

PKG_NAME:=wireshark
PKG_VERSION:=4.4.2
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.xz
PKG_SOURCE_URL:=https://www.wireshark.org/download/src/all-versions/
PKG_HASH:=6053d97499c83feb87ce1d7f732d9c889c6c18bb334de67e65dca11483b0514e

PKG_LICENSE:=GPL-2.0
PKG_MAINTAINER:=Morse Micro <info@morsemicro.com>
PKG_INSTALL:=1
PKG_BUILD_PARALLEL:=1
PKG_BUILD_DEPENDS:=glib2/host

include $(INCLUDE_DIR)/package.mk
include $(INCLUDE_DIR)/cmake.mk
include $(INCLUDE_DIR)/nls.mk

define Package/wireshark
	SECTION:=utils
	CATEGORY:=Utilities
	URL:=https://www.wireshark.org
	TITLE:=Wireshark CLI (tshark)
	DEPENDS:= \
		+libpcap +libcap \
		+libgcrypt +libgpg-error \
		+glib2 +libffi +libpcre2 +zlib \
		+libxml2 \
		+libgnutls +libnettle +libgmp +libtasn1 \
		+libcares \
		+libnl-core +libnl-genl +libnl-route \
		+libnghttp2 \
		$(ICONV_DEPENDS) $(INTL_DEPENDS)
endef

define Package/wireshark/description
	Installs tshark/dumpcap for command-line pcap analysis (no Wireshark GUI).
endef

CMAKE_OPTIONS += \
	-DBUILD_wireshark=OFF \
	-DBUILD_tshark=ON \
	-DBUILD_dumpcap=ON \
	-DBUILD_captype=ON \
	-DBUILD_reordercap=ON \
	-DBUILD_rawshark=ON \
	-DBUILD_androiddump=OFF \
	-DBUILD_randpkt=OFF \
	-DBUILD_dftest=OFF \
	-DBUILD_fuzzshark=OFF \
	-DENABLE_PCAP=ON \
	-DENABLE_LUA=OFF \
	-DENABLE_PLUGINS=OFF \
	-DENABLE_GTK=OFF \
	-DENABLE_QT=OFF \
	-DENABLE_MAXMINDDB=OFF \
	-DENABLE_BCG729=OFF \
	-DENABLE_SBC=OFF \
	-DENABLE_SPANDSP=OFF \
	-DENABLE_OPCUA=OFF \
	-DENABLE_LZ4=OFF \
	-DENABLE_SNAPPY=OFF \
	-DENABLE_ZSTD=OFF \
	-DENABLE_BROTLI=OFF \
	-DENABLE_NGHTTP2=ON \
	-DLEMON_C_COMPILER="$(HOSTCC_NOCACHE)" \
	-DHAVE_C99_VSNPRINTF_EXITCODE="0" \
	-DHAVE_C99_VSNPRINTF_EXITCODE__TRYRUN_OUTPUT="0"

define Package/wireshark/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/tshark $(1)/usr/bin/
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/dumpcap $(1)/usr/bin/
	$(INSTALL_DIR) $(1)/usr/lib
	$(CP) $(PKG_INSTALL_DIR)/usr/lib/lib*.so* $(1)/usr/lib/
	if [ -d "$(PKG_INSTALL_DIR)/usr/lib/wireshark" ]; then \
		$(CP) $(PKG_INSTALL_DIR)/usr/lib/wireshark $(1)/usr/lib/; \
	fi
	if [ -d "$(PKG_INSTALL_DIR)/usr/share/wireshark" ]; then \
		$(INSTALL_DIR) $(1)/usr/share; \
		$(CP) $(PKG_INSTALL_DIR)/usr/share/wireshark $(1)/usr/share/; \
	fi
endef

$(eval $(call BuildPackage,wireshark))
