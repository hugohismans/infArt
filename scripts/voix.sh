#!/bin/bash
# Voix off : convertit les enregistrements (A01.wav, A01-b.wav…, WAV ou FLAC) en MP3 pour
# le jeu, dans public/voix/, et écrit la liste des répliques disponibles (index.json).
#   scripts/voix.sh <dossier des enregistrements>
# Une variante « -b » remplace la prise principale si elle est la seule ; sinon on garde
# la principale. Traitement : mono, silences de début et de fin retirés, volume normalisé
# (-16 LUFS, comme une voix de podcast), MP3 96 kb/s.
set -euo pipefail
src="${1:?dossier des enregistrements}"
out="$(dirname "$0")/../public/voix"
mkdir -p "$out"
shopt -s nullglob nocaseglob
for f in "$src"/*.wav "$src"/*.flac; do
  name="$(basename "${f%.*}")"
  id="${name%%-*}"
  id="${id^^}"
  # Prise principale prioritaire sur une variante.
  if [[ "$name" == *-* ]] && compgen -G "$src/$id.*" > /dev/null; then continue; fi
  ffmpeg -loglevel error -y -i "$f" -ac 1 -ar 44100 \
    -af "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.3,areverse,loudnorm=I=-16:TP=-1.5:LRA=11" \
    -codec:a libmp3lame -b:a 96k "$out/$id.mp3"
  echo "$id"
done
# Liste des répliques enregistrées (le jeu n'essaie de lire que celles-ci).
ls "$out"/*.mp3 2>/dev/null | xargs -n1 basename | sed 's/\.mp3$//' | sort | jq -R . | jq -sc . > "$out/index.json"
echo "→ $(jq length "$out/index.json") répliques dans $out"
