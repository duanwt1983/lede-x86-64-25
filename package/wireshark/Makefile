#
# CLI-only Wireshark (tshark + dumpcap). No GUI.
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

include $(INCLUDE_DIR)/package.mk
include $(INCLUDE_DIR)/cmake.mk
include $(INCLUDE_DIR)/nls.mk

define Package/wireshark
	SECTION:=utils
	CATEGORY:=Utilities
	URL:=https://www.wireshark.org
	TITLE:=Wireshark CLI (tshark)
	DEPENDS:= +libgcrypt +glib2 +libpcap +libxml2 +libgnutls +libcap +libcares +libnl $(ICONV_DEPENDS) $(INTL_DEPENDS)
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
	-DENABLE_PCAP=ON \
	-DENABLE_LUA=OFF \
	-DENABLE_PLUGINS=OFF \
	-DLEMON_C_COMPILER="$(HOSTCC_NOCACHE)" \
	-DHAVE_C99_VSNPRINTF_EXITCODE="0" \
	-DHAVE_C99_VSNPRINTF_EXITCODE__TRYRUN_OUTPUT="0"

define Package/wireshark/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/tshark $(1)/usr/bin/
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/dumpcap $(1)/usr/bin/
	$(INSTALL_DIR) $(1)/usr/lib
	$(CP) $(PKG_INSTALL_DIR)/usr/lib/lib*.so* $(1)/usr/lib/
endef

$(eval $(call BuildPackage,wireshark))
