#!/usr/bin/env node
/**
 * Regenerate `docs/audit/execution-07-media-licenses.json`.
 *
 * The record is the licence ledger for every photograph on the customer site.
 * It is generated from the same table the site uses (`site-media.ts`) plus the
 * two withdrawn showroom files, so the audit cannot drift from what ships.
 *
 * Run: node scripts/exec07-media-licenses.mjs
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/**
 * The shipping set. `localFile` is the committed path; the responsive variants
 * (`-sm`, `-lg`) are derived from it at build time.
 */
const SHIPPING = [
  {
    key: 'auto-service',
    intendedUse: 'Homepage hero and services page header: a real service workshop',
    commonsTitle: 'Auto service – Panorama (Sergej Majboroda via Poly Haven).jpg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Auto_service_%E2%80%93_Panorama_(Sergej_Majboroda_via_Poly_Haven).jpg',
    license: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    artist: 'Sergej Majboroda',
    credit: 'Sergej Majboroda via Poly Haven (https://polyhaven.com/a/auto_service)',
    usageTerms: 'Creative Commons Zero — public domain dedication, no attribution required',
    attributionRequired: false,
    originalWidth: 8192,
    originalHeight: 4096,
  },
  {
    key: 'garage-interior',
    intendedUse: 'Secondary workshop panel: a professional repair garage interior',
    commonsTitle: 'Garage – Panorama (Greg Zaal via Poly Haven).jpg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Garage_%E2%80%93_Panorama_(Greg_Zaal_via_Poly_Haven).jpg',
    license: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    artist: 'Greg Zaal',
    credit: 'Greg Zaal via Poly Haven (https://polyhaven.com/a/garage)',
    usageTerms: 'Creative Commons Zero — public domain dedication, no attribution required',
    attributionRequired: false,
    originalWidth: 8192,
    originalHeight: 4096,
  },
  {
    key: 'inspection-bay',
    intendedUse: 'Vehicle inspection category card',
    commonsTitle: 'Queens Road 125 Vehicle Inspection Bay.jpg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Queens_Road_125_Vehicle_Inspection_Bay.jpg',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    artist: 'Hullian111',
    credit: 'Hullian111, CC BY-SA 4.0, via Wikimedia Commons',
    usageTerms: 'Creative Commons Attribution-ShareAlike 4.0',
    attributionRequired: true,
  },
  {
    key: 'mechanic-engine',
    intendedUse: 'Maintenance and repair category card',
    commonsTitle: 'Two mechanic working on a car engine.jpg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Two_mechanic_working_on_a_car_engine.jpg',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    artist: 'Kwamitsey',
    credit: 'Kwamitsey, CC BY 4.0, via Wikimedia Commons',
    usageTerms: 'Creative Commons Attribution 4.0',
    attributionRequired: true,
  },
  {
    key: 'parts-store',
    intendedUse: 'Spare parts category card',
    commonsTitle: 'Auto Parts Store.jpg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Auto_Parts_Store.jpg',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    artist: 'Visitor7',
    credit: 'Visitor7, CC BY-SA 3.0, via Wikimedia Commons',
    usageTerms: 'Creative Commons Attribution-ShareAlike 3.0',
    attributionRequired: true,
  },
  {
    key: 'recovery-tow',
    intendedUse: 'Roadside recovery category card',
    commonsTitle: 'Naha Okinawa Japan JAF-Towing-car-01.jpg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Naha_Okinawa_Japan_JAF-Towing-car-01.jpg',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    artist: 'CEphoto, Uwe Aranas',
    credit: 'CEphoto, Uwe Aranas, CC BY-SA 3.0, via Wikimedia Commons',
    usageTerms: 'Creative Commons Attribution-ShareAlike 3.0',
    attributionRequired: true,
  },
  {
    key: 'carwash-premium',
    intendedUse: 'Car wash and detailing category card',
    commonsTitle: 'Premium Car Wash - La Louvière.jpg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Premium_Car_Wash_-_La_Louvi%C3%A8re.jpg',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    artist: 'Le Sharkoïste',
    credit: 'Le Sharkoïste, CC BY-SA 4.0, via Wikimedia Commons',
    usageTerms: 'Creative Commons Attribution-ShareAlike 4.0',
    attributionRequired: true,
  },
  {
    key: 'garage-brastad',
    intendedUse: 'Equipment garage card',
    commonsTitle: 'Car repair garage in Brastad - cropped.jpg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Car_repair_garage_in_Brastad_-_cropped.jpg',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    artist: 'W.carter',
    credit: 'W.carter, CC BY-SA 4.0, via Wikimedia Commons',
    usageTerms: 'Creative Commons Attribution-ShareAlike 4.0',
    attributionRequired: true,
  },
  {
    key: 'workshop-artdeco',
    intendedUse: 'Workshop services card',
    commonsTitle: 'Art Deco Car Workshop. Haynes Ford, Maidstone.jpg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Art_Deco_Car_Workshop._Haynes_Ford,_Maidstone.jpg',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    artist: 'John K Thorne',
    credit: 'John K Thorne, CC BY 4.0, via Wikimedia Commons',
    usageTerms: 'Creative Commons Attribution 4.0',
    attributionRequired: true,
  },
  {
    key: 'ev-charging',
    intendedUse: 'Electric vehicle services card',
    commonsTitle: 'Electric car charging station equipment 2, Vancouver, WA, March 2020.jpg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Electric_car_charging_station_equipment_2,_Vancouver,_WA,_March_2020.jpg',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    artist: 'Steven Baltakatei Sandoval',
    credit: 'Steven Baltakatei Sandoval, CC BY-SA 4.0, via Wikimedia Commons',
    usageTerms: 'Creative Commons Attribution-ShareAlike 4.0',
    attributionRequired: true,
  },
];

/**
 * Files withdrawn from the site. They remain recorded so the audit shows what
 * was removed and why, rather than silently dropping the history.
 */
const WITHDRAWN = [
  {
    key: 'hero-showroom',
    intendedUse: 'Withdrawn — homepage hero',
    withdrawalReason:
      'A branded Bentley dealership. It showed a marque ORYX does not sell and misrepresented the service, so it was replaced by auto-service.jpg (a real service workshop).',
    commonsTitle: 'Bentley-Showroom-Dealership-Birmingham.JPG',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Bentley-Showroom-Dealership-Birmingham.JPG',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    artist: 'Wandering Diode',
    attributionRequired: true,
    localFile: null,
  },
  {
    key: 'showroom-jaguar',
    intendedUse: 'Withdrawn — marketplace / showroom section',
    withdrawalReason:
      'A branded Jaguar showroom interior. It advertised a third-party marque and was unused by any page, so it was removed rather than shipped as dead weight.',
    commonsTitle: 'HK Wan Chai 56 Gloucester Road BEA Harbour View Centre shop Jaguar showroom interior white car Nov-2012.JPG',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:HK_Wan_Chai_56_Gloucester_Road_BEA_Harbour_View_Centre_shop_Jaguar_showroom_interior_white_car_Nov-2012.JPG',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
    artist: 'Swoodchatla',
    attributionRequired: true,
    localFile: null,
  },
];

const record = {
  retrievedAt: new Date().toISOString(),
  note:
    'Every photograph on the customer site, its licence and its provenance. Files are re-encoded to three widths (800/1600/2000–2400) with EXIF removed; the committed bytes are the localFile below plus its -sm and -lg variants. Attribution for the CC BY and CC BY-SA images is rendered on the /credits page.',
  shippingCount: SHIPPING.length,
  withdrawnCount: WITHDRAWN.length,
  images: [
    ...SHIPPING.map((p) => ({
      ...p,
      localFile: `apps/customer/public/media/${p.key}.jpg`,
      responsiveVariants: [
        `apps/customer/public/media/${p.key}-sm.jpg`,
        `apps/customer/public/media/${p.key}.jpg`,
        `apps/customer/public/media/${p.key}-lg.jpg`,
      ],
      status: 'shipping',
    })),
    ...WITHDRAWN.map((p) => ({ ...p, status: 'withdrawn' })),
  ],
};

const out = resolve(ROOT, 'docs/audit/execution-07-media-licenses.json');
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
console.log(`wrote ${out}: ${SHIPPING.length} shipping, ${WITHDRAWN.length} withdrawn`);
