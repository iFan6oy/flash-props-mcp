// Stdio transport entry point for MCP clients that expect a stdio server
// (e.g. Glama's mcp-proxy quality check, local Claude Desktop config).
// Boots with the free tier -- no API key required.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildMcpServer } from './mcp/server.js';
import { ensureSchema } from './db/client.js';
import { TIERS } from './config/tiers.js';

ensureSchema();

const server = buildMcpServer(TIERS.free);
const transport = new StdioServerTransport();
await server.connect(transport);
