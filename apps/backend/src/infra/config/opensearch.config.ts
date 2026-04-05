import { registerAs } from '@nestjs/config';

export default registerAs('opensearch', () => ({
  node:     process.env.OPENSEARCH_NODE ?? 'http://localhost:9200',
  username: process.env.OPENSEARCH_USERNAME ?? undefined,
  password: process.env.OPENSEARCH_PASSWORD ?? undefined,
  /** Index name prefix — environment-specific to avoid collisions */
  indexPrefix: process.env.OPENSEARCH_INDEX_PREFIX ?? 'coescd',
}));
