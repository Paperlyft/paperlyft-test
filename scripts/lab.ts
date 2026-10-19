import { startLab } from '../src/lab/server.js'
const url = new URL(process.env.PAPERLYFT_LAB_BASE_URL ?? 'http://127.0.0.1:4179')
const lab = await startLab({ host: url.hostname, port: Number(url.port || 4179) })
console.log(`Synthetic fixture website: ${lab.baseURL}. Press Ctrl+C to stop.`)
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void lab.close().then(() => process.exit(0))
  })
