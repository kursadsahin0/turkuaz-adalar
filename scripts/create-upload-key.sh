#!/usr/bin/env bash
# Creates the Play upload key and android/keystore.properties in one go.
#
#   npm run android:keystore
#
# Run it yourself, once. It asks for a password (hidden) and your name for
# the certificate. Keep the .jks file and the password in a password manager:
# without them you cannot publish updates (Google support can reset an upload
# key only when Play App Signing is on).
set -euo pipefail

cd "$(dirname "$0")/../android"
KEYSTORE="release/turkuaz-upload.jks"
ALIAS="turkuaz-upload"

if [[ -f "$KEYSTORE" || -f keystore.properties ]]; then
  echo "An upload key already exists (android/$KEYSTORE or android/keystore.properties)."
  echo "Refusing to overwrite it. Move it away first if you really want a new one."
  exit 1
fi
if ! command -v keytool >/dev/null; then
  echo "keytool not found. Install a JDK (Android Studio ships one) and try again."
  exit 1
fi

read -r -p "Name for the certificate (e.g. Kürşat Şahin): " NAME
read -r -p "Country code (e.g. TR): " COUNTRY
while true; do
  read -r -s -p "Keystore password (min. 8 characters): " PASSWORD
  echo
  read -r -s -p "Repeat the password: " REPEAT
  echo
  if [[ "$PASSWORD" != "$REPEAT" ]]; then
    echo "The passwords differ, try again."
  elif [[ ${#PASSWORD} -lt 8 ]]; then
    echo "Use at least 8 characters."
  else
    break
  fi
done

umask 077
mkdir -p release
# The password reaches keytool through the environment, never the command line.
export TURKUAZ_KEY_PW="$PASSWORD"
keytool -genkeypair -v -keystore "$KEYSTORE" -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=${NAME}, C=${COUNTRY}" \
  -storepass:env TURKUAZ_KEY_PW -keypass:env TURKUAZ_KEY_PW

cat >keystore.properties <<EOF
# Created by scripts/create-upload-key.sh. Git-ignored: never commit it.
storeFile=${KEYSTORE}
storePassword=${PASSWORD}
keyAlias=${ALIAS}
keyPassword=${PASSWORD}
EOF
unset TURKUAZ_KEY_PW PASSWORD REPEAT

echo
echo "Done:"
echo "  android/${KEYSTORE}"
echo "  android/keystore.properties"
echo
echo "1. Back up both files and the password in a password manager now."
echo "2. Build the signed bundle with: npm run android:release"
echo "3. For CI, add these repository secrets:"
echo "     ANDROID_KEYSTORE_BASE64  -> output of: base64 -i android/${KEYSTORE}"
echo "     ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_PASSWORD -> the password"
echo "     ANDROID_KEY_ALIAS        -> ${ALIAS}"
