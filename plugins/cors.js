import fp from 'fastify-plugin'
import cors from '@fastify/cors'

/**
 * This plugins enables the use of CORS in a Fastify application
 *
 * @see https://github.com/fastify/fastify-cors
 */
export default fp(async (fastify) => {
  fastify.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
})
