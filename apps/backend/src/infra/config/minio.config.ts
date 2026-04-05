import { registerAs } from '@nestjs/config';

export default registerAs('minio', () => ({
  endPoint:  process.env.MINIO_ENDPOINT ?? 'localhost',
  port:      parseInt(process.env.MINIO_PORT ?? '9000', 10),
  useSSL:    process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER ?? 'minioadmin',
  secretKey: process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin',
  bucket:    process.env.MINIO_BUCKET ?? 'coescd-files',
}));
