import { mudPrice, pageSql } from '../utils/index.js'
import { ErrorInputCode, ErrorInputMsg, ErrorDataNotExistCode, ErrorDataNotExistMsg, ErrorBusinessCode, ErrorBusinessMsg } from '../utils/constant.js'
import { DelegateStatusDelegating, DelegateStatusSuccess, DelegateStatusFail, DelegateStatusUndelegating, DelegateStatusWithdrew } from '../utils/constant.js'
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
    let block_tag = 'latest'

    if (/^\d+$/.test(request.query.block_tag)) {
      block_tag = parseInt(request.query.block_tag)
    }
    // [46000000, 50702048, 54702048, 64188580, 64188680, 'latest']
    // 0x2b4a7f89a40e25b83ceeb858e44524452d4fa056a44c0a36e64263e16a1e5197
    console.log('blockTag --->', request.query.blockTag, block_tag)
    const price = await mudPrice(block_tag)
    console.log('price', price)

    return {
      code: 0,
      msg: '',
      data: { ...price, blockTag: block_tag }
    }
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
        total: configs.length,
        pages: 1,
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
    let user = db.prepare('SELECT * FROM user WHERE address = ?').get(address)
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

    user = db.prepare('SELECT * FROM user WHERE address = ?').get(address)

    reply.send({
      code: 0,
      msg: '',
      data: user
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
  // SELECT * FROM user WHERE star = 1 AND team_usdt >= 100 ORDER BY usdt DESC LIMIT 10 OFFSET 0;
  fastify.get('/users', async function (request, reply) {
    const { db } = fastify
    let { page, page_size, sort_field, sort_order, filters } = request.query
    page = parseInt(page || 1)
    page_size = parseInt(page_size || 10)

    const { sql_base, sql_count } = pageSql('user', page, page_size, sort_field, sort_order, filters)
    const items = db.prepare(sql_base).all()
    const { total } = db.prepare(sql_count).get()
    const pages = Math.ceil(total / page_size)

    return {
      code: 0,
      msg: '',
      data: {
        total,
        pages,
        items
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
    db.prepare('INSERT INTO delegate (address, mud, min_usdt, hash) VALUES (?, ?, ?, ?)').run(address, mud, min_usdt, hash)

    const delegate = db.prepare('SELECT * FROM delegate WHERE hash = ?').get(hash)
    reply.send({
      code: 0,
      msg: '',
      data: delegate
    })
  })

  // 用户质押信息
  // http://127.0.0.1:3000/delegate?hash=0xf1b593195df5350a9346e1b14cb37deeab17183a5a2c1ddf28aa9889ca9c5156
  fastify.get('/delegate', function (request, reply) {
    let { hash } = request.body
    const { db } = fastify
    console.log({ hash })

    if (!hash) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'hash',
        data: {}
      }
    }

    const delegate = db.prepare('SELECT * FROM delegate WHERE hash = ?').get(hash)
    if (!delegate) {
      return {
        code: ErrorBusinessCode,
        msg: ErrorBusinessMsg + `delegate ${hash} not exist`,
        data: {}
      }
    }
    reply.send({
      code: 0,
      msg: '',
      data: delegate
    })
  })

  // 用户确认质押成功
  // curl -X POST -H "Content-Type: application/json" -d '{"hash": "0x3be4045e7a4ce7bd74bed53537ab702372944d5f1a1753bda1c669cc52e77c47"}' http://127.0.0.1:3000/confirm-delegate
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

    // const tx = await provider.getTransaction(hash)
    // const txDescription = delaney.interface.parseTransaction(tx)

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

    let delegate = db.prepare('SELECT * FROM delegate WHERE hash = ?').get(hash)

    // 考虑重复确认的问题
    if (delegate.status !== DelegateStatusDelegating) {
      return {
        code: ErrorBusinessCode,
        msg: 'you have confirmed',
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

    const transaction = db.transaction(() => {
      // 质押信息更新
      db.prepare('UPDATE delegate SET cid = ?, usdt = ?, period_duration = ?, period_num = ?, period_reward_ratio = ?, status = ?, unlock_time = ? WHERE hash = ?').run(
        cid,
        usdt,
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
      for (let i = 0; i < parents.length; i++) {
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

      // 上级用户信息更新：团队星级，直推以及团队的mud/usdt的更新
      for (let i = 0; i < parents.length; i++) {
        const user = parents[i]
        // 第一个节点累计直推金额
        if (i == 0) {
          user.sub_mud += mud
          user.sub_usdt += usdt
        }

        // 所有父节点都需要加团队金额
        user.team_mud += mud
        user.team_usdt += usdt

        // 从最大的星级开始查看用户是否满足星级条件
        for (let star = RewardMaxStar; star >= 1; star--) {
          if (star == 1) {
            if (user.sub_usdt >= config['team_level1_sub_usdt'] && user.team_usdt >= config['team_level1_team_usdt']) {
              user.star = star
            }
          } else {
            const count = db.prepare('SELECT COUNT(*) FROM user WHERE star >= ? AND parent = ?').get(star - 1, user.address)
            if (count >= 2) {
              user.star = star
              break
            }
          }
        }

        // 更新用户信息
        const { sub_mud, sub_usdt, team_mud, team_usdt, star, address } = user
        db.prepare('UPDATE user SET sub_mud = ?, sub_usdt = ?, team_mud = ?, team_usdt = ?, star = ? WHERE address = ?').run(sub_mud, sub_usdt, team_mud, team_usdt, star, address)

        /* 算法复杂，很容易出问题，弃用
        // 升级团队星级
        if (user.star == 0) {
          // 从0星升到1星
          if (user.sub_usdt >= config['team_level1_sub_usdt'] && user.team_usdt >= config['team_level1_team_usdt']) {
            user.star = 1
            user.upgradeStar = true
          }
        } else if (user.star < RewardMaxStar && i >= 1) {
          // 只有1 ~ 4星才有机会升级，5星已经是满级了
          const child = parents[i - 1]
          // 只有子账号升级了，父账号才有可能升级
          if (child.upgradeStar) {
            // 查一下该用户下面的子账号已经有多少个了，如果只有1个，加上之前因为子账号升级了，那么久有可能需要升级了
            const count = db.prepare('SELECT COUNT(*) FROM user WHERE star = ? AND parent = ?').get(user.star - 1, user.address)
            // 不能跨越升级，比如现在的账号是4星了，上面升级的是1星，那么依然维持1星
            if (child.star == user.star - 1 && count == 1) {
              user.star = user.star + 1
              user.upgradeStar = true
            }
          }
        }
        */
      }

      for (const user of parents) {
        const { sub_mud, sub_usdt, team_mud, team_usdt, star, address } = user
        db.prepare('UPDATE user SET sub_mud = ?, sub_usdt = ?, team_mud = ?, team_usdt = ?, star = ? WHERE address = ?').run(sub_mud, sub_usdt, team_mud, team_usdt, star, address)
      }
    })

    transaction()

    delegate = db.prepare('SELECT * FROM delegate WHERE hash = ?').get(hash)
    reply.send({
      code: 0,
      msg: 'success...',
      data: delegate
    })
  })

  // 用户取消质押
  // curl -X POST -H "Content-Type: application/json" -d '{"hash": "0xf1b593195df5350a9346e1b14cb37deeab17183a5a2c1ddf28aa9889ca9c5156"}' http://127.0.0.1:3000/undelegate
  fastify.post('/undelegate', function (request, reply) {
    let { hash } = request.body

    const { db } = fastify
    console.log({ hash })

    if (!hash) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'hash',
        data: {}
      }
    }

    // 将质押信息更新到数据库
    db.prepare('UPDATE delegate SET status = ? WHERE undelegate_hash = ?').run(DelegateStatusUndelegating, hash)

    const delegate = db.prepare('SELECT * FROM delegate WHERE undelegate_hash = ?').get(hash)

    reply.send({
      code: 0,
      msg: '',
      data: delegate
    })
  })

  // 用户确认取消质押成功
  // curl -X POST -H "Content-Type: application/json" -d '{"hash": "0xf1b593195df5350a9346e1b14cb37deeab17183a5a2c1ddf28aa9889ca9c5156"}' http://127.0.0.1:3000/confirm-undelegate
  fastify.post('/confirm-undelegate', async function (request, reply) {
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

    // 处理交易失败，我们把质押额度返回给用户
    if (receipt.status == 0) {
      const info = db.prepare('UPDATE delegate SET status = ? WHERE undelegate_hash = ?').run(DelegateStatusSuccess, hash)
      console.log(info)
      return {
        code: ErrorBusinessCode,
        msg: 'undelegate failed',
        data: {}
      }
    }

    // const tx = await provider.getTransaction(hash)
    // const txDescription = delaney.interface.parseTransaction(tx)

    // 能不能找到Undelegate事件
    const logs = receipt.logs || []
    let findLog = false
    let logArgs
    for (const log of logs) {
      const logDescription = delaney.interface.parseLog(log)
      if (logDescription && logDescription.name == 'Undelegate') {
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
    let { mud, usdt, back_mud, withdrew } = (await delaney.delegations(cid)).toObject(true)
    mud = parseInt(mud)
    usdt = parseInt(usdt)
    back_mud = parseInt(back_mud)

    if (!withdrew) {
      return {
        code: ErrorBusinessCode,
        msg: 'you are not withdrew in chain',
        data: {}
      }
    }

    let delegate = db.prepare('SELECT * FROM delegate WHERE undelegate_hash = ?').get(hash)

    // 考虑重复确认的问题
    // TODO 有可能用户根本没有发undelegate 消息给后台
    if (delegate.status != DelegateStatusUndelegating) {
      return {
        code: ErrorBusinessCode,
        msg: 'you have confirmed',
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

    const transaction = db.transaction(() => {
      // 质押信息更新
      db.prepare('UPDATE delegate SET back_mud = ?, status = ?, undelegate_time = ? WHERE undelegate_hash = ?').run(
        back_mud,
        DelegateStatusWithdrew,
        parseInt(new Date().getTime() / 1000),
        hash
      )
      // 自己信息更新：自己质押的mud/usdt更新，状态更新
      db.prepare('UPDATE user SET mud = ?, usdt = ? WHERE address = ?').run(self.mud - mud, self.usdt - usdt, self.address)

      // 上级用户信息更新：团队星级，直推以及团队的mud/usdt的更新
      for (let i = 0; i < parents.length; i++) {
        const user = parents[i]
        // 减掉第一个节点的累计直推金额
        if (i == 0) {
          user.sub_mud -= mud
          user.sub_usdt -= usdt
        }

        // 所有父节点都需要减掉团队金额
        user.team_mud -= mud
        user.team_usdt -= usdt

        for (let star = RewardMaxStar; star >= 1; star--) {
          if (star == 1) {
            if (user.sub_usdt >= config['team_level1_sub_usdt'] && user.team_usdt >= config['team_level1_team_usdt']) {
              user.star = star
            }
          } else {
            const count = db.prepare('SELECT COUNT(*) FROM user WHERE star >= ? AND parent = ?').get(star - 1, user.address)
            if (count >= 2) {
              user.star = star
              break
            }
          }
        }

        // 更新用户信息
        const { sub_mud, sub_usdt, team_mud, team_usdt, star, address } = user
        db.prepare('UPDATE user SET sub_mud = ?, sub_usdt = ?, team_mud = ?, team_usdt = ?, star = ? WHERE address = ?').run(sub_mud, sub_usdt, team_mud, team_usdt, star, address)
      }
    })

    transaction()

    delegate = db.prepare('SELECT * FROM delegate WHERE undelegate_hash = ?').get(hash)

    reply.send({
      code: 0,
      msg: 'success...',
      data: delegate
    })
  })

  // 获取委托列表
  // curl http://127.0.0.1:3000/delegates | jq
  fastify.get('/delegates', async function (request, reply) {
    const { db } = fastify
    let { page, page_size, sort_field, sort_order, filters } = request.query
    page = parseInt(page || 1)
    page_size = parseInt(page_size || 10)

    const { sql_base, sql_count } = pageSql('delegate', page, page_size, sort_field, sort_order, filters)
    const items = db.prepare(sql_base).all()
    const { total } = db.prepare(sql_count).get()
    const pages = Math.ceil(total / page_size)

    return {
      code: 0,
      msg: '',
      data: {
        total,
        pages,
        items
      }
    }
  })

  // 获取动态奖励列表
  // curl http://127.0.0.1:3000/dynamic-rewards | jq
  fastify.get('/dynamic-rewards', async function (request, reply) {
    const { db } = fastify
    let { page, page_size, sort_field, sort_order, filters } = request.query
    page = parseInt(page || 1)
    page_size = parseInt(page_size || 10)

    const { sql_base, sql_count } = pageSql('dynamic_reward', page, page_size, sort_field, sort_order, filters)
    const items = db.prepare(sql_base).all()
    const { total } = db.prepare(sql_count).get()
    const pages = Math.ceil(total / page_size)

    return {
      code: 0,
      msg: '',
      data: {
        total,
        pages,
        items
      }
    }
  })

  // 动态静态列表
  // curl http://127.0.0.1:3000/static-rewards | jq
  fastify.get('/static-rewards', async function (request, reply) {
    const { db } = fastify
    let { page, page_size, sort_field, sort_order, filters } = request.query
    page = parseInt(page || 1)
    page_size = parseInt(page_size || 10)

    const { sql_base, sql_count } = pageSql('static_reward', page, page_size, sort_field, sort_order, filters)
    const items = db.prepare(sql_base).all()
    const { total } = db.prepare(sql_count).get()
    const pages = Math.ceil(total / page_size)

    return {
      code: 0,
      msg: '',
      data: {
        total,
        pages,
        items
      }
    }
  })

  // 获取用户的最新奖励信息
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96"}' http://127.0.0.1:3000/latest-claim
  fastify.get('/latest-claim', async function (request, reply) {
    const { db } = fastify
    return {
      code: 0,
      msg: '',
      data: {
        usdt: 100000000000,
        mud: 1000000000,
        reward_ids: { dynamic: [1, 2, 6], static: [2, 8] }
      }
    }
  })

  // 用户获取领取奖励的签名
  // https://coinsbench.com/how-to-sign-a-message-with-ethers-js-v6-and-then-validate-it-in-solidity-89cd4f172dfd
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96"}' http://127.0.0.1:3000/sign-claim
  fastify.post('/sign-claim', async function (request, reply) {
    let { address, usdt, mud_min, reward_ids, deadline } = request.body
    address = address.toLowerCase()

    if (!address) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'address',
        data: {}
      }
    }

    // rewardIds 是用户去领取了哪些奖励id，比如 "{dynamic:[1,5,6], static:[1,8,9]}"
    // TODO: 检查 rewardIds 对应的 usdt 之和 是否等于用户传进来的usdt的数值

    const privateKey = 'f78a036930ce63791ea6ea20072986d8c3f16a6811f6a2583b0787c45086f769'
    const signer = new Wallet(privateKey)

    const signature = await signer.signMessage(address + usdt + mud_min + reward_ids + deadline)

    reply.send({
      code: 0,
      msg: '',
      data: { signature }
    })
  })

  // 发起领取奖励之后，更新奖励列表
  //
  fastify.post('/claim', async function (request, reply) {
    const { db } = fastify
    let { address, usdt, min_mud, reward_ids } = request.query

    return {
      code: 0,
      msg: '',
      data: {}
    }
  })

  // 获取奖励信息
  //
  fastify.get('/claim', async function (request, reply) {
    const { db } = fastify
    let { hash } = request.query

    return {
      code: 0,
      msg: '',
      data: {}
    }
  })

  // 发起领取奖励拿到交易回执之后更新奖励列表
  //
  fastify.post('/confirm-claim', async function (request, reply) {
    const { db } = fastify
    let { hash } = request.query

    return {
      code: 0,
      msg: '',
      data: {}
    }
  })

  // 领取的奖励列表
  // curl http://127.0.0.1:3000/claims | jq
  fastify.get('/claims', async function (request, reply) {
    const { db } = fastify
    let { page, page_size, sort_field, sort_order, filters } = request.query
    page = parseInt(page || 1)
    page_size = parseInt(page_size || 10)

    const { sql_base, sql_count } = pageSql('claim', page, page_size, sort_field, sort_order, filters)
    const items = db.prepare(sql_base).all()
    const { total } = db.prepare(sql_count).get()
    const pages = Math.ceil(total / page_size)

    return {
      code: 0,
      msg: '',
      data: {
        total,
        pages,
        items
      }
    }
  })

  // 消息列表
  // curl http://127.0.0.1:3000/messages | jq
  fastify.get('/messages', async function (request, reply) {
    const { db } = fastify
    let { page, page_size, sort_field, sort_order, filters } = request.query
    page = parseInt(page || 1)
    page_size = parseInt(page_size || 10)

    const { sql_base, sql_count } = pageSql('message', page, page_size, sort_field, sort_order, filters)
    const items = db.prepare(sql_base).all()
    const { total } = db.prepare(sql_count).get()
    const pages = Math.ceil(total / page_size)

    return {
      code: 0,
      msg: '',
      data: {
        total,
        pages,
        items
      }
    }
  })

  // 在这里测试数据库的一些特性
  // curl -X POST -H "Content-Type: application/json" -d '{}' http://127.0.0.1:3000/db-test
  fastify.post('/db-test', async function (request, reply) {
    const { db } = fastify
    const star = 5
    const address = '0x55555d6c72886e5500a9410ca15d08a16011ed95'
    let user
    const transaction = db.transaction((num) => {
      console.log(num)
      user = db.prepare('SELECT star FROM user WHERE address = ?').get(address)
      console.log(1, { user })
      db.prepare('UPDATE user SET min_star = ?, star = ? WHERE address = ?').run(star, star, address)
      user = db.prepare('SELECT star FROM user WHERE address = ?').get(address)
      console.log(2, { user })
    })

    user = db.prepare('SELECT star FROM user WHERE address = ?').get(address)
    console.log(0, { user })

    transaction(123)

    user = db.prepare('SELECT star FROM user WHERE address = ?').get(address)
    console.log(3, { user })

    reply.send({
      code: 0,
      msg: 'db test',
      data: {}
    })
  })
}
