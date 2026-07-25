const fs = require('fs');

const rootsContent = fs.readFileSync('data/roots.js', 'utf8');
const mergedContent = fs.readFileSync('data/roots_merged.js', 'utf8');

// Parse ROOTS
const rootEntries = [];
const re = /\{\s*root:\s*"([^"]*)"\s*,\s*code:\s*"([^"]*)"\s*\}/g;
let m;
while ((m = re.exec(rootsContent)) !== null) {
  rootEntries.push({ root: m[1], code: m[2] });
}
console.log('ROOTS count:', rootEntries.length);

// Parse ROOTS_MERGED
const mergedEntries = [];
const re2 = /\{\s*root:\s*"([^"]*)"\s*,\s*code:\s*"([^"]*)"\s*\}/g;
while ((m = re2.exec(mergedContent)) !== null) {
  mergedEntries.push({ root: m[1], code: m[2] });
}
console.log('ROOTS_MERGED count:', mergedEntries.length);

// Build set of full root strings
const fullRootSet = new Set();
for (const entry of rootEntries) {
  fullRootSet.add(entry.root);
}

// For each merged entry, split root field by spaces to get variants
// Then check each variant against full roots
const missing = [];
const allMergedVariants = [];
for (const entry of mergedEntries) {
  const variants = entry.root.split(/\s+/).filter(r => r.length > 0);
  for (const v of variants) {
    allMergedVariants.push({ variant: v, code: entry.code, original: entry.root });
    if (!fullRootSet.has(v)) {
      missing.push({ variant: v, code: entry.code, original: entry.root });
    }
  }
}
console.log('Total merged variants:', allMergedVariants.length);
console.log('Missing from ROOTS:');
for (const item of missing) {
  console.log(`  variant: "${item.variant}", code: "${item.code}", from merged: "${item.original}"`);
}
console.log('Count:', missing.length);

// Also show what's in ROOTS but not in merged variants
const mergedVariantSet = new Set(allMergedVariants.map(v => v.variant));
const extraInFull = [];
for (const entry of rootEntries) {
  if (!mergedVariantSet.has(entry.root)) {
    extraInFull.push(entry);
  }
}
console.log('\nIn ROOTS but not in any merged variant:');
for (const item of extraInFull) {
  console.log(`  root: "${item.root}", code: "${item.code}"`);
}
console.log('Count:', extraInFull.length);
