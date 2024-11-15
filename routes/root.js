import { mudPrice } from '../utils/mud.js'

export default async function (fastify, opts) {
  fastify.get('/', async function (request, reply) {
    return { root: true }
  })

  fastify.get('/mud-price', async function (request, reply) {
    let blockTag = 'latest'

    if (/^\d+$/.test(request.query.blockTag)) {
      blockTag = parseInt(request.query.blockTag)
    }
    // [46000000, 50702048, 54702048, 64188580, 64188680, 'latest']
    // 0x2b4a7f89a40e25b83ceeb858e44524452d4fa056a44c0a36e64263e16a1e5197
    console.log('blockTag --->', request.query.blockTag, blockTag)
    const price = await mudPrice(blockTag)
    console.log('price', price)

    return { ...price, blockTag }
  })

  fastify.get('/sqlite', function (request, reply) {
    const { num } = fastify.db.prepare(`SELECT Count(*) AS num FROM t`).get()

    const rows = fastify.db.prepare('SELECT * FROM t LIMIT 10').all()

    reply.send({
      message: 'case 2: these results from db file created by connection in the same file as the plugin',
      'count of rows': num,
      rows
    })
  })
}
