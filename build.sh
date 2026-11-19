#!/bin/zsh
# Build Katnis.app + DMG.  Pakai: ./build.sh   (hasil di dist/)
set -euo pipefail
cd "$(dirname "$0")"
NAME="Katnis"
VER="${VER:-1.0.0}"
APP="build/$NAME.app"
rm -rf build/Katnis.app build/dmg dist; mkdir -p build dist

echo "› compile Swift"
swiftc -O -target arm64-apple-macos13 -o build/Katnis src/main.swift \
  -framework AppKit -framework WebKit -framework AVFoundation -framework Speech -lsqlite3

echo "› susun bundle"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp build/Katnis "$APP/Contents/MacOS/Katnis"
rsync -a --delete web/ "$APP/Contents/Resources/web/"
cp assets/Katnis.icns "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>$NAME</string>
  <key>CFBundleDisplayName</key><string>$NAME</string>
  <key>CFBundleIdentifier</key><string>id.nusa.bis.katnis</string>
  <key>CFBundleVersion</key><string>$VER</string>
  <key>CFBundleShortVersionString</key><string>$VER</string>
  <key>CFBundleExecutable</key><string>Katnis</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleDevelopmentRegion</key><string>id</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSMicrophoneUsageDescription</key><string>Katnis merekam ceritamu untuk ditranskripsi jadi catatan. Audio tidak disimpan.</string>
  <key>NSSpeechRecognitionUsageDescription</key><string>Katnis mengubah rekaman suaramu menjadi teks untuk catatan harian.</string>
  <key>NSCameraUsageDescription</key><string>Katnis memotret papan tulis, sketsa, atau dokumen fisik sebagai lampiran catatan.</string>
  <key>NSDesktopFolderUsageDescription</key><string>Katnis membaca nama file yang kamu simpan hari ini sebagai jejak kerja.</string>
  <key>NSDocumentsFolderUsageDescription</key><string>Katnis membaca nama dokumen yang kamu ubah hari ini sebagai jejak kerja.</string>
  <key>NSDownloadsFolderUsageDescription</key><string>Katnis membaca nama file yang kamu unduh hari ini sebagai jejak kerja.</string>
  <key>NSHumanReadableCopyright</key><string>Rangkuman harian tim BIS.</string>
</dict></plist>
PLIST

echo "› tanda tangan ad-hoc"
codesign --force --deep --sign - "$APP"

echo "› buat DMG"
STAGE=build/dmg; mkdir -p $STAGE
cp -R "$APP" $STAGE/
ln -s /Applications $STAGE/Applications
hdiutil create -volname "$NAME" -srcfolder $STAGE -ov -format UDZO "dist/$NAME-$VER.dmg" >/dev/null
echo "✓ dist/$NAME-$VER.dmg"
