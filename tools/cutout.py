"""Cut out product photos and place them on Maliha's Miswag background (#F6FDF8).
usage: python tools/cutout.py <card-images.json> <out_dir>
Output: <out_dir>/<sha1(url)[:16]>.jpg (1000x1000) and thumbs/<same>.jpg of the original. Resumable."""
import sys, json, os, hashlib, io, urllib.request
import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import binary_fill_holes
from rembg import remove, new_session

BG = (0xF6, 0xFD, 0xF8)
SIZE, BOX = 1000, 800

def key(url): return hashlib.sha1(url.encode()).hexdigest()[:16]

def compose(im):
    im = im.convert("RGBA")
    if already_cut(im):                                      # keep the brand's own clean cutout
        return place(im)
    if white_bg(im):                                         # white studio shot: recolour the background, never cut the product
        return recolour(im)
    cut = remove(im, session=SESSION, post_process_mask=True)
    a = np.array(cut.getchannel("A"))
    filled = binary_fill_holes(a > 20)                      # keep enclosed parts (palette pans, glass) solid
    a = np.where(filled & (a < 255), 255, a).astype("uint8")
    cut = Image.fromarray(np.dstack([np.array(im.convert("RGB")), a]), "RGBA")
    return place(cut)

def already_cut(im):
    a = im.getchannel("A"); w, h = im.size
    pts = [(x, y) for x in range(0, w, 7) for y in (0, h - 1)] + [(x, y) for y in range(0, h, 7) for x in (0, w - 1)]
    return sum(a.getpixel(p) < 20 for p in pts) / len(pts) > 0.6

def white_bg(im):
    rgb = im.convert("RGB"); w, h = rgb.size
    pts = [(x, y) for x in range(0, w, 7) for y in (0, h - 1)] + [(x, y) for y in range(0, h, 7) for x in (0, w - 1)]
    return sum(min(rgb.getpixel(p)) >= 238 for p in pts) / len(pts) > 0.85

def recolour(im):
    # White studio shot: only the photo's own white (border colour - 6, at most 250) touching the edge is background. The AI mask is added so white
    # products on white backgrounds keep every part (v1 turned white caps/tubes green). Never removes product pixels.
    from scipy.ndimage import label, gaussian_filter, binary_closing
    rgb = np.array(im.convert("RGB")).astype(np.float32); h, w = rgb.shape[:2]
    mn = rgb.min(axis=2)
    border = np.concatenate([mn[0], mn[-1], mn[:, 0], mn[:, -1]])
    t = float(np.clip(np.median(border) - 6, 230, 250))           # adapts to off-white studio backgrounds
    lab, _ = label(mn >= t)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    ai = np.array(remove(im.convert("RGB"), session=SESSION).getchannel("A")) > 40
    r = max(3, int(min(h, w) * 0.02))
    prod = binary_fill_holes(binary_closing(binary_fill_holes(ai | ~bg), np.ones((r, r)))) | ~bg
    a = gaussian_filter(prod.astype(np.float32), 1.0)
    out = rgb * a[..., None] + np.array(BG, np.float32) * (1 - a[..., None])
    ys, xs = np.where(prod)
    if not len(xs): return None
    crop = Image.fromarray(out.clip(0, 255).astype("uint8")).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    sc = min(BOX / crop.width, BOX / crop.height)
    crop = crop.resize((max(1, int(crop.width * sc)), max(1, int(crop.height * sc))), Image.LANCZOS)
    canvas = Image.new("RGB", (SIZE, SIZE), BG)
    canvas.paste(crop, ((SIZE - crop.width) // 2, (SIZE - crop.height) // 2))
    return canvas

def place(cut):
    bb = cut.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()
    if not bb: return None
    cut = cut.crop(bb)
    sc = min(BOX / cut.width, BOX / cut.height)
    cut = cut.resize((max(1, int(cut.width * sc)), max(1, int(cut.height * sc))), Image.LANCZOS)
    x, y = (SIZE - cut.width) // 2, (SIZE - cut.height) // 2 + 10
    canvas = Image.new("RGBA", (SIZE, SIZE), BG + (255,))
    sh = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    s = Image.new("RGBA", cut.size, (40, 60, 45, 0)); s.putalpha(cut.getchannel("A").point(lambda v: v * 95 // 255))
    sh.paste(s, (x + 4, y + 10), s)
    canvas = Image.alpha_composite(canvas, sh.filter(ImageFilter.GaussianBlur(12)))
    canvas.alpha_composite(cut, (x, y))
    return canvas.convert("RGB")

if __name__ == "__main__":
    items, out = json.load(open(sys.argv[1], encoding="utf8")), sys.argv[2]
    os.makedirs(out + "/thumbs", exist_ok=True)
    SESSION = new_session("isnet-general-use")
    urls = list(dict.fromkeys(i["url"] for i in items))
    fails = []
    for n, url in enumerate(urls, 1):
        k = key(url); dst = f"{out}/{k}.jpg"
        if os.path.exists(dst): continue
        try:
            base = url.replace("&format=jpg", "").replace("?format=jpg", "")   # keep transparency (format=jpg flattens it)
            src = base + ("&" if "?" in base else "?") + "width=1200"
            raw = urllib.request.urlopen(urllib.request.Request(src, headers={"User-Agent": "maliha-cutout"}), timeout=60).read()
            im = Image.open(io.BytesIO(raw))
            res = compose(im)
            if res is None: raise ValueError("empty mask")
            im.convert("RGB").resize((400, 400)).save(f"{out}/thumbs/{k}.jpg", quality=80)
            res.save(dst, quality=90)
        except Exception as e:
            fails.append({"url": url, "error": str(e)})
        if n % 25 == 0: print(f"{n}/{len(urls)}", flush=True)
    json.dump(fails, open(out + "/failures.json", "w"), indent=1)
    print("done", len(urls), "failures", len(fails), flush=True)
