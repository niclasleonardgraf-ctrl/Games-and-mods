#!/bin/sh
# Bundles src/*.js into game.js (one closure, load order by filename).
cd "$(dirname "$0")/.." && { echo "/* Hollow Moon — built from src/ by tools/build.sh. Edit the sources, not this file. */"; echo "(() => { 'use strict';"; cat src/*.js; echo "})();"; } > game.js && node --check game.js && wc -l src/*.js | tail -1
