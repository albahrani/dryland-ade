#!/bin/sh
# Puts `dryland` on every user's PATH (ADR 0004). The launcher resolves symlinks, so it still finds the app.
ln -sf "/opt/Dryland ADE/resources/bin/dryland" /usr/bin/dryland
