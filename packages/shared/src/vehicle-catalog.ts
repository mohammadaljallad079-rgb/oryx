/**
 * The vehicle reference catalogue.
 *
 * The garage form used to be seven free-text inputs, so the same car arrived as
 * "Toyota Camry", "toyota camry" and "TOYTA CAMRY" and no report could group by
 * make. This is the single list the pickers read, so a make is chosen from the
 * set the business actually services and a model is limited to the models that
 * make sells.
 *
 * It is deliberately data, not a database table: the list is small, changes
 * rarely, and shipping it in the bundle lets the form open a dependent model
 * list with no round trip. The server validates against the same list, so a
 * hand-crafted request cannot store a make the app would never offer.
 *
 * The list covers the makes with a meaningful presence in the Bahrain market —
 * the tenants ORYX serves — and is not intended to be exhaustive worldwide.
 */

export interface VehicleMakeDefinition {
  /** Persisted value, matched case-insensitively on the server. */
  make: string;
  makeAr: string;
  /** Models this make sells, most common first. */
  models: readonly string[];
  /** First model year the make is offered in this catalogue. */
  fromYear: number;
}

export const VEHICLE_MAKES: readonly VehicleMakeDefinition[] = [
  { make: 'Toyota', makeAr: 'تويوتا', fromYear: 1990, models: ['Corolla', 'Camry', 'Land Cruiser', 'Prado', 'Hilux', 'RAV4', 'Yaris', 'Avalon', 'Fortuner', 'Innova'] },
  { make: 'Nissan', makeAr: 'نيسان', fromYear: 1990, models: ['Sunny', 'Altima', 'Patrol', 'X-Trail', 'Navara', 'Kicks', 'Maxima', 'Pathfinder', 'Sentra'] },
  { make: 'Honda', makeAr: 'هوندا', fromYear: 1990, models: ['Civic', 'Accord', 'CR-V', 'Pilot', 'City', 'HR-V', 'Odyssey'] },
  { make: 'Hyundai', makeAr: 'هيونداي', fromYear: 1995, models: ['Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Accent', 'Creta', 'Azera', 'Palisade'] },
  { make: 'Kia', makeAr: 'كيا', fromYear: 1995, models: ['Rio', 'Cerato', 'Sportage', 'Sorento', 'Seltos', 'Carnival', 'K5', 'Pegas'] },
  { make: 'Mitsubishi', makeAr: 'ميتسوبيشي', fromYear: 1990, models: ['Lancer', 'Pajero', 'Attrage', 'Outlander', 'L200', 'Montero Sport', 'ASX'] },
  { make: 'Mazda', makeAr: 'مازدا', fromYear: 1990, models: ['Mazda 3', 'Mazda 6', 'CX-5', 'CX-9', 'CX-30', 'MX-5', 'BT-50'] },
  { make: 'Lexus', makeAr: 'لكزس', fromYear: 1995, models: ['ES', 'RX', 'LX', 'GX', 'NX', 'IS', 'LS', 'UX'] },
  { make: 'Mercedes-Benz', makeAr: 'مرسيدس-بنز', fromYear: 1990, models: ['C-Class', 'E-Class', 'S-Class', 'GLC', 'GLE', 'G-Class', 'A-Class', 'CLA', 'V-Class'] },
  { make: 'BMW', makeAr: 'بي إم دبليو', fromYear: 1990, models: ['3 Series', '5 Series', '7 Series', 'X1', 'X3', 'X5', 'X6', 'X7', '1 Series'] },
  { make: 'Audi', makeAr: 'أودي', fromYear: 1995, models: ['A3', 'A4', 'A6', 'A8', 'Q3', 'Q5', 'Q7', 'Q8'] },
  { make: 'Volkswagen', makeAr: 'فولكس فاغن', fromYear: 1990, models: ['Golf', 'Passat', 'Tiguan', 'Touareg', 'Jetta', 'Polo', 'Teramont'] },
  { make: 'Ford', makeAr: 'فورد', fromYear: 1990, models: ['F-150', 'Explorer', 'Edge', 'Escape', 'Expedition', 'Mustang', 'Ranger', 'Taurus'] },
  { make: 'Chevrolet', makeAr: 'شيفروليه', fromYear: 1990, models: ['Silverado', 'Tahoe', 'Suburban', 'Malibu', 'Captiva', 'Traverse', 'Camaro'] },
  { make: 'Jeep', makeAr: 'جيب', fromYear: 1995, models: ['Wrangler', 'Grand Cherokee', 'Cherokee', 'Compass', 'Renegade', 'Gladiator'] },
  { make: 'Land Rover', makeAr: 'لاند روفر', fromYear: 1995, models: ['Range Rover', 'Range Rover Sport', 'Discovery', 'Defender', 'Discovery Sport', 'Velar', 'Evoque'] },
  { make: 'Porsche', makeAr: 'بورش', fromYear: 1995, models: ['911', 'Cayenne', 'Macan', 'Panamera', 'Taycan', '718 Boxster', '718 Cayman'] },
  { make: 'Volvo', makeAr: 'فولفو', fromYear: 1995, models: ['XC90', 'XC60', 'XC40', 'S60', 'S90', 'V60'] },
  { make: 'Peugeot', makeAr: 'بيجو', fromYear: 1995, models: ['208', '2008', '3008', '5008', '301', '508', 'Partner'] },
  { make: 'Renault', makeAr: 'رينو', fromYear: 1995, models: ['Duster', 'Koleos', 'Megane', 'Captur', 'Symbol', 'Clio'] },
  { make: 'Suzuki', makeAr: 'سوزوكي', fromYear: 1995, models: ['Swift', 'Vitara', 'Jimny', 'Baleno', 'Ertiga', 'S-Cross'] },
  { make: 'Isuzu', makeAr: 'إيسوزو', fromYear: 1995, models: ['D-Max', 'MU-X', 'NPR', 'NQR'] },
  { make: 'GMC', makeAr: 'جي إم سي', fromYear: 1995, models: ['Sierra', 'Yukon', 'Terrain', 'Acadia', 'Canyon'] },
  { make: 'Tesla', makeAr: 'تسلا', fromYear: 2015, models: ['Model 3', 'Model S', 'Model X', 'Model Y'] },
  { make: 'Genesis', makeAr: 'جينيسيس', fromYear: 2015, models: ['G70', 'G80', 'G90', 'GV70', 'GV80'] },
  { make: 'MG', makeAr: 'إم جي', fromYear: 2015, models: ['ZS', 'HS', 'RX5', 'MG5', 'MG6'] },
  { make: 'Geely', makeAr: 'جيلي', fromYear: 2015, models: ['Coolray', 'Emgrand', 'Tugella', 'Okavango'] },
  { make: 'Chery', makeAr: 'شيري', fromYear: 2015, models: ['Tiggo 4', 'Tiggo 7', 'Tiggo 8', 'Arrizo 5'] },
  { make: 'Other', makeAr: 'أخرى', fromYear: 1950, models: ['Other'] },
] as const;

/** The newest model year a vehicle can be, ahead of the next model launch. */
export function currentModelYear(now: Date = new Date()): number {
  return now.getFullYear() + 1;
}

/** Model years offered for a make, newest first. */
export function modelYears(make: string, now: Date = new Date()): number[] {
  const def = vehicleMake(make);
  const first = def?.fromYear ?? 1990;
  const last = currentModelYear(now);
  const years: number[] = [];
  for (let y = last; y >= first; y -= 1) years.push(y);
  return years;
}

/** A make definition, matched case-insensitively. */
export function vehicleMake(make: string): VehicleMakeDefinition | undefined {
  const needle = make.trim().toLowerCase();
  return VEHICLE_MAKES.find((m) => m.make.toLowerCase() === needle);
}

/** The models a make sells, or an empty list for an unknown make. */
export function vehicleModels(make: string): readonly string[] {
  return vehicleMake(make)?.models ?? [];
}

/** True when `model` belongs to `make` in the catalogue. */
export function isKnownModel(make: string, model: string): boolean {
  const needle = model.trim().toLowerCase();
  return vehicleModels(make).some((m) => m.toLowerCase() === needle);
}

/**
 * Canonicalises a make, returning the catalogue spelling when the value is
 * known and the trimmed input otherwise, so a legacy free-text row is preserved
 * rather than silently rewritten.
 */
export function canonicalMake(make: string): string {
  return vehicleMake(make)?.make ?? make.trim();
}

/** Canonicalises a model for a make, preserving an unknown legacy value. */
export function canonicalModel(make: string, model: string): string {
  const needle = model.trim().toLowerCase();
  return vehicleModels(make).find((m) => m.toLowerCase() === needle) ?? model.trim();
}

/** The shape the client pickers consume. */
export interface VehicleCatalogResponse {
  makes: Array<{ make: string; makeAr: string; models: string[]; fromYear: number }>;
  maxYear: number;
  minYear: number;
}
