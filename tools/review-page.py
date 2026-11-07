"""Builds data/review/index.html: current Miswag photo vs new cutout for every item. usage: review-page.py <data_dir>"""
import sys, json, hashlib, os, html
d = sys.argv[1]
plan = json.load(open(d + "/image-plan.json", encoding="utf8"))
key = lambda u: hashlib.sha1(u.encode()).hexdigest()[:16]
cards = []
for n, p in enumerate(plan, 1):
    p["no"] = n
    new = f"../cutouts/{key(p['source'])}.jpg" if p["source"] else None
    ok = bool(new) and os.path.exists(f"{d}/cutouts/{key(p['source'])}.jpg")
    tag = {"cutout": "", "cutout_packshot": "صورة العلبة بدل الموديل", "keep_original": "تبقى الأصلية", "official_photo": "صورة رسمية من موقع أوفرا"}[p["action"]]
    if p["source"] and not ok: tag = "فشل القص — تبقى الأصلية"
    right = f'<img loading="lazy" src="{new}">' if ok else '<div class="none">تبقى الصورة الحالية</div>'
    cards.append(f'''<div class="c" data-id="{p['id']}" onclick="t(this)"><div class="h"><b>{n}</b> {html.escape(p['name'][:60])}</div>
<div class="r"><img loading="lazy" src="{html.escape(p['card'])}{'&' if '?' in p['card'] else '?'}width=300"><span>←</span>{right}</div><div class="tag">{tag}</div></div>''')
json.dump(plan, open(d + "/image-plan.json", "w", encoding="utf8"), indent=1, ensure_ascii=False)
os.makedirs(d + "/review", exist_ok=True)
open(d + "/review/index.html", "w", encoding="utf8").write('''<!doctype html><html dir="rtl" lang="ar"><meta charset="utf8"><title>مراجعة صور مسواك</title>
<style>body{font-family:Segoe UI,Tahoma;background:#EEF1F5;margin:0}header{position:sticky;top:0;background:#2F4F3A;color:#fff;padding:14px 20px;z-index:2;display:flex;gap:20px;align-items:center}
button{background:#F6FDF8;color:#2F4F3A;border:0;padding:10px 18px;border-radius:8px;font-size:15px;cursor:pointer}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px;padding:16px}
.c{background:#fff;border-radius:12px;padding:10px;border:3px solid transparent;cursor:pointer}.c.x{border-color:#D33;background:#FDECEC}
.h{font-size:13px;color:#333;height:34px;overflow:hidden}.r{display:flex;align-items:center;gap:6px}.r img,.none{width:150px;height:150px;object-fit:contain;border-radius:8px;background:#fff;border:1px solid #ddd}
.r img:last-child{background:#F6FDF8}.none{display:flex;align-items:center;justify-content:center;font-size:12px;color:#777;text-align:center}
.tag{font-size:12px;color:#2F4F3A;min-height:16px;margin-top:4px}</style>
<header><div>اضغطي على أي منتج صورته الجديدة مو حلوة (يصير أحمر) — هذا يبقى بصورته الحالية.<br>اليسار = الجديدة · اليمين = الحالية بمسواك</div>
<div id="n">0 مرفوض</div><button onclick="save()">حفظ الملاحظات</button></header><main>''' + "\n".join(cards) + '''</main>
<script>const K='miswag-review';let s=new Set(JSON.parse(localStorage[K]||'[]'));
document.querySelectorAll('.c').forEach(c=>{if(s.has(c.dataset.id))c.classList.add('x')});u();
function t(c){c.classList.toggle('x');c.classList.contains('x')?s.add(c.dataset.id):s.delete(c.dataset.id);localStorage[K]=JSON.stringify([...s]);u()}
function u(){document.getElementById('n').textContent=s.size+' مرفوض'}
function save(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify([...s],null,1)],{type:'application/json'}));a.download='miswag-rejected.json';a.click()}</script></html>''')
print("cards", len(cards))
