#!/bin/sh
# Replaces electron-builder's default after-remove script, so it removes the app link as well.
rm -f /usr/bin/dryland-ade
# Takes the system-wide `dryland` link out again, unless it has since been replaced by something else.
if [ -L /usr/bin/dryland ] && [ "$(readlink /usr/bin/dryland)" = "/opt/Dryland ADE/resources/bin/dryland" ]; then
  rm -f /usr/bin/dryland
fi
