// lib/mcp-client.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StdioClientTransport,
  type StdioServerParameters
} from '@modelcontextprotocol/sdk/client/stdio.js'

type ClientInfo = {
  name: string
  version: string
}

type McpConnection = {
  client: Client
  transport: StdioClientTransport
}

const DEFAULT_CLIENT_INFO: ClientInfo = {
  name: 'mcp-security-incidents',
  version: '0.1.0'
}

const connections = new Map<string, Promise<McpConnection>>()
let cleanupRegistered = false

async function createConnection(
  id: string,
  params: StdioServerParameters,
  clientInfo: ClientInfo
): Promise<McpConnection> {
  const client = new Client(clientInfo)
  const transport = new StdioClientTransport(params)
  await client.connect(transport)
  registerCleanupHooks()
  return { client, transport }
}

function registerCleanupHooks() {
  if (cleanupRegistered) return
  cleanupRegistered = true
  const cleanup = () => {
    for (const promise of connections.values()) {
      promise
        .then(({ client }) => client.close().catch(() => {}))
        .catch(() => {})
    }
  }
  process.once('exit', cleanup)
  process.once('SIGINT', () => {
    cleanup()
    process.exit(130)
  })
  process.once('SIGTERM', () => {
    cleanup()
    process.exit(143)
  })
}

export async function getMcpClient(
  id: string,
  params: StdioServerParameters,
  clientInfo: ClientInfo = DEFAULT_CLIENT_INFO
): Promise<Client> {
  let existing = connections.get(id)
  if (!existing) {
    existing = createConnection(id, params, clientInfo).catch(error => {
      connections.delete(id)
      throw error
    })
    connections.set(id, existing)
  }
  const { client } = await existing
  return client
}
