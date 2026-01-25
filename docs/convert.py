#!/usr/bin/env python3
"""
Excalidraw to PNG converter.

Usage:
    python excalidraw_to_png.py input.excalidraw output.png [--width 1200]
"""

import json
import sys
import argparse
import subprocess
import os
import base64


def install_deps():
    """Install required dependencies."""
    subprocess.run([sys.executable, "-m", "pip", "install", 
                   "playwright", "cairosvg", "--quiet", "--break-system-packages"],
                   capture_output=True)
    subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"],
                   capture_output=True)


def excalidraw_to_png_playwright(data: dict, output_path: str, width: int = 1200):
    """Convert using playwright + excalidraw library."""
    from playwright.sync_api import sync_playwright
    
    html = f'''<!DOCTYPE html>
<html><head>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@excalidraw/excalidraw/dist/excalidraw.production.min.js"></script>
</head><body>
<script>
const data = {json.dumps(data)};
async function exportPng() {{
    const blob = await ExcalidrawLib.exportToBlob({{
        elements: data.elements || [],
        appState: {{exportBackground: true, viewBackgroundColor: "#ffffff", ...data.appState}},
        files: data.files || {{}},
    }});
    const reader = new FileReader();
    reader.onload = () => {{ window.result = reader.result; }};
    reader.readAsDataURL(blob);
}}
exportPng();
</script></body></html>'''
    
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(html)
        page.wait_for_timeout(3000)
        data_url = page.evaluate("() => window.result")
        browser.close()
        
        if data_url:
            _, encoded = data_url.split(',', 1)
            with open(output_path, 'wb') as f:
                f.write(base64.b64decode(encoded))
            return True
    return False


def excalidraw_to_svg(data: dict) -> str:
    """Convert excalidraw to basic SVG."""
    elements = data.get('elements', [])
    if not elements:
        return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect fill="white" width="100%" height="100%"/></svg>'
    
    # Calculate bounds
    xs = [e.get('x', 0) for e in elements]
    ys = [e.get('y', 0) for e in elements]
    ws = [e.get('x', 0) + e.get('width', 100) for e in elements]
    hs = [e.get('y', 0) + e.get('height', 50) for e in elements]
    
    min_x, min_y = min(xs), min(ys)
    max_x, max_y = max(ws), max(hs)
    pad = 40
    width, height = max_x - min_x + 2*pad, max_y - min_y + 2*pad
    
    svgs = []
    for e in elements:
        if e.get('isDeleted'): continue
        
        x, y = e.get('x', 0) - min_x + pad, e.get('y', 0) - min_y + pad
        w, h = e.get('width', 100), e.get('height', 50)
        stroke = e.get('strokeColor', '#000')
        fill = e.get('backgroundColor', 'transparent')
        sw = e.get('strokeWidth', 1)
        t = e.get('type', '')
        
        if t == 'rectangle':
            svgs.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" rx="4"/>')
        elif t == 'ellipse':
            svgs.append(f'<ellipse cx="{x+w/2}" cy="{y+h/2}" rx="{w/2}" ry="{h/2}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')
        elif t in ('arrow', 'line'):
            pts = e.get('points', [[0,0],[100,0]])
            if len(pts) >= 2:
                x1, y1 = pts[0]; x2, y2 = pts[-1]
                marker = 'marker-end="url(#arr)"' if t == 'arrow' else ''
                svgs.append(f'<line x1="{x+x1}" y1="{y+y1}" x2="{x+x2}" y2="{y+y2}" stroke="{stroke}" stroke-width="{sw}" {marker}/>')
        elif t == 'text':
            txt = e.get('text', '').replace('\n', '</tspan><tspan x="{}" dy="1.2em">'.format(x))
            fs = e.get('fontSize', 16)
            svgs.append(f'<text x="{x}" y="{y+fs}" font-size="{fs}" fill="{stroke}" font-family="sans-serif"><tspan>{txt}</tspan></text>')
    
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">
<defs><marker id="arr" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#000"/></marker></defs>
<rect fill="white" width="100%" height="100%"/>
{"".join(svgs)}
</svg>'''


def svg_to_png(svg: str, output: str, width: int = 1200):
    """Convert SVG to PNG."""
    try:
        import cairosvg
        cairosvg.svg2png(bytestring=svg.encode(), write_to=output, output_width=width)
        return True
    except ImportError:
        svg_path = output.replace('.png', '.svg')
        with open(svg_path, 'w') as f: f.write(svg)
        try:
            subprocess.run(['inkscape', svg_path, '--export-filename', output, f'--export-width={width}'], 
                          check=True, capture_output=True)
            return True
        except: pass
        print(f"Saved SVG: {svg_path}", file=sys.stderr)
        return False


def convert(input_path: str, output_path: str, width: int = 1200):
    """Main conversion with fallbacks."""
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Try playwright
    try:
        if excalidraw_to_png_playwright(data, output_path, width):
            print(f"✓ {input_path} → {output_path}")
            return True
    except Exception as e:
        print(f"Playwright failed: {e}", file=sys.stderr)
    
    # Fallback to SVG
    svg = excalidraw_to_svg(data)
    if svg_to_png(svg, output_path, width):
        print(f"✓ {input_path} → {output_path} (SVG fallback)")
        return True
    
    return False


def main():
    parser = argparse.ArgumentParser(description='Excalidraw → PNG')
    parser.add_argument('input', help='.excalidraw file')
    parser.add_argument('output', help='.png file')
    parser.add_argument('--width', type=int, default=1200)
    parser.add_argument('--install-deps', action='store_true')
    args = parser.parse_args()
    
    if args.install_deps:
        install_deps()
    
    if not os.path.exists(args.input):
        print(f"Error: {args.input} not found", file=sys.stderr)
        sys.exit(1)
    
    sys.exit(0 if convert(args.input, args.output, args.width) else 1)


if __name__ == '__main__':
    main()