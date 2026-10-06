const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generateAssets() {
  const iconsDir = path.join(process.cwd(), 'public', 'icons');
  const screenshotsDir = path.join(process.cwd(), 'public', 'screenshots');
  if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  const svgBuffer = fs.readFileSync(path.join(process.cwd(), 'public', 'school_logo.svg'));

  // 1. Standard PNG icons (192 and 512)
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(iconsDir, 'icon-192x192.png'));
  fs.copyFileSync(path.join(iconsDir, 'icon-192x192.png'), path.join(process.cwd(), 'public', 'icon-192x192.png'));

  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, 'icon-512x512.png'));
  fs.copyFileSync(path.join(iconsDir, 'icon-512x512.png'), path.join(process.cwd(), 'public', 'icon-512x512.png'));

  // Apple touch icon 180x180
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(process.cwd(), 'public', 'apple-touch-icon.png'));

  // 2. Maskable PNG icons (with 15% safe padding and full-bleed brand background)
  // 512x512 maskable: 410x410 logo centered
  const logoForMaskable512 = await sharp(svgBuffer)
    .resize(410, 410, { fit: 'contain' })
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 55, g: 48, b: 163, alpha: 1 } // #3730a3
    }
  })
    .composite([{ input: logoForMaskable512, gravity: 'center' }])
    .png()
    .toFile(path.join(iconsDir, 'icon-maskable-512x512.png'));
  fs.copyFileSync(path.join(iconsDir, 'icon-maskable-512x512.png'), path.join(process.cwd(), 'public', 'icon-maskable-512x512.png'));

  // 192x192 maskable: 154x154 logo centered
  const logoForMaskable192 = await sharp(svgBuffer)
    .resize(154, 154, { fit: 'contain' })
    .toBuffer();

  await sharp({
    create: {
      width: 192,
      height: 192,
      channels: 4,
      background: { r: 55, g: 48, b: 163, alpha: 1 } // #3730a3
    }
  })
    .composite([{ input: logoForMaskable192, gravity: 'center' }])
    .png()
    .toFile(path.join(iconsDir, 'icon-maskable-192x192.png'));

  // 3. Generate Desktop and Mobile Screenshots
  const desktopSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <rect width="1280" height="720" fill="#f8fafc"/>
    <rect x="0" y="0" width="260" height="720" fill="#1e1b4b"/>
    <text x="75" y="45" font-family="system-ui, sans-serif" font-weight="900" font-size="18" fill="#ffffff">ST. ANTONY</text>
    <text x="75" y="65" font-family="system-ui, sans-serif" font-weight="600" font-size="12" fill="#818cf8">SCHOOL ERP</text>
    <rect x="20" y="95" width="220" height="40" rx="12" fill="#4338ca"/>
    <text x="50" y="120" font-family="system-ui, sans-serif" font-weight="700" font-size="14" fill="#ffffff">Dashboard</text>
    <rect x="20" y="145" width="220" height="36" rx="10" fill="transparent"/>
    <text x="50" y="168" font-family="system-ui, sans-serif" font-weight="500" font-size="13" fill="#cbd5e1">Students &amp; Admissions</text>
    <rect x="20" y="190" width="220" height="36" rx="10" fill="transparent"/>
    <text x="50" y="213" font-family="system-ui, sans-serif" font-weight="500" font-size="13" fill="#cbd5e1">Smart Attendance</text>
    <rect x="20" y="235" width="220" height="36" rx="10" fill="transparent"/>
    <text x="50" y="258" font-family="system-ui, sans-serif" font-weight="500" font-size="13" fill="#cbd5e1">Fee Management</text>
    <rect x="20" y="280" width="220" height="36" rx="10" fill="transparent"/>
    <text x="50" y="303" font-family="system-ui, sans-serif" font-weight="500" font-size="13" fill="#cbd5e1">Examinations &amp; Marks</text>
    <rect x="20" y="325" width="220" height="36" rx="10" fill="transparent"/>
    <text x="50" y="348" font-family="system-ui, sans-serif" font-weight="500" font-size="13" fill="#cbd5e1">WhatsApp Bot Engine</text>

    <rect x="260" y="0" width="1020" height="70" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
    <text x="290" y="42" font-family="system-ui, sans-serif" font-weight="800" font-size="20" fill="#0f172a">School Management Dashboard</text>
    <rect x="1100" y="18" width="140" height="36" rx="18" fill="#ecfdf5" stroke="#a7f3d0" stroke-width="1"/>
    <circle cx="1120" cy="36" r="5" fill="#10b981"/>
    <text x="1132" y="41" font-family="system-ui, sans-serif" font-weight="700" font-size="12" fill="#065f46">Academic Live</text>

    <rect x="290" y="100" width="225" height="120" rx="20" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
    <text x="315" y="135" font-family="system-ui, sans-serif" font-weight="600" font-size="12" fill="#64748b">ENROLLED STUDENTS</text>
    <text x="315" y="175" font-family="system-ui, sans-serif" font-weight="900" font-size="32" fill="#1e1b4b">1,305</text>

    <rect x="540" y="100" width="225" height="120" rx="20" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
    <text x="565" y="135" font-family="system-ui, sans-serif" font-weight="600" font-size="12" fill="#64748b">TODAY ATTENDANCE</text>
    <text x="565" y="175" font-family="system-ui, sans-serif" font-weight="900" font-size="32" fill="#059669">96.8%</text>

    <rect x="790" y="100" width="225" height="120" rx="20" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
    <text x="815" y="135" font-family="system-ui, sans-serif" font-weight="600" font-size="12" fill="#64748b">TEACHING STAFF</text>
    <text x="815" y="175" font-family="system-ui, sans-serif" font-weight="900" font-size="32" fill="#4338ca">48</text>

    <rect x="1040" y="100" width="200" height="120" rx="20" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
    <text x="1065" y="135" font-family="system-ui, sans-serif" font-weight="600" font-size="12" fill="#64748b">WHATSAPP DISPATCH</text>
    <text x="1065" y="175" font-family="system-ui, sans-serif" font-weight="900" font-size="32" fill="#0284c7">Active</text>

    <rect x="290" y="245" width="950" height="440" rx="24" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
    <text x="325" y="290" font-family="system-ui, sans-serif" font-weight="800" font-size="17" fill="#0f172a">Academic Performance &amp; Attendance Pulse</text>
    <rect x="325" y="320" width="880" height="2" fill="#f1f5f9"/>

    <rect x="360" y="550" width="40" height="100" rx="6" fill="#4f46e5"/>
    <text x="365" y="670" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">Class 1</text>
    <rect x="430" y="520" width="40" height="130" rx="6" fill="#4f46e5"/>
    <text x="435" y="670" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">Class 2</text>
    <rect x="500" y="490" width="40" height="160" rx="6" fill="#4f46e5"/>
    <text x="505" y="670" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">Class 3</text>
    <rect x="570" y="460" width="40" height="190" rx="6" fill="#4f46e5"/>
    <text x="575" y="670" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">Class 4</text>
    <rect x="640" y="440" width="40" height="210" rx="6" fill="#4f46e5"/>
    <text x="645" y="670" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">Class 5</text>
    <rect x="710" y="420" width="40" height="230" rx="6" fill="#4f46e5"/>
    <text x="715" y="670" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">Class 6</text>
    <rect x="780" y="400" width="40" height="250" rx="6" fill="#4f46e5"/>
    <text x="785" y="670" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">Class 7</text>
    <rect x="850" y="390" width="40" height="260" rx="6" fill="#4f46e5"/>
    <text x="855" y="670" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">Class 8</text>
    <rect x="920" y="370" width="40" height="280" rx="6" fill="#4f46e5"/>
    <text x="925" y="670" font-family="system-ui, sans-serif" font-size="11" fill="#64748b">Class 9</text>
    <rect x="990" y="350" width="40" height="300" rx="6" fill="#059669"/>
    <text x="995" y="670" font-family="system-ui, sans-serif" font-size="11" fill="#059669">Class 10</text>
  </svg>
  `;

  await sharp(Buffer.from(desktopSvg))
    .png()
    .toFile(path.join(screenshotsDir, 'desktop.png'));

  const mobileSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="750" height="1334" viewBox="0 0 750 1334">
    <rect width="750" height="1334" fill="#0f172a"/>
    <rect x="0" y="0" width="750" height="160" fill="#1e1b4b"/>
    <text x="50" y="90" font-family="system-ui, sans-serif" font-weight="900" font-size="28" fill="#ffffff">St. Antony's School ERP</text>
    <text x="50" y="125" font-family="system-ui, sans-serif" font-weight="600" font-size="16" fill="#818cf8">Mobile Academic Portal</text>
    
    <rect x="40" y="190" width="670" height="200" rx="28" fill="#312e81"/>
    <text x="80" y="245" font-family="system-ui, sans-serif" font-weight="700" font-size="16" fill="#c7d2fe">ACADEMIC YEAR 2026-2027</text>
    <text x="80" y="300" font-family="system-ui, sans-serif" font-weight="900" font-size="42" fill="#ffffff">1,305 Active Students</text>
    <text x="80" y="345" font-family="system-ui, sans-serif" font-weight="600" font-size="18" fill="#34d399">✓ Attendance &amp; Marks Synced Live</text>

    <rect x="40" y="420" width="315" height="160" rx="24" fill="#1e293b"/>
    <text x="70" y="480" font-family="system-ui, sans-serif" font-weight="800" font-size="20" fill="#ffffff">Smart Attendance</text>
    <text x="70" y="520" font-family="system-ui, sans-serif" font-weight="500" font-size="14" fill="#94a3b8">Instant Absent Alerts</text>

    <rect x="395" y="420" width="315" height="160" rx="24" fill="#1e293b"/>
    <text x="425" y="480" font-family="system-ui, sans-serif" font-weight="800" font-size="20" fill="#ffffff">Exam Marks</text>
    <text x="425" y="520" font-family="system-ui, sans-serif" font-weight="500" font-size="14" fill="#94a3b8">Class 10 Daily Tests</text>

    <rect x="40" y="610" width="315" height="160" rx="24" fill="#1e293b"/>
    <text x="70" y="670" font-family="system-ui, sans-serif" font-weight="800" font-size="20" fill="#ffffff">Fee Ledger</text>
    <text x="70" y="710" font-family="system-ui, sans-serif" font-weight="500" font-size="14" fill="#94a3b8">Receipts &amp; Dues</text>

    <rect x="395" y="610" width="315" height="160" rx="24" fill="#1e293b"/>
    <text x="425" y="670" font-family="system-ui, sans-serif" font-weight="800" font-size="20" fill="#ffffff">WhatsApp Alerts</text>
    <text x="425" y="710" font-family="system-ui, sans-serif" font-weight="500" font-size="14" fill="#94a3b8">Automated Broadcasts</text>

    <rect x="40" y="800" width="670" height="420" rx="28" fill="#1e293b"/>
    <text x="80" y="860" font-family="system-ui, sans-serif" font-weight="800" font-size="22" fill="#ffffff">Recent Student Highlights</text>
    <rect x="80" y="900" width="590" height="80" rx="16" fill="#334155"/>
    <text x="110" y="948" font-family="system-ui, sans-serif" font-weight="700" font-size="18" fill="#ffffff">Class 10 - Section IPL</text>
    <rect x="80" y="1000" width="590" height="80" rx="16" fill="#334155"/>
    <text x="110" y="1048" font-family="system-ui, sans-serif" font-weight="700" font-size="18" fill="#ffffff">Class 10 - Section M-Batch</text>
    <rect x="80" y="1100" width="590" height="80" rx="16" fill="#334155"/>
    <text x="110" y="1148" font-family="system-ui, sans-serif" font-weight="700" font-size="18" fill="#ffffff">Class 10 - Section S-Batch</text>
  </svg>
  `;

  await sharp(Buffer.from(mobileSvg))
    .png()
    .toFile(path.join(screenshotsDir, 'mobile.png'));

  console.log('All PWA icons and screenshots generated successfully!');
}

generateAssets().catch(err => {
  console.error('Error generating assets:', err);
  process.exit(1);
});
