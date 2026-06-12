import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

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
});
