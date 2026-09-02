const fs = require('fs');

let content = fs.readFileSync('utils/pdfGenerator.js', 'utf8');

if (!content.includes('const signaturePath =')) {
    content = content.replace(
        'const mm = (val) => val * 2.83465;',
        "const mm = (val) => val * 2.83465;\n\nconst signaturePath = path.join(__dirname, '../assets/signature.png');\nconst hasSignature = fs.existsSync(signaturePath);"
    );
}

// Regex to find all occurrences of:
// doc.moveTo(mm(140), mm(tableBottom + X)).lineTo(mm(200), mm(tableBottom + X)).stroke();
// doc.text("Authorized Signatory", mm(145), mm(tableBottom + Y));
// and insert the image right above it.

const regex = /(doc\.moveTo\(mm\(140\), mm\(tableBottom \+ (\d+)\)\)\.lineTo\(mm\(200\), mm\(tableBottom \+ \2\)\)\.stroke\(\);\s+doc\.text\("Authorized Signatory", mm\(145\), mm\(tableBottom \+ (\d+)\)\);)/g;

content = content.replace(regex, (match, fullMatch, x, y) => {
    // x is the vertical offset for the line (e.g. 75, 70, 65)
    // we want to place the signature image such that it sits above the line
    const imageYOffset = parseInt(x) - 20; 
    
    return `if (hasSignature) {
                doc.image(signaturePath, mm(145), mm(tableBottom + ${imageYOffset}), { width: mm(40) });
            }
            ${fullMatch}`;
});

fs.writeFileSync('utils/pdfGenerator.js', content, 'utf8');
console.log("Successfully added signatures to pdfGenerator.js");
