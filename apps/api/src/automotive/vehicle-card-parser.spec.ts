import { parseRegistrationCard } from './vehicle-card-parser';

/**
 * The registration-card parser is pure, so it is checked here against text of
 * the shape the OCR engine actually emits (Arabic and English on the same line)
 * without loading the engine.
 */
describe('parseRegistrationCard', () => {
  it('reads a labelled Arabic + English card', () => {
    const text = [
      'PLATE NO 649525 رقم اللوحة',
      'MAKE Mercedes الشركة المصنعة',
      'MODEL E300 الطراز',
      'YEAR 2020 سنة الصنع',
      'COLOR Gray اللون',
      'CHASSIS NO JTHDA1D20P5125981 رقم الشاصي',
    ].join('\n');

    const { fields, uncertain } = parseRegistrationCard(text);

    expect(fields).toEqual({
      plateNumber: '649525',
      make: 'Mercedes',
      model: 'E300',
      modelYear: 2020,
      color: 'Gray',
      vin: 'JTHDA1D20P5125981',
    });
    expect(uncertain).toEqual([]);
  });

  it('normalizes Arabic-Indic digits and strips bidi marks', () => {
    const text = 'PLATE NO ٦٤٩٥٢٥ \u200fرقم اللوحة\nYEAR ٢٠٢٠ سنة الصنع';
    const { fields } = parseRegistrationCard(text);
    expect(fields.plateNumber).toBe('649525');
    expect(fields.modelYear).toBe(2020);
  });

  it('does not mistake a model year for a plate number', () => {
    const text = 'MAKE Toyota\nMODEL Corolla\nYEAR 2019';
    const { fields, uncertain } = parseRegistrationCard(text);
    expect(fields.modelYear).toBe(2019);
    expect(fields.plateNumber).toBeNull();
    expect(uncertain).toContain('plateNumber');
  });

  it('reports every field it could not read as uncertain', () => {
    const { fields, uncertain } = parseRegistrationCard('MAKE Nissan');
    expect(fields.make).toBe('Nissan');
    expect(fields.vin).toBeNull();
    expect(uncertain.sort()).toEqual(['color', 'model', 'modelYear', 'plateNumber', 'vin'].sort());
  });

  it('rejects a chassis number that is too short to be a VIN', () => {
    const { fields } = parseRegistrationCard('CHASSIS NO ABC123');
    expect(fields.vin).toBeNull();
  });
});
