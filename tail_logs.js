const fs = require('fs');

try {
    const data = fs.readFileSync('./logs/paymentHandler.log', 'utf8');
    const lines = data.split('\n').filter(Boolean);
    const lastLines = lines.slice(-20);
    console.log(lastLines.join('\n'));
} catch (e) {
    console.error(e);
}
