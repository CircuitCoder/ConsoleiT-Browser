#!/bin/sh
mkdir -p artifacts
cd bin

for i in */; do
  echo "Packaging ${i%/}..."
  zip -rq "../artifacts/${i%/}.zip" "$i"
  echo "Finished."
done
