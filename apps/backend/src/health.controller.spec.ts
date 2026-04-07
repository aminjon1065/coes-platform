import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns backend health metadata', () => {
    const controller = new HealthController();

    const result = controller.getHealth();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('coescd-backend');
    expect(typeof result.timestamp).toBe('string');
    expect(typeof result.uptimeSeconds).toBe('number');
  });
});
