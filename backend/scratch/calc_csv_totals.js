import fs from 'fs';

function calculateCSVTotal() {
  const csvPath = 'C:\\Users\\usalk\\Downloads\\EtsySoldOrders2026.csv';
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());

  let totalItems = 0;
  let totalOrderNet = 0;
  let totalOrderValue = 0;

  lines.slice(1).forEach((line, idx) => {
    const fields = [];
    let insideQuote = false;
    let currentField = '';
    
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        fields.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    fields.push(currentField.trim());

    if (fields.length < 20) return;

    const orderId = fields[1].replace(/"/g, '');
    const items = parseInt(fields[6].replace(/"/g, '')) || 1;
    let orderValueStr = fields[16].replace(/"/g, '').replace(/,/g, '');
    let discountStr = fields[19]?.replace(/"/g, '').replace(/,/g, '') || '0';
    let orderNetStr = fields[26]?.replace(/"/g, '').replace(/,/g, '') || '0';

    let val = parseFloat(orderValueStr) || 0;
    let disc = parseFloat(discountStr) || 0;
    let net = val - disc;

    totalItems += items;
    totalOrderValue += val;
    totalOrderNet += net;

    console.log(`Order #${orderId} (Item ${idx+1}): Items=${items}, Value=$${val}, Disc=$${disc}, Net=$${net.toFixed(2)}`);
  });

  console.log('\n=============================================');
  console.log(`TOTAL ORDERS IN CSV: ${lines.length - 1}`);
  console.log(`TOTAL ITEMS SOLD IN CSV: ${totalItems}`);
  console.log(`TOTAL NET REVENUE ($): $${totalOrderNet.toFixed(2)}`);
  console.log('=============================================\n');
}

calculateCSVTotal();
