# Application icon for Dryland ADE

Type: task
Status: resolved

## Question

The app has no icon of its own. Design or pick an icon and use it for the window, the taskbar and the installers (Windows first, with the formats the other platforms need).

## Answer

Dryland ADE has an icon: a desert sunset (sun behind two dunes on a rounded square). scripts/build-icons.mjs draws it in code and writes packages/desktop/build/icon.png (1024), icon.ico (16-256) and icon.icns, which electron-builder picks up from its default build folder for the Windows exe and installer, the dmg and the Linux packages. The window uses it too: installed apps ship icon.png in resources, a development run reads it from the source tree (installLayout.icon). Commit 34954bf. Known limits: no installer was built here, so the icon on a real installed exe is unchecked; the macOS .icns holds 128-1024 px entries only.
