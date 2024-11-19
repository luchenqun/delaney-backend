import { mudPrice } from '../utils/mud.js'
import { ErrorInputCode, ErrorInputMsg, ErrorDataNotExistCode, ErrorDataNotExistMsg, ErrorBusinessCode, ErrorBusinessMsg } from '../utils/error.js'
import { randRef } from '../utils/index.js'
import { ZeroAddress, ZeroHash, Wallet } from 'ethers'

export default async function (fastify, opts) {
  fastify.get('/', async function (request, reply) {
    return { root: true }
  })

  // 获取mud的价格
  // curl http://127.0.0.1:3000/mud-price | jq
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
  // TODO: 为了防止用户恶意注册，会检查用户相关条件，比如：是否有POL，是否有MUD代币，是否有USDT，是否nonce大于0
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96", "parent_ref": "888888"}' http://127.0.0.1:3000/create-user | jq
  fastify.post('/create-user', function (request, reply) {
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

    // 检查用户是否存在，只要存在就一定是绑定过了，不允许重复绑定
    const user = db.prepare('SELECT * FROM user WHERE address = ?').get(address)
    if (user) {
      return {
        code: ErrorBusinessCode,
        msg: ErrorDataNotExistMsg + `user ${address} already exist`,
        data: {}
      }
    }

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
    const ref = randRef() // 数据库里面已经做了ref不允许重复存在的限制。所以有一定概率注册失败，如果注册失败，让前端再重新注册一下
    const info = db.prepare('INSERT INTO user (address, parent, ref, parent_ref) VALUES (?, ?, ?, ?)').run(address, parent.address, ref, parent_ref)
    console.log(info)

    reply.send({
      code: 0,
      msg: '',
      data: { ref, parent: parent.address, id: info.lastInsertRowid }
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

  // 获取用户的奖励信息
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96"}' http://127.0.0.1:3000/claim
  fastify.get('/claim', async function (request, reply) {
    const { db } = fastify
    return {
      code: 0,
      msg: '',
      data: {
        address: '0x0000000bA7906929D5629151777BC2321346828D',
        usdt: 100000000000,
        mudMin: 1000000000,
        claimIds: { dynamic: [1, 2, 6], static: [2, 8] }
      }
    }
  })

  // 用户质押
  // TODO: 为了防止恶意插入数据，用户质押的数目超过1000条，我们只有拿到回执了我们才会插入数据
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96", "mud": 888888, "hash": "0xf1b593195df5350a9346e1b14cb37deeab17183a5a2c1ddf28aa9889ca9c5156"}' http://127.0.0.1:3000/delegate
  fastify.post('/delegate', function (request, reply) {
    const { address, mud, hash, min_usdt } = request.body
    const { db } = fastify
    console.log({ address, mud, hash })

    if (!address || !mud || !hash || min_usdt == undefined) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'address or mud or hash or min_usdt',
        data: {}
      }
    }

    // 将质押信息插入数据库
    const stmt = db.prepare('INSERT INTO delegate (address, mud, min_usdt, hash) VALUES (?, ?, ?, ?)')
    const info = stmt.run(address, mud, min_usdt, hash)
    console.log(info)

    reply.send({
      code: 0,
      msg: '',
      data: Object.assign({}, { id: info.lastInsertRowid })
    })
  })

  // 用户质押
  // TODO: 为了防止恶意插入数据，用户质押的数目超过1000条，我们只有拿到回执了我们才会插入数据
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96", "mud": 888888, "hash": "0xf1b593195df5350a9346e1b14cb37deeab17183a5a2c1ddf28aa9889ca9c5156"}' http://127.0.0.1:3000/delegate
  fastify.post('/confirm-delegate', function (request, reply) {
    const { hash } = request.body
    const { db } = fastify
    console.log({ hash })

    if (!hash) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'hash',
        data: {}
      }
    }

    // 将质押信息插入数据库
    const stmt = db.prepare('INSERT INTO delegate (address, mud, min_usdt, hash) VALUES (?, ?, ?, ?)')
    const info = stmt.run(address, mud, min_usdt, hash)
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

  // 用户获取领取奖励的签名
  // https://coinsbench.com/how-to-sign-a-message-with-ethers-js-v6-and-then-validate-it-in-solidity-89cd4f172dfd
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96"}' http://127.0.0.1:3000/sign-claim
  fastify.post('/sign-claim', async function (request, reply) {
    const { address, usdt, mudMin, claimIds, deadline } = request.body

    if (!address) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'address',
        data: {}
      }
    }

    // claimIds 是用户去领取了哪些奖励id，比如 "{dynamic:[1,5,6], static:[1,8,9]}"
    // TODO: 检查 claimIds 对应的 usdt 之和 是否等于用户传进来的usdt的数值

    const privateKey = 'f78a036930ce63791ea6ea20072986d8c3f16a6811f6a2583b0787c45086f769'
    const signer = new Wallet(privateKey)

    const signature = await signer.signMessage(address + usdt + mudMin + claimIds + deadline)

    reply.send({
      code: 0,
      msg: '',
      data: { signature }
    })
  })
}
