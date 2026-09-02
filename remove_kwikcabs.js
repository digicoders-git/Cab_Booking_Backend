const fs = require('fs');

let content = fs.readFileSync('utils/pdfGenerator.js', 'utf8');

// The pattern is generally:
// doc.text("For KWIK CABS", mm(150), mm(tableBottom + <number>));

const regex = /doc\.text\("For KWIK CABS", mm\(150\), mm\(tableBottom \+ \d+\)\);\s*/g;

const newContent = content.replace(regex, '');

if (content !== newContent) {
    fs.writeFileSync('utils/pdfGenerator.js', newContent, 'utf8');
    console.log("Successfully removed 'For KWIK CABS'");
} else {
    console.log("Could not find 'For KWIK CABS'");
}
