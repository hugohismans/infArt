#!/bin/bash
# Émulateurs Firebase (auth + base) pour essayer la visite à deux en local,
# puis chargement des règles de sécurité (database.rules.json).
cd "$(dirname "$0")/.."
npx firebase emulators:start --config firebase.emulator.json --only auth,database --project demo-ailleurs &
PID=$!
until curl -s -m 2 --noproxy '*' "http://127.0.0.1:9000/.json?ns=demo-ailleurs" >/dev/null; do sleep 1; done
curl -s --noproxy '*' -X PUT -H "Authorization: Bearer owner" --data-binary @database.rules.json "http://127.0.0.1:9000/.settings/rules.json?ns=demo-ailleurs" >/dev/null && echo "Règles chargées."
wait $PID
