"""Builds the installable Galla app (galla-app/index.html) from the mockup page."""
import re
import os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'galla-pos.html')
OUT = os.path.join(HERE, '..', 'index.html')
s = open(SRC).read()


def R(a, b, cnt=1):
    global s
    assert s.count(a) == cnt, (s.count(a), a[:100])
    s = s.replace(a, b)


# demo-only texts
R('<span class="pill ok">Connected (demo)</span>', '<span class="pill info">Set up below</span>')
R('<div style="font-size:15px;letter-spacing:.18em" class="num">•••• •••• •••• 4821</div><div style="font-size:11px;opacity:.7;margin-top:6px">Card machine connected</div>',
  '<div style="font-size:15px;letter-spacing:.18em" class="num">CARD</div><div style="font-size:11px;opacity:.7;margin-top:6px">Use your card machine</div>')
R('<b>No items match "${S.q}"</b>Check the spelling or scan the barcode.',
  '${P.length?`<b>No items match "${S.q}"</b>Check the spelling or scan the barcode.`:`<b>No items yet</b>Add your first item from Stock, or scan a barcode to add it.`}')
# credit book with no credit customers
R('  if(!CUST[S.cc]||!S.cc)S.cc=acc[0][1];',
  '  if(!acc.length)return topbar("Credit book","Khata: customers who buy now and pay later")+`<div class="card"><div class="empty" style="padding:40px"><div class="ei">📒</div><b>No credit customers yet</b>Add a customer with a credit limit from Customers.</div></div>`;\n  if(!CUST[S.cc]||!S.cc)S.cc=acc[0][1];')
# edit button on stock rows
R('''    <td>${st!=="ok"?`<button class="mini" data-restock="${p.id}">${I.plus.replace("<svg",'<svg width="14" height="14"')}Restock</button>`:""}</td></tr>`}).join("")}</tbody></table></div></div>`;''',
  '''    <td style="white-space:nowrap"><button class="mini" data-edit="${p.id}">Edit</button> <button class="mini" data-restock="${p.id}">${I.plus.replace("<svg",'<svg width="14" height="14"')}Stock</button></td></tr>`}).join("")||`<tr><td colspan="7"><div class="empty" style="padding:30px"><div class="ei">📦</div><b>No items yet</b>Tap "Add item" to add your first product.</div></td></tr>`}</tbody></table></div></div>`;''')
# product photos: show the photo when an item has one, else its picture
R('${p.e}','${pic(p)}',5)
R('p.e+" "+','(p.img?"":p.e+" ")+',2)

# drop the page's own first render; app.js renders after loading saved data
assert s.rstrip().count('\nrender();')>=1
i=s.rfind('\nrender();'); s=s[:i]+'\n'+s[i+len('\nrender();'):]

# home: friendly empty lists, no "0" badge
R('</span></div>`).join("")}</div></div>\n    <div class="card"><div class="ch"><h3>Recent bills</h3>',
  '</span></div>`).join("")||`<div class="empty" style="padding:22px"><div class="ei">✅</div>Nothing is running low</div>`}</div></div>\n    <div class="card"><div class="ch"><h3>Recent bills</h3>')
R('${ORDERS.slice(0,5).map(o=>billRow(o)).join("")}', '${ORDERS.slice(0,5).map(o=>billRow(o)).join("")||`<div class="empty" style="padding:22px"><div class="ei">🧾</div>No bills yet. Your bills will show here.</div>`}')
R('${k==="stock"?`<span class="badge">${lowCount()}</span>`', '${k==="stock"&&lowCount()?`<span class="badge">${lowCount()}</span>`')

head = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#3355ff">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Galla">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/icon-192.png">
'''
s = head + s.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
s = s.replace('</style>', '</style>\n<link rel="stylesheet" href="app.css">\n</head>\n<body>', 1)
s = s.rstrip() + '\n<script src="lib/qrcode.js"></script>\n<script src="lib/zxing.min.js" defer></script>\n<script src="app.js"></script>\n</body>\n</html>\n'
open(OUT, 'w').write(s)
print('ok', len(s))
