const fs = require('fs');
const rootsSrc = fs.readFileSync('./data/roots.js', 'utf8');

// Find entries with parentheses (full or half width)
const re = /\{\s*root:\s*"([^"]*[\uff08(][^"]*)",\s*code:\s*"([^"]*)"\s*\}/g;
let m;
console.log('ROOTS entries with parentheses in root:');
while ((m = re.exec(rootsSrc)) !== null) {
  console.log('  root:', JSON.stringify(m[1]), 'code:', m[2]);
}
