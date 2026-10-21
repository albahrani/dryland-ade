#!/bin/sh
# Takes the system-wide `dryland` link out again, unless it has since been replaced by something else.
if [ -L /usr/bin/dryland ] && [ "$(readlink /usr/bin/dryland)" = "/opt/Dryland ADE/resources/bin/dryland" ]; then
  rm -f /usr/bin/dryland
fi
