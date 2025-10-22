import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'firecrawl-tester', version: '0.0.1' });
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', 'firecrawl-mcp'],
  env: { FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY }
});

await client.connect(transport);
const res = await client.callTool({
  name: 'firecrawl_scrape',
  arguments: { url: 'https://example.com', formats: ['markdown'] }
});
console.log(res);
await client.close();
