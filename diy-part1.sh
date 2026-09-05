#!/bin/bash
# Before feeds update: iStoreOS homepage / store / FastNet feeds.

set -euo pipefail

if ! grep -q 'src-git nas ' feeds.conf.default; then
  echo 'src-git nas https://github.com/linkease/nas-packages.git;master' >> feeds.conf.default
  echo 'src-git nas_luci https://github.com/linkease/nas-packages-luci.git;main' >> feeds.conf.default
  echo 'src-git istore https://github.com/linkease/istore.git;main' >> feeds.conf.default
fi
