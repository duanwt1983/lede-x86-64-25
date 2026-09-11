#
# CLI-only Wireshark (tshark + dumpcap). No GUI / logray.
# Morse-feed options plus host lemon and try_run cache so musl
# cross-configure does not die in a few seconds with no log.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=wireshark
PKG_VERSION:=4.4.2
PKG_RELEASE:=3

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
	DEPENDS:=+libgcrypt +glib2 +libpcap +libcap +libcares $(ICONV_DEPENDS) $(INTL_DEPENDS)
endef

define Package/wireshark/description
	Installs tshark/dumpcap for command-line pcap analysis (no Wireshark GUI).
endef

# Keep optional feature probes off so CMake configure cannot fail
# on missing Qt, minizip, gnutls, nghttp2, etc.
CMAKE_OPTIONS += \
	-DCMAKE_CROSSCOMPILING=TRUE \
	-DCMAKE_COLOR_MAKEFILE=OFF \
	-DENABLE_WERROR=OFF \
	-DBUILD_wireshark=OFF \
	-DBUILD_logray=OFF \
	-DBUILD_tshark=ON \
	-DBUILD_dumpcap=ON \
	-DBUILD_tfshark=OFF \
	-DBUILD_rawshark=OFF \
	-DBUILD_capinfos=OFF \
	-DBUILD_captype=OFF \
	-DBUILD_mergecap=OFF \
	-DBUILD_reordercap=OFF \
	-DBUILD_editcap=OFF \
	-DBUILD_text2pcap=OFF \
	-DBUILD_randpkt=OFF \
	-DBUILD_dftest=OFF \
	-DBUILD_fuzzshark=OFF \
	-DBUILD_androiddump=OFF \
	-DBUILD_sshdump=OFF \
	-DBUILD_ciscodump=OFF \
	-DBUILD_wifidump=OFF \
	-DBUILD_randpktdump=OFF \
	-DBUILD_udpdump=OFF \
	-DBUILD_sharkd=OFF \
	-DBUILD_mmdbresolve=OFF \
	-DBUILD_dcerpcidl2wrs=OFF \
	-DBUILD_sdjournal=OFF \
	-DBUILD_dpauxmon=OFF \
	-DENABLE_PCAP=ON \
	-DENABLE_LUA=OFF \
	-DENABLE_PLUGINS=OFF \
	-DENABLE_CHECKHF_CONFLICT=OFF \
	-DENABLE_ZLIB=OFF \
	-DENABLE_MINIZIP=OFF \
	-DENABLE_BROTLI=OFF \
	-DENABLE_LZ4=OFF \
	-DENABLE_SNAPPY=OFF \
	-DENABLE_ZSTD=OFF \
	-DENABLE_NGHTTP2=OFF \
	-DENABLE_GNUTLS=OFF \
	-DENABLE_LIBXML2=OFF \
	-DENABLE_NETLINK=OFF \
	-DENABLE_CAP=OFF \
	-DENABLE_KERBEROS=OFF \
	-DENABLE_SMI=OFF \
	-DENABLE_ILBC=OFF \
	-DENABLE_LIBSRTP=OFF \
	-DENABLE_BCG729=OFF \
	-DENABLE_SPANDSP=OFF \
	-DENABLE_SBC=OFF \
	-DENABLE_OPUS=OFF \
	-DCMAKE_DISABLE_FIND_PACKAGE_Qt5=TRUE \
	-DCMAKE_DISABLE_FIND_PACKAGE_Qt6=TRUE \
	-DCMAKE_DISABLE_FIND_PACKAGE_Asciidoctor=TRUE \
	-DCMAKE_DISABLE_FIND_PACKAGE_DOXYGEN=TRUE \
	-DCMAKE_DISABLE_FIND_PACKAGE_Git=TRUE \
	-DCMAKE_DISABLE_FIND_PACKAGE_SpeexDSP=TRUE \
	-DCMAKE_DISABLE_FIND_PACKAGE_MaxMindDB=TRUE \
	-DCMAKE_DISABLE_FIND_PACKAGE_SBC=TRUE \
	-DCMAKE_DISABLE_FIND_PACKAGE_Systemd=TRUE \
	-DPython3_EXECUTABLE=/usr/bin/python3 \
	-DLEMON_C_COMPILER="$(HOSTCC_NOCACHE)" \
	-DHAVE_C99_VSNPRINTF=TRUE \
	-DHAVE_C99_VSNPRINTF_EXITCODE="0" \
	-DHAVE_C99_VSNPRINTF_EXITCODE__TRYRUN_OUTPUT="0"

define Build/Configure
	$(call Build/Configure/Default)
	mkdir -p $(PKG_BUILD_DIR)/run
	$(HOSTCC_NOCACHE) -O2 -o $(PKG_BUILD_DIR)/run/lemon $(PKG_BUILD_DIR)/tools/lemon/lemon.c
endef

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
