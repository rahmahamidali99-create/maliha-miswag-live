// Business rules for what goes to Miswag. Owner decisions (2026-11-03 / 2026-11-04):
// - Retail only. NEVER wholesale.
// - CeraVe is excluded (the owner listed it on Miswag by hand), as is anything already on Miswag by hand.
// - Retail price = compare-at price when it is higher, otherwise the price (no discounts on Miswag).
// - Arabic first.

export const isWholesale = (p) =>
  p.tags.some((t) => /wholesale/i.test(t)) ||
  /wholesale|جملة/i.test(p.title) ||
  /wholesale/i.test(p.handle) ||
  p.collections.nodes.some((c) => /wholesale/i.test(c.handle));

export const isCeraVe = (p) =>
  /cerave|سيرافي|سيرافيه/i.test(p.title) || p.collections.nodes.some((c) => c.handle === 'cerave');

// Shopify brand collection handle -> [display name, Miswag brand_id or null when Miswag has no such brand]
export const BRANDS = {
  'nyx-cosmetics': ['NYX', 1],
  'revolution-beauty': ['Revolution Beauty', 303],
  'ofra-cosmetics': ['Ofra Cosmetics', 584],
  'huda-beauty': ['Huda Beauty', 322],
  thebalm: ['theBalm', 86],
  'mac-cosmetics-1': ['MAC', 2],
  clinque: ['Clinique', 180],
  tarte: ['Tarte', 1962],
  toofaced: ['Too Faced', 255],
  'estee-lauder': ['Estée Lauder', 233],
  'rare-beauty': ['Rare Beauty', 3028],
  'charlotte-tilbury': ['Charlotte Tilbury', 3020],
  cantu: ['Cantu', 1395],
  'laroche-posay': ['La Roche-Posay', 985],
  'summers-eve': ["Summer's Eve", 310],
  'anastasia-beverly-hills': ['Anastasia Beverly Hills', 72],
  mielle: ['Mielle', 2221],
  cetaphil: ['Cetaphil', 360],
  theinkeylist: ['The INKEY List', 2544],
  'benefit-cosmetics': ['Benefit', 266],
  'vichy-decros': ['Vichy', 990],
  morphe: ['Morphe', 164],
  klorane: ['Klorane', null],
  suave: ['Suave', 673],
  'glam-glow': ['GlamGlow', 282],
  panoxyl: ['PanOxyl', null],
  eucerin: ['Eucerin', 2411],
  'dr-teals': ["Dr. Teal's", 3108],
  'eco-tools': ['EcoTools', 260],
  'sol-de-jenero': ['Sol de Janeiro', 3025],
  'the-ordinary': ['The Ordinary', 964],
  bodycology: ['Bodycology', null],
  'real-techniques': ['Real Techniques', 71],
  'body-fantasies': ['Body Fantasies', null],
  kerastase: ['Kerastase', 3843],
  olaplex: ['Olaplex', 2009],
  therabreath: ['TheraBreath', 3540],
  cerave: ['CeraVe', 1005],
};

// Shopify sub-category collection handle -> internal category name (same as the 2026-11-03 feed).
export const CAT_BY_COLLECTION = {
  'غسولات-البشرة': 'Face Cleansers', 'مرطبات-البشرة': 'Face Moisturizers', 'سيرومات-البشرة': 'Serums', 'تونرات-البشرة': 'Toners',
  'ماسكات-للبشرة': 'Face Masks', 'حمر-سائلة': 'Liquid Lipsticks', 'حمر-كريمية': 'Cream Lipsticks', 'كريم-أساس-الوجه': 'Foundation',
  'فاونديشنات-التخرج': 'Foundation', 'كونسيلرات': 'Concealer', 'باودر-الوجه': 'Face Powder', 'مسكارة-العيون': 'Mascara',
  'ظلال-العيون': 'Eyeshadow', 'مكياج-الحواجب': 'Brows', 'فرش-المكياج': 'Makeup Brushes', 'شامبوات-الشعر': 'Shampoo',
  'بلسم-الشعر': 'Conditioner', 'معالجات-الشعر': 'Hair Treatments', 'مرطبات-الجسم': 'Body Moisturizers', 'مزيلات-التعرق': 'Deodorants',
  'معطرات-الجسم': 'Body Mists', 'global-perfumes': 'Perfume',
};

// Internal category name -> Miswag category_id (from GET /v1/categories/flat, 2026-11-04)
export const MISWAG_CATEGORY = {
  'Liquid Lipsticks': 'L4-20', 'Cream Lipsticks': 'L4-20', 'Lip Gloss': 'L4-20', 'Lip Liner': 'L4-22', 'Lip Balm': 'L4-485',
  Concealer: 'L4-7', Blush: 'L4-8', Foundation: 'L4-3', Highlighter: 'L4-9', 'Face Powder': 'L4-5', Primer: 'L4-2', 'Setting Spray': 'L4-2',
  Bronzer: 'L4-6', Contour: 'L4-6', 'Makeup Sets': 'L4-1', Eyeshadow: 'L4-15', Brows: 'L4-31', Eyeliner: 'L4-17', Mascara: 'L4-18',
  'Makeup Tools': 'L4-29', 'Makeup Brushes': 'L4-27',
  'Face Cleansers': 'L4-33', 'Face Moisturizers': 'L4-36', Serums: 'L4-39', Toners: 'L4-35', 'Face Masks': 'L4-38', 'Skincare Sets': 'L4-44',
  'Eye Care': 'L3-293', Sunscreen: 'L4-37', Exfoliators: 'L4-34',
  Shampoo: 'L4-69', Conditioner: 'L4-70', 'Hair Treatments': 'L4-65', 'Hair Styling': 'L4-67', 'Hair Oils': 'L4-66',
  'Body Moisturizers': 'L4-43', 'Body Wash': 'L4-98', 'Body Scrubs': 'L4-42', 'Feminine Care': 'L3-159', 'Face Tools': 'L4-40', 'Unisex Perfume': 'L4-83', Deodorants: 'L4-635', 'Body Mists': 'L4-84',
  Perfume: 'L4-81', 'Men Perfume': 'L4-82', Mouthwash: 'L3-162', 'Baby Care': 'L4-292',
};

// IMPORTANT: Miswag puts any item sent WITHOUT brand_id under brand 1 (= NYX). So every item must carry a brand_id.
// Brands Miswag does not have go to its neutral "Generic" brand, never NYX.
export const GENERIC_BRAND = 3309;

// Used only when a product sits in no brand collection: the brand name must be written in the product title
// (an exact name match, no guessing). Order matters: more specific names first. [title regex, display name, Miswag brand_id]
export const TITLE_BRANDS = [
  [/sephora/i, 'Sephora Collection', 4675],
  [/make\s?up\s?revolution|^revolution\b/i, 'Revolution Beauty', 303],
  [/^the\s?balm\b/i, 'theBalm', 86],
  [/fenty|fenty b[e]?q?uty/i, 'Fenty Beauty', 3033],
  [/make\s?up\s?for\s?ever/i, 'Make Up For Ever', 396],
  [/lanc[oô]me/i, 'Lancôme', 161],
  [/^origins\b/i, 'Origins', 6003],
  [/mario badescu/i, 'Mario Badescu', 278],
  [/neutrogena/i, 'Neutrogena', 527],
  [/kiehl/i, "Kiehl's", 244],
  [/milk makeup/i, 'Milk Makeup', 4601],
  [/kylie/i, 'Kylie Jenner', 4357],
  [/^anua\b/i, 'Anua', 2716],
  [/round lab/i, 'Round Lab', 2811],
  [/beauty of joseon/i, 'Beauty of Joseon', 2661],
  [/^freeman\b/i, 'Freeman', 607],
  [/l\.?\s?a\.?\s?girl/i, 'L.A. Girl', 301],
  [/victoria.?s secret/i, "Victoria's Secret", 168],
  [/tom ford/i, 'Tom Ford', 339],
  [/color wow/i, 'Color Wow', 3385],
  [/rare beauty/i, 'Rare Beauty', 3028],
  [/^benefit\b|porefessional/i, 'Benefit', 266],
  [/got2b/i, 'got2b', 3168],
  [/too faced/i, 'Too Faced', 255],
  [/^nyx\b/i, 'NYX', 1],
  [/glow recipe/i, 'Glow Recipe', 3027],
  [/paula.?s choice/i, "Paula's Choice", 2418],
  [/la roche.?posay/i, 'La Roche-Posay', 985],
  [/eucerin/i, 'Eucerin', 2411],
  [/smash\s?box/i, 'Smashbox', 243],
  [/k[eé]rastase/i, 'Kerastase', 3843],
  [/^rhode\b/i, 'rhode', 4832],
  [/^ysl\b|yves saint laurent/i, 'YSL', 342],
  [/^vichy\b/i, 'Vichy', 990],
  [/^suave\b/i, 'Suave', 673],
  [/^nivea\b/i, 'Nivea', 178],
  [/cetaphil/i, 'Cetaphil', 360],
  [/^ofra\b/i, 'Ofra Cosmetics', 584],
  [/^it cosmetics/i, 'IT Cosmetics', 4676],
  [/sol de janeiro/i, 'Sol de Janeiro', 3025],
  [/^dior\b/i, 'Dior', 43],
  [/dr\.? teal/i, "Dr. Teal's", 3108],
  [/^kosas\b/i, 'Kosas', 6409],
  [/^mac\b/i, 'MAC', 2],
  [/^elf\b|e\.l\.f/i, 'e.l.f.', 101],
  [/^tarte\b/i, 'Tarte', 1962],
  [/anastasia beverly/i, 'Anastasia Beverly Hills', 72],
  [/laura mercier/i, 'Laura Mercier', 597],
  [/urban decay/i, 'Urban Decay', 181],
  [/huda beauty/i, 'Huda Beauty', 322],
  [/summer.?s eve/i, "Summer's Eve", 310],
  [/^mielle\b/i, 'Mielle', 2221],
  [/glam\s?glow/i, 'GlamGlow', 282],
  [/^nars\b/i, 'NARS', 170],
  [/^one\/size\b/i, 'ONE/SIZE', 6713],
  [/^gisou\b/i, 'Gisou', 3037],
  [/^bioderma\b/i, 'Bioderma', 541],
  [/^burberry\b/i, 'Burberry', 46],
  [/ariana grande/i, 'Ariana Grande', 4359],
  [/dolce\s?&\s?gabbana/i, 'Dolce & Gabbana', 10],
  [/calvin klein/i, 'Calvin Klein', 140],
  [/^givenchy\b/i, 'Givenchy', 160],
  [/^guerlain\b/i, 'Guerlain', 338],
  [/jo malone/i, 'Jo Malone London', 1426],
  [/marc jacobs/i, 'Marc Jacobs', 199],
  [/^versace\b/i, 'Versace', 346],
  [/john varvatos/i, 'John Varvatos', 2365],
  // Named in the title but not on Miswag -> Generic
  [/tree hut/i, 'Tree Hut', null],
  [/^r\.e\.m\./i, 'r.e.m. beauty', null],
  [/living proof/i, 'Living Proof', null],
  [/iconic london/i, 'Iconic London', null],
  [/^gxve\b/i, 'GXVE', null],
  [/^oway\b/i, 'Oway', null],
  [/^saie\b/i, 'Saie', null],
  [/patrick ta/i, 'Patrick Ta', null],
  [/^eadem\b/i, 'Eadem', null],
];
// Brands given by the owner (2026-11-04) for products whose title names no brand. [regex placeholder, name, Miswag id]
export const PRODUCT_BRAND = {
  '7968398508079': [null, 'Ofra Cosmetics', 584], // PRO PALETTE - Contouring & Highlighting Cream
  '7970866069551': [null, 'Revolution Beauty', 303], // Fast Base Blush
  '7971766304815': [null, 'theBalm', 86], // Meet Matt(e) Hughes Special Delivery set
  '7974186680367': [null, 'Clinique', 180], // Glow All Out Face Palette
};
export const brandFromTitle = (title) => TITLE_BRANDS.find(([re]) => re.test(title || ''));

export const SHADE_OPTION = /لون|درج|colou?r|shade/i;

// Per-product category fixes for products that sit in no sub-category collection (Shopify product id -> category name or Miswag id)
export const CATEGORY_OVERRIDE = {
  '7967117901871': 'Face Cleansers', // Eucerin Hydrating Cleansing Gel
  '8421317640239': 'Body Scrubs', // Dr Teal's Shea Sugar Scrub
  '8527816097839': 'Men Perfume', // John Varvatos Artisan EDT
  // Audit 2026-11-04: products whose Shopify sub-collection put them in the wrong Miswag section
  '8527788769327': 'Men Perfume', // Calvin Klein Defy EDT (men's)
  '8527808397359': 'Men Perfume', // Calvin Klein Eternity for Men
  '8527816261679': 'Unisex Perfume', // Jo Malone Wood Sage & Sea Salt (unisex)
  '7967773261871': 'Body Wash', // Mario Badescu A.H.A. Botanical Body Soap (was body moisturizer)
};
// Whole-collection fixes by title: [regex, category]
export const CATEGORY_BY_TITLE = [
  [/leave-in/i, 'Hair Treatments'], // Cantu leave-in mist was under body mists
  [/style setting spray|shine & hold mist/i, 'Hair Styling'],
  [/summer.?s eve/i, 'Feminine Care'], // intimate sprays/washes were under body mists / shower gel
  [/cleansing brush|mask remover sponge/i, 'Face Tools'],
];

// Variation ids that Miswag already holds inside ANOTHER item (Miswag never frees a variation id, even after archiving).
// Shopify variant id -> the Miswag variation external_id to use instead.
export const VARIATION_ID_ALIAS = {
  // NYX Fat Lip Oil "Scrollin": first sent as its own item MB-7969451311151-47139070148655 (now archived) when its price differed.
  '47139070148655': 'MBV-47139070148655-v2',
};
