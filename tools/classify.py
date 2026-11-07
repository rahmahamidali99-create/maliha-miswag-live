"""Classify each card image: 'cut' (transparent background) or 'not_cut'. usage: classify.py card-images.json out.json"""
import sys, json, io, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
items = json.load(open(sys.argv[1], encoding="utf8"))
urls = list(dict.fromkeys(i["url"] for i in items))
def check(url):
    try:
        base = url.split("&format=jpg")[0].split("?format=jpg")[0]
        src = base + ("&" if "?" in base else "?") + "width=300"
        im = Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(src, headers={"User-Agent": "maliha"}), timeout=60).read()))
        im = im.convert("RGBA")
        a = im.getchannel("A"); w, h = im.size
        border = [a.getpixel((x, y)) for x in range(0, w, 5) for y in (0, h - 1)] + [a.getpixel((x, y)) for y in range(0, h, 5) for x in (0, w - 1)]
        transparent = sum(v < 20 for v in border) / len(border)
        if transparent > 0.6: return url, {"status": "cut", "src": base}
        rgb = im.convert("RGB")
        pts = [rgb.getpixel((x, y)) for x in range(0, w, 5) for y in (0, h - 1)] + [rgb.getpixel((x, y)) for y in range(0, h, 5) for x in (0, w - 1)]
        white = sum(min(p) >= 243 for p in pts) / len(pts)
        return url, {"status": "white_bg" if white > 0.9 else "needs_cut", "white_border": round(white, 2), "src": base}
    except Exception as e:
        return url, {"status": "error", "error": str(e)}
with ThreadPoolExecutor(8) as ex: res = dict(ex.map(check, urls))
json.dump(res, open(sys.argv[2], "w"), indent=1)
from collections import Counter; print(Counter(v["status"] for v in res.values()))
