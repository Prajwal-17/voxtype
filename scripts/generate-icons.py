"""Generate launch assets from assets/logo.svg. Requires Pillow (python3 -m pip install Pillow)."""
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SVG = ROOT / 'assets/logo.svg'

def render(size, mark_only=False, monochrome=False, scale=1):
    # Supersample rounded vector rectangles, then downsample once for clean small icons.
    image = Image.new('RGBA', (size * 4, size * 4))
    draw = ImageDraw.Draw(image)
    factor = size * 4 / 64 * scale
    inset = size * 4 * (1-scale) / 2
    def walk(node, inherited=None):
        fill = node.get('fill', inherited)
        if node.tag.endswith('rect') and fill and fill != 'none':
            width = float(node.get('width', 0))
            if not (mark_only and width > 50):
                x, y = float(node.get('x', 0)), float(node.get('y', 0))
                height = float(node.get('height', 0))
                draw.rounded_rectangle((inset+x*factor,inset+y*factor,inset+(x+width)*factor,inset+(y+height)*factor), radius=float(node.get('rx',0))*factor, fill='#ffffff' if monochrome else fill)
        for child in node: walk(child, fill)
    walk(ET.parse(SVG).getroot())
    return image.resize((size,size), Image.Resampling.LANCZOS)

def save(path, size, **kwargs):
    render(size, **kwargs).save(ROOT / path)

(ROOT/'apps/desktop/public/voxtype.svg').write_text(SVG.read_text())
for name,size in [('32x32.png',32),('128x128.png',128),('128x128@2x.png',256),('icon.png',512)]:
    save('apps/desktop/src-tauri/icons/'+name,size)
render(256).save(ROOT/'apps/desktop/src-tauri/icons/icon.ico',sizes=[(16,16),(32,32),(48,48),(128,128),(256,256)])
save('apps/mobile/assets/icon.png',1024)
save('apps/mobile/assets/adaptive-icon.png',1024,mark_only=True,scale=0.72)
save('apps/mobile/assets/monochrome-icon.png',1024,mark_only=True,monochrome=True,scale=0.72)
save('apps/mobile/assets/splash-icon.png',288,scale=0.7)
save('apps/mobile/assets/favicon.png',48)
save('apps/mobile/modules/voxtype-native/android/src/main/res/drawable-nodpi/voxtype_logo.png',96,mark_only=True)
