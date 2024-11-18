import { mudPrice } from '../utils/mud.js'
import { ErrorInputCode, ErrorInputMsg, ErrorDataNotExistCode, ErrorDataNotExistMsg, ErrorBusinessCode, ErrorBusinessMsg } from '../utils/error.js'
import { randRef } from '../utils/index.js'
import { ZeroAddress, ZeroHash } from 'ethers'

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

  // 创建用户
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96"}' http://127.0.0.1:3000/create-user
  fastify.post('/create-user', function (request, reply) {
    const { address } = request.body
    const { db } = fastify
    console.log({ address })

    if (!address) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'address',
        data: {}
      }
    }

    const ref = randRef()
    const stmt = db.prepare('INSERT INTO user (address, ref) VALUES (?, ?)')
    const info = stmt.run(address, ref)
    console.log(info)
    const user = db.prepare('SELECT * FROM user WHERE address = ?').get(address)

    reply.send({
      code: 0,
      msg: '',
      data: user
    })
  })

  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96", "parent_ref": "888888"}' http://127.0.0.1:3000/bind-parent-ref
  fastify.post('/bind-parent-ref', function (request, reply) {
    const { address, parent_ref } = request.body
    const { db } = fastify
    console.log({ address, parent_ref })

    if (!parent_ref || !address) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'address or parent_ref',
        data: {}
      }
    }

    // 检查用户是否存在
    const user = db.prepare('SELECT * FROM user WHERE address = ?').get(address)
    if (!user) {
      return {
        code: ErrorDataNotExistCode,
        msg: ErrorDataNotExistMsg + `no user corresponding to this address ${address}`,
        data: {}
      }
    }

    // 不允许重复绑定
    if (user.parent_ref) {
      return {
        code: ErrorBusinessCode,
        msg: ErrorBusinessMsg + `you have bind a ref ${user.parent_ref}`,
        data: {}
      }
    }

    console.log('user', user)

    // 检查父用户是否存在
    const parent = db.prepare('SELECT address FROM user WHERE ref = ?').get(parent_ref)
    if (!parent) {
      return {
        code: ErrorDataNotExistCode,
        msg: ErrorDataNotExistMsg + `no user corresponding to this ref ${parent_ref}`,
        data: {}
      }
    }
    console.log('parent', parent)

    // 完成绑定关系
    db.prepare('UPDATE user SET parent = ?, parent_ref = ? WHERE address = ?').run(parent.address, parent_ref, address)

    reply.send({
      code: 0,
      msg: '',
      data: Object.assign(user, { parent_ref, parent: parent.address })
    })
  })
}
