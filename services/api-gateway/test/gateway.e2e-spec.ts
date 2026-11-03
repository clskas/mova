import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AUTH_IP_LIMIT } from '../src/proxy/auth-rate-limit.middleware';

describe('ApiGateway (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    global.fetch = jest.fn().mockImplementation((_url, opts?: RequestInit) => {
      opts?.signal?.addEventListener('abort', () => {});
      return Promise.resolve({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });
    }) as unknown as typeof fetch;

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it('/health (GET) returns aggregated status', () => {
    return request(app.getHttpServer()).get('/health').expect(200).expect((res) => {
      expect(res.body.service).toBe('api-gateway');
      expect(res.body.services).toBeDefined();
    });
  });

  it('/health/live (GET) returns process liveness', () => {
    return request(app.getHttpServer()).get('/health/live').expect(200).expect((res) => {
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('api-gateway');
      expect(res.body.services).toBeUndefined();
    });
  });

  it('/health (GET) sets X-Request-Id', () => {
    return request(app.getHttpServer())
      .get('/health')
      .set('X-Request-Id', 'test-correlation-id')
      .expect(200)
      .expect((res) => {
        expect(res.headers['x-request-id']).toBe('test-correlation-id');
      });
  });

  it('/health (GET) generates X-Request-Id when missing', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.headers['x-request-id']).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
      });
  });
  it('rate-limits OTP requests per client IP before proxying', async () => {
    const server = app.getHttpServer();
    const ip = '203.0.113.77';
    for (let i = 0; i < AUTH_IP_LIMIT; i++) {
      const res = await request(server).post('/api/auth/otp/request').set('X-Forwarded-For', ip).send({});
      expect(res.status).not.toBe(429);
    }
    const blocked = await request(server).post('/api/auth/otp/request').set('X-Forwarded-For', ip).send({});
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    const otherIp = await request(server)
      .post('/api/auth/otp/request')
      .set('X-Forwarded-For', '203.0.113.78')
      .send({});
    expect(otherIp.status).not.toBe(429);
  }, 120000);
});
