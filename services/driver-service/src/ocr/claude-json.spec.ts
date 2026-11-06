import { claudeAvailable, vehiclePhotoPrompt, vehiclePhotoVerdict } from './claude-json';

describe('vehicle photo check', () => {
  const clean = {
    photosShowVehicle: true,
    sameVehicleOnAllPhotos: true,
    matchesDeclaredType: true,
    plateMatchesDeclared: true,
    volumePlausible: null,
    issues: [],
    confidence: 0.9,
  };

  it('is OK when everything matches with good confidence', () => {
    expect(vehiclePhotoVerdict(clean)).toBe('OK');
  });

  it('flags a problem when the type or the plate differ, or there is no vehicle', () => {
    expect(vehiclePhotoVerdict({ ...clean, matchesDeclaredType: false })).toBe('PROBLEME');
    expect(vehiclePhotoVerdict({ ...clean, plateMatchesDeclared: false })).toBe('PROBLEME');
    expect(vehiclePhotoVerdict({ ...clean, photosShowVehicle: false })).toBe('PROBLEME');
  });

  it('asks to check on issues, low confidence, implausible volume or no answer', () => {
    expect(vehiclePhotoVerdict({ ...clean, issues: ['Photo floue'] })).toBe('A_VERIFIER');
    expect(vehiclePhotoVerdict({ ...clean, confidence: 0.4 })).toBe('A_VERIFIER');
    expect(vehiclePhotoVerdict({ ...clean, volumePlausible: false })).toBe('A_VERIFIER');
    expect(vehiclePhotoVerdict(null)).toBe('A_VERIFIER');
  });

  it('puts the declaration in the prompt', () => {
    const p = vehiclePhotoPrompt({ type: 'CAMION', plateNumber: 'CD-123', cargoVolumeM3: 30 });
    expect(p).toContain('CAMION');
    expect(p).toContain('CD-123');
    expect(p).toContain('30 m³');
  });

  it('needs AI_ENABLED and a key', () => {
    expect(claudeAvailable({ AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'k' })).toBe(true);
    expect(claudeAvailable({ AI_ENABLED: 'false', ANTHROPIC_API_KEY: 'k' })).toBe(false);
    expect(claudeAvailable({ AI_ENABLED: 'true' })).toBe(false);
  });
});
