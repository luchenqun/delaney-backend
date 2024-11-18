import { mudPrice } from '../utils/mud.js'
import { ErrorInputCode, ErrorInputMsg, ErrorDataNotExistCode, ErrorDataNotExistMsg, ErrorBusinessCode, ErrorBusinessMsg } from '../utils/error.js'
import { randRef } from '../utils/index.js'
import { ZeroAddress, ZeroHash, Wallet } from 'ethers'

export default async function (fastify, opts) {
  fastify.get('/', async function (request, reply) {
    return { root: true }
  })

  // 获取mud的价格
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

  // 获取配置列表信息
  // curl http://127.0.0.1:3000/configs | jq
  fastify.get('/configs', async function (request, reply) {
    const { db } = fastify
    const configs = db.prepare('SELECT * FROM config').all()

    return {
      code: 0,
      msg: '',
      data: {
        items: configs
      }
    }
  })

  // 创建用户
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96"}' http://127.0.0.1:3000/create-user | jq
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

  // 获取用户列表
  // curl http://127.0.0.1:3000/users | jq
  fastify.get('/users', async function (request, reply) {
    const { db } = fastify
    const users = db.prepare('SELECT * FROM user').all()

    return {
      code: 0,
      msg: '',
      data: {
        items: users
      }
    }
  })

  // 绑定邀请码
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96", "parent_ref": "888888"}' http://127.0.0.1:3000/bind-parent-ref | jq
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

  // 用户获取质押的签名
  // https://coinsbench.com/how-to-sign-a-message-with-ethers-js-v6-and-then-validate-it-in-solidity-89cd4f172dfd
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96", "mud": 888888}' http://127.0.0.1:3000/sign-delegate
  fastify.post('/sign-delegate', async function (request, reply) {
    const { address, mud } = request.body
    console.log({ address, mud })

    if (!address || !mud) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'address or mud',
        data: {}
      }
    }

    const mudPrice = (new Date().getMinutes() + 1) * 100000 // TODO 实时获取
    const usdt = parseInt(mud) * mudPrice

    const privateKey = 'f78a036930ce63791ea6ea20072986d8c3f16a6811f6a2583b0787c45086f769'
    const signer = new Wallet(privateKey)
    const create_at = new Date().getTime() / 1000 // 秒级就够了

    const signature = await signer.signMessage(address + mud + usdt + create_at)

    reply.send({
      code: 0,
      msg: '',
      data: { address, mud, usdt, create_at, signature }
    })
  })

  // 用户质押
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96", "mud": 888888, "hash": "0xf1b593195df5350a9346e1b14cb37deeab17183a5a2c1ddf28aa9889ca9c5156"}' http://127.0.0.1:3000/delegate
  fastify.post('/delegate', function (request, reply) {
    const { address, mud, hash } = request.body
    const { db } = fastify
    console.log({ address, mud, hash })

    if (!address || !mud || !hash) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'address or mud or hash',
        data: {}
      }
    }

    const mudPrice = (new Date().getMinutes() + 1) * 100000 // TODO 实时获取
    const usdt = parseInt(mud) * mudPrice

    // 获取所有的配置信息
    const configs = db.prepare('SELECT * FROM config').all()
    const config = {}
    for (const item of configs) {
      config[item.key] = item.value
    }

    // 将质押信息插入数据库
    const period_day = config['period_day']
    const period_num = config['period_num']
    const period_reward_ratio = config['period_reward_ratio']
    const stmt = db.prepare('INSERT INTO delegate (address, mud, hash, usdt) VALUES (?, ?, ?, ?)')
    const info = stmt.run(address, mud, hash, usdt)
    console.log(info)

    reply.send({
      code: 0,
      msg: '',
      data: Object.assign(user, { parent_ref, parent: parent.address })
    })
  })

  // 获取用户列表
  // curl http://127.0.0.1:3000/delegates | jq
  fastify.get('/delegates', async function (request, reply) {
    const { db } = fastify
    const delegates = db.prepare('SELECT * FROM delegate').all()

    return {
      code: 0,
      msg: '',
      data: {
        items: delegates
      }
    }
  })
}
