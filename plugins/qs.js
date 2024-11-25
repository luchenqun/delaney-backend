import fp from 'fastify-plugin'
import qs from 'fastify-qs'

/**
 * This plugin for Fastify that adds support for parsing URL query parameters with qs.
 *
 * @see https://github.com/vanodevium/fastify-qs
 */
export default fp(async (fastify) => {
  fastify.register(qs)
})
