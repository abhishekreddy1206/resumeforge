#!/bin/bash
# Generate simple PNG icons from SVG using built-in tools
# These are placeholder icons - replace with proper designs later

cd "$(dirname "$0")"

for size in 16 48 128; do
  cat > "icon${size}.svg" << SVG
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#1a1a1a"/>
  <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-family="monospace" font-weight="bold" font-size="${size * 0.35}px" letter-spacing="1">RF</text>
  <rect x="0" y="$((size - size/8))" width="${size}" height="$((size/8))" fill="#c73c2e"/>
</svg>
SVG
done

echo "SVG icons generated. Convert to PNG with: for f in icon*.svg; do sips -s format png \$f --out \${f%.svg}.png; done"
