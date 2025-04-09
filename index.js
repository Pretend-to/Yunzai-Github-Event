import http from 'http'
import crypto from 'crypto'
import { loadConfig } from './utils/config.js'
import { handleEvent } from './utils/eventHandler.js'

// Load configuration
const config = loadConfig()

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === config.server.webhook_path) {
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })
    req.on('end', async () => {
      const signature = req.headers['x-hub-signature']
      const event = req.headers['x-github-event']

      if (!verifySignature(signature, body, config.webhook_secret)) {
        logger.error('Signature verification failed!')
        res.writeHead(401)
        res.end('Invalid signature')
        return
      }

      try {
        const payload = JSON.parse(body)
        await handleEvent(payload, event, config)
        res.writeHead(200)
        res.end('OK')
      } catch (error) {
        logger.error(`Error processing webhook: ${error}`)
        res.writeHead(500)
        res.end('Internal Server Error')
      }
    })
  } else {
    res.writeHead(404)
    res.end('Not found')
  }
})

function verifySignature(signature, payload, secret) {
  try {
    const hmac = crypto.createHmac('sha1', secret)
    const digest = Buffer.from(`sha1=${hmac.update(payload).digest('hex')}`, 'utf8')
    const checksum = Buffer.from(signature, 'utf8')

    if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
      return false
    }
    return true
  } catch (error) {
    logger.error(`Error verifying signature: ${error}`)
    return false
  }
}

server.listen(config.server.port, () => {
  logger.mark(`GitHub webhook server listening on port ${config.server.port}`)
})
