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
    console.log('blockTag --->', request.query.blockTag, blockTag)

    return { price: await mudPrice(blockTag), blockTag }
  })
}
