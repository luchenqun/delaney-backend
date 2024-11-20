import { mudPrice } from '../utils/index.js'
import { ErrorInputCode, ErrorInputMsg, ErrorDataNotExistCode, ErrorDataNotExistMsg, ErrorBusinessCode, ErrorBusinessMsg } from '../utils/constant.js'
import { DelegateStatusSuccess, DelegateStatusFail, DelegateStatusWithdrew } from '../utils/constant.js'
import { RewardMaxDepth, RewardPersonKey, RewardTeamKey, RewardTypePerson, RewardTypeTeam, RewardMaxStar } from '../utils/constant.js'
import { randRef, provider, delaney, delaneyAddress } from '../utils/index.js'

import { ZeroAddress, ZeroHash, Wallet } from 'ethers'

BigInt.prototype.toJSON = function () {
  return this.toString()
}

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
    let { address, parent_ref } = request.body
    address = address.toLowerCase()
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
        msg: ErrorBusinessMsg + `user ${address} already exist`,
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

  // 更新用户星级
  // TODO: 只允许管理员可设置
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96", "star": "5"}' http://127.0.0.1:3000/set-user-star | jq
  fastify.post('/set-user-star', function (request, reply) {
    let { address, star } = request.body
    address = address.toLowerCase()
    const { db } = fastify
    console.log({ address, star })

    if (star == undefined || !address) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'address or star',
        data: {}
      }
    }

    // 检查用户是否存在
    const user = db.prepare('SELECT address FROM user WHERE address = ?').get(address)
    if (!user) {
      return {
        code: ErrorDataNotExistCode,
        msg: ErrorDataNotExistMsg + `no user corresponding to this ref ${parent_ref}`,
        data: {}
      }
    }
    console.log('user', user)

    // 完成修改星级
    const info = db.prepare('UPDATE user SET min_star = ?, star = ? WHERE address = ?').run(star, star, address) // TODO: 本身的星级是不需要改的，测试为了方便都改了
    console.log(info)

    reply.send({
      code: 0,
      msg: '',
      data: Object.assign(user, { star, min_star: star })
    })
  })

  // 根据地址获取用户
  // curl http://127.0.0.1:3000/user?address=0x1111102dd32160b064f2a512cdef74bfdb6a9f96 | jq
  fastify.get('/user', async function (request, reply) {
    let { address } = request.query
    address = address.toLowerCase()
    const { db } = fastify
    const user = db.prepare('SELECT * FROM user WHERE address = ?').get(address)
    if (!user) {
      return {
        code: ErrorBusinessCode,
        msg: ErrorBusinessMsg + `user ${address} not exist`,
        data: {}
      }
    }
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

  // 用户质押
  // TODO: 为了防止恶意插入数据，用户质押的数目超过1000条，我们只有拿到回执了我们才会插入数据
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96", "mud": 888888, "hash": "0xf1b593195df5350a9346e1b14cb37deeab17183a5a2c1ddf28aa9889ca9c5156"}' http://127.0.0.1:3000/delegate
  fastify.post('/delegate', function (request, reply) {
    let { address, mud, hash, min_usdt } = request.body
    address = address.toLowerCase()

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

  // 用户确认质押成功
  // curl -X POST -H "Content-Type: application/json" -d '{"hash": "0xf1043277e239a9bbc23c72fc104cf1a93c8236f1baa13b6150bbfe4b1ca6a384"}' http://127.0.0.1:3000/confirm-delegate
  fastify.post('/confirm-delegate', async function (request, reply) {
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

    const receipt = await provider.getTransactionReceipt(hash)
    if (!receipt) {
      return {
        code: ErrorBusinessCode,
        msg: 'receipt is not exist',
        data: {}
      }
    }

    // to 要等于我们的合约是为了防止别人搞个假事件作弊
    if (receipt.to.toLowerCase() !== delaneyAddress.toLowerCase()) {
      return {
        code: ErrorBusinessCode,
        msg: 'unknow error',
        data: {}
      }
    }

    // 处理交易失败
    if (receipt.status == 0) {
      const info = db.prepare('UPDATE delegate SET status = ? WHERE hash = ?').run(DelegateStatusFail, hash)
      console.log(info)
      return {
        code: ErrorBusinessCode,
        msg: 'delegate failed',
        data: {}
      }
    }

    const tx = await provider.getTransaction(hash)
    const txDescription = delaney.interface.parseTransaction(tx)

    // 能不能找到Delegate事件
    const logs = receipt.logs || []
    let findLog = false
    let logArgs
    for (const log of logs) {
      const logDescription = delaney.interface.parseLog(log)
      if (logDescription && logDescription.name == 'Delegate') {
        logArgs = logDescription.args
        findLog = true
        break
      }
    }

    if (!findLog) {
      return {
        code: ErrorBusinessCode,
        msg: 'unknow error',
        data: {}
      }
    }

    const from = receipt.from.toLowerCase()
    const cid = logArgs[1]
    // TODO 根据id去合约查询delegate的状态，要确认没有取消质押
    console.log({ id: cid })
    let { mud, usdt, periodDuration, periodNum, unlockTime, withdrew } = (await delaney.delegations(cid)).toObject(true)
    mud = parseInt(mud)
    usdt = parseInt(usdt)
    periodDuration = parseInt(periodDuration)
    periodNum = parseInt(periodNum)
    unlockTime = parseInt(unlockTime)

    if (withdrew) {
      return {
        code: ErrorBusinessCode,
        msg: 'you have withdrew',
        data: {}
      }
    }

    // 根据delegator依次把所有受影响的账户找出来
    let parents = []
    let self
    let address = from
    while (address !== ZeroAddress) {
      const user = db.prepare('SELECT * FROM user WHERE address = ?').get(address)
      if (address == from) {
        self = user
      } else {
        parents.push(user)
      }
      address = user.parent
    }

    const configs = db.prepare('SELECT * FROM config').all()
    let config = {}
    for (const cfg of configs) {
      config[cfg.key] = cfg.value
    }

    const delegate = db.prepare('SELECT * FROM delegate WHERE hash = ?').get(hash)

    const transaction = db.transaction(() => {
      // 质押信息更新
      db.prepare('UPDATE delegate SET cid = ?, period_duration = ?, period_num = ?, period_reward_ratio = ?, status = ?, unlock_time = ? WHERE hash = ?').run(
        cid,
        periodDuration,
        periodNum,
        config['period_reward_ratio'],
        DelegateStatusSuccess,
        unlockTime,
        hash
      )
      // 自己信息更新：自己质押的mud/usdt更新，状态更新
      db.prepare('UPDATE user SET mud = ?, usdt = ? WHERE address = ?').run(self.mud + mud, self.usdt + usdt, self.address)

      // 分发动态奖励中的个人奖励
      for (let i = 0; i < RewardMaxDepth; i++) {
        const user = parents[i]
        // 个人投资额度需要大于某个数才能获取个人奖励
        // TODO 测试阶段直接分发
        if (user.usdt >= config['preson_reward_min_usdt'] || true) {
          const rewardUsdt = parseInt((config[RewardPersonKey + (i + 1)] * usdt) / 100)
          db.prepare('INSERT INTO dynamic_reward (delegate_id, address, usdt, type) VALUES (?, ?, ?, ?)').run(delegate.id, user.address, rewardUsdt, RewardTypePerson)
        }
        // 没5层那就直接退出
        if (user.parent === ZeroAddress) {
          break
        }
      }

      // 分发动态奖励中的团队奖励
      let preStar = 0 // 上个星级
      let preRaito = 0 // 上个星级的奖励
      for (let i = 0; i < RewardMaxDepth; i++) {
        const user = parents[i]
        // 个人投资额度需要大于某个数才能获取团队奖励
        // TODO 测试阶段直接分发
        const star = user.star > user.min_star ? user.star : user.min_star // 管理员可以直接更新星级
        if ((star > preStar && user.usdt >= config['team_reward_min_usdt']) || true) {
          const curRatio = config[RewardTeamKey + star] // 每个星级奖励多少
          const teamRatio = curRatio - preRaito // 需要扣除给手下的，实际奖励多少
          const rewardUsdt = parseInt((teamRatio * usdt) / 100)
          db.prepare('INSERT INTO dynamic_reward (delegate_id, address, usdt, type) VALUES (?, ?, ?, ?)').run(delegate.id, user.address, rewardUsdt, RewardTypeTeam)
          preStar = star
          preRaito = curRatio
        }

        // 迭代到五星了
        if (star == RewardMaxStar) {
          break
        }

        // 没5层那就直接退出
        if (user.parent === ZeroAddress) {
          break
        }
      }

      // 分发静态奖励即质押生息
      for (let i = 0; i < periodNum; i++) {
        const period = i + 1
        const unlock_time = unlockTime - periodDuration * (periodNum - period)
        const rewardUsdt = parseInt((config['period_reward_ratio'] * usdt) / 100)
        db.prepare('INSERT INTO static_reward (delegate_id, period, address, usdt, unlock_time) VALUES (?, ?, ?, ?, ?)').run(delegate.id, period, from, rewardUsdt, unlock_time)
      }
      console.log('end....')
      // 上级用户信息更新：团队星级，直推以及团队的mud/usdt的更新
    })

    transaction()

    reply.send({
      code: 0,
      msg: 'success...',
      data: {}
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

  // 获取用户的奖励信息
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96"}' http://127.0.0.1:3000/claim
  fastify.get('/claim', async function (request, reply) {
    const { db } = fastify
    return {
      code: 0,
      msg: '',
      data: {
        address: '0x00000Be6819f41400225702D32d3dd23663Dd690',
        usdt: 100000000000,
        mudMin: 1000000000,
        claimIds: { dynamic: [1, 2, 6], static: [2, 8] }
      }
    }
  })

  // 用户获取领取奖励的签名
  // https://coinsbench.com/how-to-sign-a-message-with-ethers-js-v6-and-then-validate-it-in-solidity-89cd4f172dfd
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96"}' http://127.0.0.1:3000/sign-claim
  fastify.post('/sign-claim', async function (request, reply) {
    let { address, usdt, mudMin, claimIds, deadline } = request.body
    address = address.toLowerCase()

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
