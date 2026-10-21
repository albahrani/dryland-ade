#!/bin/sh
# Replaces electron-builder's default after-install script, so it does what that does as well: link the app, set the
# sandbox helper's setuid bit, refresh the desktop and MIME databases.
ln -sf "/opt/Dryland ADE/dryland-ade" /usr/bin/dryland-ade
chmod 4755 "/opt/Dryland ADE/chrome-sandbox" || true
update-mime-database /usr/share/mime || true
update-desktop-database /usr/share/applications || true
# Puts `dryland` on every user's PATH (ADR 0004). The launcher resolves symlinks, so it still finds the app.
ln -sf "/opt/Dryland ADE/resources/bin/dryland" /usr/bin/dryland
