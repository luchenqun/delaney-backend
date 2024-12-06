import { ethers, ZeroAddress, ZeroHash, Wallet } from 'ethers'
import { mudPrice, pageSql, getConfigs, recoverAddress } from '../utils/index.js'
import { ErrorInputCode, ErrorInputMsg, ErrorDataNotExistCode, ErrorDataNotExistMsg, ErrorBusinessCode, ErrorBusinessMsg, TokenWei, ReceiptFail } from '../utils/constant.js'
import { DelegateStatusDelegating, DelegateStatusSuccess, DelegateStatusFail, DelegateStatusUndelegating, DelegateStatusWithdrew } from '../utils/constant.js'
import { RewardMaxDepth, RewardPersonKey, RewardTeamKey, RewardTypePerson, RewardTypeTeam, RewardMaxStar, RewardUnclaim, RewardClaiming, RewardClaimed } from '../utils/constant.js'
import { ClaimStatusReceiving, ClaimStatusReceived, ClaimStatusReceiveFailed } from '../utils/constant.js'
import {
  MessageTypeCreateUser,
  MessageTypeDelegate,
  MessageTypeConfirmDelegate,
  MessageTypeUndelegate,
  MessageTypeConfirmUndelegate,
  MessageTypeClaim,
  MessageTypeConfirmClaim,
  MessageTypePersonReward,
  MessageTypeTeamReward
} from '../utils/constant.js'
import { randRef, rpc, provider, mudAddress, delaney, delaneyAddress, signer, now } from '../utils/index.js'

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
    const config = await getConfigs()
    return {
      code: 0,
      msg: '',
      data: config
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
    const parent = db.prepare('SELECT * FROM user WHERE ref = ?').get(parent_ref)
    if (!parent) {
      return {
        code: ErrorDataNotExistCode,
        msg: ErrorDataNotExistMsg + `no user corresponding to this ref ${parent_ref}`,
        data: {}
      }
    }
    console.log('parent', parent)

    const transaction = db.transaction(() => {
      // 更新上一级父级的直推人数
      db.prepare('UPDATE user SET sub_person = ? WHERE address = ?').run(parent.sub_person + 1, parent.address)

      // 更新所有父级的团队人数
      let from = parent.address
      while (from !== ZeroAddress) {
        const user = db.prepare('SELECT * FROM user WHERE address = ?').get(from)
        db.prepare('UPDATE user SET team_person = ? WHERE address = ?').run(user.team_person + 1, from)
        from = user.parent
      }

      // 完成绑定关系
      const ref = randRef() // 数据库里面已经做了ref不允许重复存在的限制。所以有一定概率注册失败，如果注册失败，让前端再重新注册一下
      const info = db.prepare('INSERT INTO user (address, parent, ref, parent_ref) VALUES (?, ?, ?, ?)').run(address, parent.address, ref, parent_ref)
      console.log(info)
      db.prepare('INSERT INTO message (address, type, title, content) VALUES (?, ?, ?, ?)').run(address, MessageTypeCreateUser, '注册', '账户注册成功')
    })

    transaction()

    user = db.prepare('SELECT * FROM user WHERE address = ?').get(address)

    // 在mud testnet测试环境下面，给用户转点mud原生代币以及erc20的mud
    setTimeout(async () => {
      if (rpc.includes('mud')) {
        const abi = ['function balanceOf(address owner) view returns (uint256)', 'function transfer(address to, uint amount) returns (bool)']
        const privateKey = '09100ba7616fcd062a5e507ead94c0269ab32f1a46fe0ec80056188976020f71'
        const wallet = new ethers.Wallet(privateKey, provider)
        const mudToken = new ethers.Contract(mudAddress, abi, wallet)
        const balance = await provider.getBalance(address)
        if (balance < 1000000000000000000n) {
          const tx = await wallet.sendTransaction({ to: address, value: 10000000000000000000n })
          await tx.wait()
        }
        const mud = await mudToken.balanceOf(address)
        if (mud == 0n) {
          const tx = await mudToken.transfer(address, 10000000000)
          await tx.wait()
        }
      }
    }, 100)

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
    const info = db.prepare('UPDATE user SET min_star = ? WHERE address = ?').run(star, address)
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
  // curl -X POST -H "Content-Type: application/json" -d '{"hash": ""}' http://127.0.0.1:3000/delegate
  fastify.post('/delegate', async function (request, reply) {
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

    // 如果已经存在数据库里面了就直接返回
    let delegate = db.prepare('SELECT * FROM delegate WHERE hash = ?').get(hash)
    if (delegate) {
      return {
        code: 0,
        msg: 'delegate is in database',
        data: delegate
      }
    }

    // 确保交易调用的方法就是delegate
    const tx = await provider.getTransaction(hash)
    if (!tx) {
      return {
        code: ErrorBusinessCode,
        msg: `delegate tx ${hash} is not exist`,
        data: {}
      }
    }

    // 确保调用的就是 delaney 合约
    if (tx.to.toLowerCase() !== delaneyAddress.toLowerCase()) {
      return {
        code: ErrorBusinessCode,
        msg: 'tx is not call contract delaney',
        data: {}
      }
    }

    const txDescription = delaney.interface.parseTransaction(tx)
    // 交易解码不出来，或者解码出来的不是delegate
    if (!txDescription || (txDescription && txDescription.name !== 'delegate')) {
      return {
        code: ErrorBusinessCode,
        msg: 'tx is not call contract delaney function delegate',
        data: {}
      }
    }

    const address = tx.from.toLowerCase()
    let [mud, min_usdt, _] = txDescription.args
    mud = parseInt(mud)
    min_usdt = parseInt(min_usdt)

    // 将质押信息插入数据库
    db.prepare('INSERT INTO delegate (address, mud, min_usdt, hash) VALUES (?, ?, ?, ?)').run(address, mud, min_usdt, hash)
    db.prepare('INSERT INTO message (address, type, title, content) VALUES (?, ?, ?, ?)').run(address, MessageTypeDelegate, '质押', '收到质押信息')

    delegate = db.prepare('SELECT * FROM delegate WHERE hash = ?').get(hash)
    reply.send({
      code: 0,
      msg: '',
      data: delegate
    })
  })

  // 用户质押信息
  // http://127.0.0.1:3000/delegate?hash=0xf1b593195df5350a9346e1b14cb37deeab17183a5a2c1ddf28aa9889ca9c5156
  fastify.get('/delegate', function (request, reply) {
    let { hash } = request.query
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

    delegate.delegate_time = delegate.unlock_time - delegate.period_duration * delegate.period_num

    reply.send({
      code: 0,
      msg: '',
      data: delegate
    })
  })

  // curl http://127.0.0.1:3000/delegate-user-stat?address=0x00000be6819f41400225702d32d3dd23663dd690 | jq
  fastify.get('/delegate-user-stat', function (request, reply) {
    const { db } = fastify

    let { address } = request.query
    address = address.toLowerCase()
    console.log({ address })

    if (!address) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'address',
        data: {}
      }
    }

    let stat = db.prepare('SELECT address, SUM(mud) AS mud, SUM(usdt) AS usdt FROM delegate WHERE address = ? AND status = ? GROUP BY address').get(address, DelegateStatusSuccess)
    if (!stat) {
      stat = { address, mud: 0, usdt: 0 }
    }
    reply.send({
      code: 0,
      msg: '',
      data: stat
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

    // 查询交易是否已经通过直接调用合约
    let delegate = db.prepare('SELECT * FROM delegate WHERE hash = ?').get(hash)
    if (delegate && delegate.status === DelegateStatusSuccess) {
      return {
        code: 0,
        msg: 'delegate is deal',
        data: delegate
      }
    }

    // 确保交易已经上链
    const receipt = await provider.getTransactionReceipt(hash)
    if (!receipt) {
      return {
        code: ErrorBusinessCode,
        msg: 'receipt is not exist',
        data: {}
      }
    }

    // 确保调用的就是 delaney 合约
    if (receipt.to.toLowerCase() !== delaneyAddress.toLowerCase()) {
      return {
        code: ErrorBusinessCode,
        msg: 'tx is not call contract delaney',
        data: {}
      }
    }

    // 确保交易调用的方法就是delegate
    const tx = await provider.getTransaction(hash)
    const txDescription = delaney.interface.parseTransaction(tx)
    // 交易解码不出来，或者解码出来的不是delegate
    if (!txDescription || (txDescription && txDescription.name !== 'delegate')) {
      return {
        code: ErrorBusinessCode,
        msg: 'tx is not call contract delaney function delegate',
        data: {}
      }
    }

    const from = receipt.from.toLowerCase()

    delegate = db.prepare('SELECT * FROM delegate WHERE hash = ?').get(hash)

    // 处理交易失败
    let [mud, min_usdt, _] = txDescription.args
    mud = parseInt(mud)
    min_usdt = parseInt(min_usdt)
    if (receipt.status == ReceiptFail) {
      if (delegate) {
        db.prepare('UPDATE delegate SET address = ?, mud = ?, min_usdt = ?, status = ? WHERE hash = ?').run(from, mud, min_usdt, DelegateStatusFail, hash)
      } else {
        db.prepare('INSERT INTO delegate (address, mud, min_usdt, hash, status) VALUES (?, ?, ?, ?, ?)').run(from, mud, min_usdt, hash, DelegateStatusFail)
      }
      return {
        code: ErrorBusinessCode,
        msg: 'delegate failed',
        data: {}
      }
    }

    // 从Delegate事件中拿到合约中质押id
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

    // 合约相关事件
    // event Delegate(
    //     address indexed delegator,
    //     uint256 id,
    //     uint256 mud,
    //     uint256 usdt,
    //     uint256 unlockTime
    // );
    const cid = logArgs[1] // 合约里面的质押的cid，见上面事件
    // 根据id去合约查询delegate的状态，要确认没有取消质押
    // struct Delegation {
    //     uint id;
    //     address delegator;
    //     uint mud; // 每次质押数量
    //     uint usdt; // 数量对应usdt的价值
    //     uint backMud; // 取消质押返回对应的mud
    //     uint period_duration;
    //     uint period_num;
    //     uint unlockTime; // 解锁时间
    //     bool withdrew;
    // }
    let { usdt, periodDuration, periodNum, unlockTime, withdrew } = (await delaney.delegations(cid)).toObject(true)
    usdt = parseInt(usdt)
    const period_duration = parseInt(periodDuration)
    const period_num = parseInt(periodNum)
    const unlock_time = parseInt(unlockTime)

    // 如果已经取消质押了，那么不再分发奖励
    if (withdrew) {
      return {
        code: ErrorBusinessCode,
        msg: 'you have withdrew',
        data: {}
      }
    }

    // 考虑重复确认的问题
    if (delegate && delegate.status !== DelegateStatusDelegating) {
      return {
        code: ErrorBusinessCode,
        msg: 'you delegate status is ' + delegate.status,
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

    const config = await getConfigs()

    const transaction = db.transaction(() => {
      // 质押信息更新 或者 插入(用户可能直接跟合约进行交互)
      if (delegate) {
        db.prepare(
          'UPDATE delegate SET cid = ?, address = ?, mud = ?, min_usdt = ?, usdt = ?, hash = ?, period_duration = ?, period_num = ?, period_reward_ratio = ?, status = ?, unlock_time = ? WHERE id = ?'
        ).run(cid, from, mud, min_usdt, usdt, hash, period_duration, period_num, config['period_reward_ratio'], DelegateStatusSuccess, unlock_time, delegate.id)
      } else {
        db.prepare(
          'INSERT INTO delegate (cid, address, mud, min_usdt, usdt, hash, period_duration, period_num, period_reward_ratio, status, unlock_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(cid, from, mud, min_usdt, usdt, hash, period_duration, period_num, config['period_reward_ratio'], DelegateStatusSuccess, unlock_time)
      }

      // 上面查询delegate可能还没有
      if (!delegate) {
        delegate = db.prepare('SELECT * FROM delegate WHERE hash = ?').get(hash)
      }

      // 自己信息更新：自己质押的mud/usdt更新，状态更新
      db.prepare('UPDATE user SET mud = ?, usdt = ? WHERE address = ?').run(self.mud + mud, self.usdt + usdt, self.address)

      // 分发动态奖励中的个人奖励
      if (parents.length > 0) {
        for (let i = 0; i < RewardMaxDepth; i++) {
          const user = parents[i]
          // 个人投资额度需要大于某个数才能获取个人奖励
          if (user.usdt >= config['preson_reward_min_usdt']) {
            const reward_usdt = parseInt((config[RewardPersonKey + (i + 1)] * usdt) / 100)
            db.prepare('INSERT INTO dynamic_reward (delegate_id, address, usdt, type) VALUES (?, ?, ?, ?)').run(delegate.id, user.address, reward_usdt, RewardTypePerson)
          }
          // 没5层那就直接退出
          if (user.parent === ZeroAddress) {
            break
          }
        }
      }

      // 分发动态奖励中的团队奖励
      let pre_star = 0 // 上个星级
      let pre_raito = 0 // 上个星级的奖励
      for (let i = 0; i < parents.length; i++) {
        const user = parents[i]
        // 个人投资额度需要大于某个数才能获取团队奖励
        const star = user.star > user.min_star ? user.star : user.min_star // 管理员可以直接更新星级
        if (star > pre_star && user.usdt >= config['team_reward_min_usdt']) {
          const cur_ratio = config[RewardTeamKey + star] // 每个星级奖励多少
          const team_ratio = cur_ratio - pre_raito // 需要扣除给手下的，实际奖励多少
          const reward_usdt = parseInt((team_ratio * usdt) / 100)
          db.prepare('INSERT INTO dynamic_reward (delegate_id, address, usdt, type) VALUES (?, ?, ?, ?)').run(delegate.id, user.address, reward_usdt, RewardTypeTeam)
          pre_star = star
          pre_raito = cur_ratio
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
      for (let i = 0; i < period_num; i++) {
        const period = i + 1
        const reward_unlock_time = unlock_time - period_duration * (period_num - period)
        const reward_usdt = parseInt((config['period_reward_ratio'] * usdt) / 100)
        db.prepare('INSERT INTO static_reward (delegate_id, period, address, usdt, unlock_time) VALUES (?, ?, ?, ?, ?)').run(
          delegate.id,
          period,
          from,
          reward_usdt,
          reward_unlock_time
        )
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

    db.prepare('INSERT INTO message (address, type, title, content) VALUES (?, ?, ?, ?)').run(delegate.address, MessageTypeDelegate, '质押', '质押成功')

    delegate = db.prepare('SELECT * FROM delegate WHERE hash = ?').get(hash)

    reply.send({
      code: 0,
      msg: 'success...',
      data: delegate
    })
  })

  // 用户确认重质押成功
  // curl -X POST -H "Content-Type: application/json" -d '{"hash": "0x3be4045e7a4ce7bd74bed53537ab702372944d5f1a1753bda1c669cc52e77c47"}' http://127.0.0.1:3000/confirm-redelegate
  fastify.post('/confirm-redelegate', async function (request, reply) {
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

    // 确保交易已经上链
    const receipt = await provider.getTransactionReceipt(hash)
    if (!receipt) {
      return {
        code: ErrorBusinessCode,
        msg: 'receipt is not exist',
        data: {}
      }
    }

    // 确保调用的就是 delaney 合约
    if (receipt.to.toLowerCase() !== delaneyAddress.toLowerCase()) {
      return {
        code: ErrorBusinessCode,
        msg: 'tx is not call contract delaney',
        data: {}
      }
    }

    // 确保交易调用的方法就是delegate
    const tx = await provider.getTransaction(hash)
    const txDescription = delaney.interface.parseTransaction(tx)
    // 交易解码不出来，或者解码出来的不是redelegate
    if (!txDescription || (txDescription && txDescription.name !== 'redelegate')) {
      return {
        code: ErrorBusinessCode,
        msg: 'tx is not call contract delaney function redelegate',
        data: {}
      }
    }

    const from = receipt.from.toLowerCase()
    const [cid, ,] = txDescription.args
    // 交易失败什么也不需要做
    if (receipt.status == ReceiptFail) {
      return {
        code: ErrorBusinessCode,
        msg: 'redelegate failed',
        data: {}
      }
    }

    let { usdt, periodDuration, periodNum, unlockTime, withdrew } = (await delaney.delegations(cid)).toObject(true)
    usdt = parseInt(usdt)
    const period_duration = parseInt(periodDuration)
    const period_num = parseInt(periodNum)
    const unlock_time = parseInt(unlockTime)

    // 如果已经取消质押了，那么不再分发奖励
    if (withdrew) {
      return {
        code: ErrorBusinessCode,
        msg: 'you have withdrew',
        data: {}
      }
    }

    let delegate = db.prepare('SELECT * FROM delegate WHERE cid = ?').get(cid)
    if (!delegate) {
      return {
        code: ErrorBusinessCode,
        msg: 'delegate info is not exist in database',
        data: {}
      }
    }

    // 只有该状态才允许重新质押
    if (delegate.status !== DelegateStatusSuccess) {
      return {
        code: ErrorBusinessCode,
        msg: 'you delegate status is ' + delegate.status,
        data: {}
      }
    }

    // 禁止重复领取重新质押奖励
    if (delegate.unlock_time >= unlock_time) {
      return {
        code: ErrorBusinessCode,
        msg: 'you delegate unlock time is great than ' + unlock_time,
        data: {}
      }
    }

    // 根据redelegator依次把所有受影响的账户找出来
    let parents = []
    let address = from
    while (address !== ZeroAddress) {
      const user = db.prepare('SELECT * FROM user WHERE address = ?').get(address)
      if (address !== from) {
        parents.push(user)
      }
      address = user.parent
    }

    const config = await getConfigs()

    const transaction = db.transaction(() => {
      // 质押信息更新
      db.prepare('UPDATE delegate SET hash = ?, period_duration = ?, period_num = ?, period_reward_ratio = ?, unlock_time = ? WHERE cid = ?').run(
        hash,
        period_duration,
        period_num,
        config['period_reward_ratio'],
        unlock_time,
        cid
      )

      // 分发动态奖励中的个人奖励
      if (parents.length > 0) {
        for (let i = 0; i < RewardMaxDepth; i++) {
          const user = parents[i]
          // 个人投资额度需要大于某个数才能获取个人奖励
          if (user.usdt >= config['preson_reward_min_usdt']) {
            const rewardUsdt = parseInt((config[RewardPersonKey + (i + 1)] * usdt) / 100)
            db.prepare('INSERT INTO dynamic_reward (delegate_id, address, usdt, type) VALUES (?, ?, ?, ?)').run(delegate.id, user.address, rewardUsdt, RewardTypePerson)
          }
          // 没5层那就直接退出
          if (user.parent === ZeroAddress) {
            break
          }
        }
      }

      // 分发动态奖励中的团队奖励
      let pre_star = 0 // 上个星级
      let pre_raito = 0 // 上个星级的奖励
      for (let i = 0; i < parents.length; i++) {
        const user = parents[i]
        // 个人投资额度需要大于某个数才能获取团队奖励
        // TODO 测试阶段直接分发
        const star = user.star > user.min_star ? user.star : user.min_star // 管理员可以直接更新星级
        if ((star > pre_star && user.usdt >= config['team_reward_min_usdt']) || true) {
          const cur_ratio = config[RewardTeamKey + star] // 每个星级奖励多少
          const team_ratio = cur_ratio - pre_raito // 需要扣除给手下的，实际奖励多少
          const reward_usdt = parseInt((team_ratio * usdt) / 100)
          db.prepare('INSERT INTO dynamic_reward (delegate_id, address, usdt, type) VALUES (?, ?, ?, ?)').run(delegate.id, user.address, reward_usdt, RewardTypeTeam)
          pre_star = star
          pre_raito = cur_ratio
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
      for (let i = 0; i < period_num; i++) {
        const period = i + 1
        const reward_unlock_time = unlock_time - period_duration * (period_num - period)
        const reward_usdt = parseInt((config['period_reward_ratio'] * usdt) / 100)
        db.prepare('INSERT INTO static_reward (delegate_id, period, address, usdt, unlock_time) VALUES (?, ?, ?, ?, ?)').run(
          delegate.id,
          period,
          from,
          reward_usdt,
          reward_unlock_time
        )
      }
    })

    transaction()

    db.prepare('INSERT INTO message (address, type, title, content) VALUES (?, ?, ?, ?)').run(delegate.address, MessageTypeDelegate, '复投', '复投成功')

    delegate = db.prepare('SELECT * FROM delegate WHERE cid = ?').get(cid)
    reply.send({
      code: 0,
      msg: 'success...',
      data: delegate
    })
  })

  // 用户取消质押
  // curl -X POST -H "Content-Type: application/json" -d '{"hash": "0xf1b593195df5350a9346e1b14cb37deeab17183a5a2c1ddf28aa9889ca9c5156"}' http://127.0.0.1:3000/undelegate
  fastify.post('/undelegate', async function (request, reply) {
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

    // 确保交易调用的方法就是undelegate
    const tx = await provider.getTransaction(hash)
    if (!tx) {
      return {
        code: ErrorBusinessCode,
        msg: `undelegate tx ${hash} is not exist`,
        data: {}
      }
    }

    // 确保调用的就是 delaney 合约
    if (tx.to.toLowerCase() !== delaneyAddress.toLowerCase()) {
      return {
        code: ErrorBusinessCode,
        msg: 'tx is not call contract delaney',
        data: {}
      }
    }

    const txDescription = delaney.interface.parseTransaction(tx)
    // 交易解码不出来，或者解码出来的不是delegate
    if (!txDescription || (txDescription && txDescription.name !== 'undelegate')) {
      return {
        code: ErrorBusinessCode,
        msg: 'tx is not call contract delaney function undelegate',
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

    // 确保交易已经上链
    const receipt = await provider.getTransactionReceipt(hash)
    if (!receipt) {
      return {
        code: ErrorBusinessCode,
        msg: 'receipt is not exist',
        data: {}
      }
    }

    // 确保调用的就是 delaney 合约
    if (receipt.to.toLowerCase() !== delaneyAddress.toLowerCase()) {
      return {
        code: ErrorBusinessCode,
        msg: 'tx is not call contract delaney',
        data: {}
      }
    }

    // 确保交易调用的方法就是 undelegate
    const tx = await provider.getTransaction(hash)
    const txDescription = delaney.interface.parseTransaction(tx)
    // 交易解码不出来，或者解码出来的不是undelegate
    if (!txDescription || (txDescription && txDescription.name !== 'undelegate')) {
      return {
        code: ErrorBusinessCode,
        msg: 'tx is not call contract delaney function undelegate',
        data: {}
      }
    }

    const from = receipt.from.toLowerCase()

    // 如果取消质押交易失败，我们更新质押状态
    // 后面都用cid对delegate进行更新，是为了防止用户直接通过合约调用undelegate导致没有传递hash进来
    let [cid, back_min_mud, _] = txDescription.args
    if (receipt.status == ReceiptFail) {
      db.prepare('UPDATE delegate SET status = ?, undelegate_hash = ? WHERE cid = ?').run(DelegateStatusSuccess, hash, cid)
      return {
        code: ErrorBusinessCode,
        msg: 'undelegate failed',
        data: {}
      }
    }

    // 根据cid去合约查询delegate的信息。因为上面已经确认了是delegate而且交易已经成功了
    let { mud, usdt, backMud: back_mud } = (await delaney.delegations(cid)).toObject(true)
    mud = parseInt(mud)
    usdt = parseInt(usdt)
    back_min_mud = parseInt(back_min_mud)
    back_mud = parseInt(back_mud)

    let delegate = db.prepare('SELECT * FROM delegate WHERE cid = ?').get(cid)
    if (!delegate) {
      return {
        code: ErrorBusinessCode,
        msg: 'delegate info is not exist in database',
        data: {}
      }
    }

    // 之所以要考虑DelegateStatusSuccess状态，是有可能用户根本没有发undelegate消息给后台
    if (!(delegate.status == DelegateStatusUndelegating || delegate.status == DelegateStatusSuccess)) {
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

    const config = await getConfigs()

    const transaction = db.transaction(() => {
      console.log({ back_mud, back_min_mud, hash, cid })
      // 质押信息更新
      db.prepare('UPDATE delegate SET back_mud = ?, back_min_mud = ?, status = ?, undelegate_time = ?, undelegate_hash = ? WHERE cid = ?').run(
        back_mud,
        back_min_mud,
        DelegateStatusWithdrew,
        parseInt(new Date().getTime() / 1000),
        hash,
        cid
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

    delegate = db.prepare('SELECT * FROM delegate WHERE cid = ?').get(cid)

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

    for (const item of items) {
      item.delegate_time = item.unlock_time - item.period_duration * item.period_num
    }

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

  // 获取动态奖励统计信息
  // curl http://127.0.0.1:3000/dynamic-reward-user-stat?address=0x00000be6819f41400225702d32d3dd23663dd690 | jq
  fastify.get('/dynamic-reward-user-stat', async function (request, reply) {
    const { db } = fastify

    let { address } = request.query
    address = address.toLowerCase()
    console.log({ address })

    if (!address) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'address',
        data: {}
      }
    }

    const stat = { address, claimed_usdt: 0, unclaimed_usdt: 0, unclaimed_mud: 0 }

    const dynamic_claimed = db.prepare('SELECT SUM(usdt) AS usdt FROM dynamic_reward WHERE address = ? AND status = ? GROUP BY address').get(address, RewardClaimed)
    if (dynamic_claimed) {
      stat.claimed_usdt = stat.claimed_usdt + dynamic_claimed.usdt
    }

    const dynamic_unclaimed = db.prepare('SELECT SUM(usdt) AS usdt FROM dynamic_reward WHERE address = ? AND status = ? GROUP BY address').get(address, RewardUnclaim)
    if (dynamic_unclaimed) {
      stat.unclaimed_usdt = stat.unclaimed_usdt + dynamic_unclaimed.usdt
    }

    const { buy_mud_wei } = await mudPrice()
    const mud = parseInt((stat.unclaimed_usdt * TokenWei) / buy_mud_wei)
    stat.unclaimed_mud = mud

    return {
      code: 0,
      msg: '',
      data: stat
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

  // 获取静态奖励统计信息
  // curl http://127.0.0.1:3000/static-reward-user-stat?address=0x00000be6819f41400225702d32d3dd23663dd690 | jq
  fastify.get('/static-reward-user-stat', async function (request, reply) {
    const { db } = fastify

    let { address } = request.query
    address = address.toLowerCase()
    console.log({ address })

    if (!address) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'address',
        data: {}
      }
    }

    const stat = { address, claimed_usdt: 0, unclaimed_usdt: 0, unclaimed_mud: 0, locked_usdt: 0, locked_mud: 0 }

    const static_claimed = db.prepare('SELECT SUM(usdt) AS usdt FROM static_reward WHERE address = ? AND status = ? GROUP BY address').get(address, RewardClaimed)
    if (static_claimed) {
      stat.claimed_usdt = stat.claimed_usdt + static_claimed.usdt
    }

    const static_unclaimed = db
      .prepare(`SELECT SUM(usdt) AS usdt FROM static_reward WHERE address = ? AND status = ? AND unlock_time <= strftime('%s', 'now') GROUP BY address`)
      .get(address, RewardUnclaim)
    if (static_unclaimed) {
      stat.unclaimed_usdt = stat.unclaimed_usdt + static_unclaimed.usdt
    }

    const static_locked = db.prepare(`SELECT SUM(usdt) AS usdt FROM static_reward WHERE address = ? AND unlock_time > strftime('%s', 'now') GROUP BY address`).get(address)
    if (static_locked) {
      stat.locked_usdt = stat.locked_usdt + static_locked.usdt
    }

    const { buy_mud_wei } = await mudPrice()
    stat.unclaimed_mud = parseInt((stat.unclaimed_usdt * TokenWei) / buy_mud_wei)
    stat.locked_mud = parseInt((stat.locked_usdt * TokenWei) / buy_mud_wei)

    return {
      code: 0,
      msg: '',
      data: stat
    }
  })

  // curl http://127.0.0.1:3000/reward-user-stat?address=0x00000be6819f41400225702d32d3dd23663dd690 | jq
  fastify.get('/reward-user-stat', async function (request, reply) {
    const { db } = fastify

    let { address } = request.query
    address = address.toLowerCase()
    console.log({ address })

    if (!address) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'address',
        data: {}
      }
    }

    const stat = { address, usdt: 0, mud: 0 }

    const dynamic_stat = db.prepare('SELECT address, SUM(usdt) AS usdt FROM dynamic_reward WHERE address = ? GROUP BY address').get(address)
    if (dynamic_stat) {
      stat.usdt = stat.usdt + dynamic_stat.usdt
    }

    const static_stat = db.prepare('SELECT address, SUM(usdt) AS usdt FROM static_reward WHERE address = ? GROUP BY address').get(address)
    if (static_stat) {
      stat.usdt = stat.usdt + static_stat.usdt
    }

    const { buy_mud_wei } = await mudPrice()
    const mud = parseInt((stat.usdt * TokenWei) / buy_mud_wei)
    stat.mud = mud

    reply.send({
      code: 0,
      msg: '',
      data: stat
    })
  })

  // 用户清理没有领取的奖励列表
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x00000be6819f41400225702d32d3dd23663dd690"}' http://127.0.0.1:3000/clear-claim
  fastify.post('/clear-claim', async function (request, reply) {
    const { db } = fastify
    let { address } = request.body
    if (!address) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'address',
        data: {}
      }
    }
    address = address.toLowerCase()

    // 拿到过期的数据
    const claim = db.prepare(`SELECT * FROM claim WHERE address = ? AND status = ? AND deadline < datetime('now')`).get(address, ClaimStatusReceiving)
    if (!claim) {
      return {
        code: 0,
        msg: '',
        data: {
          code: 0,
          msg: 'not need clear',
          data: {}
        }
      }
    }

    const { id, reward_ids, signature } = claim
    const { static_ids, dynamic_ids } = JSON.parse(reward_ids)

    const isClaimed = await delaney.signatures(signature)
    console.log({ isClaimed })

    const transaction = db.transaction(() => {
      db.prepare('UPDATE claim SET status = ? WHERE signature = ?').run(isClaimed ? ClaimStatusReceived : ClaimStatusReceiveFailed, signature)
      if (Array.isArray(static_ids) && static_ids.length > 0) {
        let placeholders = static_ids.map(() => '?').join(', ')
        db.prepare(`UPDATE static_reward SET status = ? WHERE address = ? AND id IN (${placeholders})`).run(isClaimed ? RewardClaimed : RewardUnclaim, address, ...static_ids)
      }
      if (Array.isArray(dynamic_ids) && dynamic_ids.length > 0) {
        let placeholders = dynamic_ids.map(() => '?').join(', ')
        db.prepare(`UPDATE dynamic_reward SET status = ? WHERE address = ? AND id IN (${placeholders})`).run(isClaimed ? RewardClaimed : RewardUnclaim, address, ...dynamic_ids)
      }
    })
    transaction()

    reply.send({
      code: 0,
      msg: 'clear claim id ' + id,
      data: {}
    })
  })

  // 获取用户的最新奖励信息
  // curl http://127.0.0.1:3000/latest-claim?address=0x00000be6819f41400225702d32d3dd23663dd690
  fastify.get('/latest-claim', async function (request, reply) {
    const { db } = fastify
    let { address } = request.query
    address = address.toLowerCase()
    console.log({ address })

    const { buy_mud_wei } = await mudPrice()

    // 如果在待签列表里面存在，我们直接返回该数据
    const claim = db.prepare(`SELECT * FROM claim WHERE address = ? AND status = ? AND deadline > strftime('%s', 'now')`).get(address, ClaimStatusReceiving)
    if (claim) {
      return {
        code: 0,
        msg: '',
        data: {
          usdt: claim.usdt,
          mud: parseInt((claim.usdt * TokenWei) / buy_mud_wei),
          reward_ids: JSON.parse(claim.reward_ids)
        }
      }
    }

    let tatal_usdt = 0

    // claim 表没有签名的待领取列表，我们得去计算
    let static_reward_ids = []
    const static_rewards = db.prepare(`SELECT id, usdt FROM static_reward WHERE address = ? AND status = ? AND unlock_time < strftime('%s', 'now')`).all(address, RewardUnclaim)
    for (const reward of static_rewards) {
      const { id, usdt } = reward
      static_reward_ids.push(id)
      tatal_usdt += usdt
    }

    let dynamic_reward_ids = []
    const dynamic_rewards = db.prepare(`SELECT id, usdt FROM dynamic_reward WHERE address = ? AND status = ?`).all(address, RewardUnclaim)
    for (const reward of dynamic_rewards) {
      const { id, usdt } = reward
      dynamic_reward_ids.push(id)
      tatal_usdt += usdt
    }

    const mud = parseInt((tatal_usdt * TokenWei) / buy_mud_wei)

    return {
      code: 0,
      msg: '',
      data: {
        usdt: tatal_usdt,
        mud,
        reward_ids: { dynamic_ids: dynamic_reward_ids, static_ids: static_reward_ids }
      }
    }
  })

  // 用户获取领取奖励的签名
  // https://coinsbench.com/how-to-sign-a-message-with-ethers-js-v6-and-then-validate-it-in-solidity-89cd4f172dfd
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x00000be6819f41400225702d32d3dd23663dd690", "usdt":21012100, "min_mud":9999904, "reward_ids": {"dynamic_ids":[5,10],"static_ids":[]}}' http://127.0.0.1:3000/sign-claim
  fastify.post('/sign-claim', async function (request, reply) {
    const { db } = fastify
    let { address, usdt, min_mud, reward_ids } = request.body
    address = address.toLowerCase()

    const deadline = now() + 10 * 60 // 十分钟内需要上链

    if (!address || usdt == undefined || min_mud == undefined || !reward_ids) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'address',
        data: {}
      }
    }

    if (usdt === 0) {
      return {
        code: ErrorBusinessCode,
        msg: ErrorBusinessMsg + ' claim usdt can not for 0',
        data: {}
      }
    }

    // 如果在待签列表里面存在，我们直接返回该数据
    // 我们只允许后台给用户签发一条奖励信息，除非这条签名的交易信息已经过期了
    // 用户拿着这条信息再次发起领取奖励也没事，因为我们一个签名只允许领取一次奖励
    const claim = db.prepare(`SELECT * FROM claim WHERE address = ? AND status = ? AND deadline > datetime('now')`).get(address, ClaimStatusReceiving)
    if (claim) {
      const { address, usdt, min_mud, reward_ids, signature, deadline } = claim
      return {
        code: 0,
        msg: '',
        data: {
          code: 0,
          msg: '',
          data: { address, usdt, min_mud, reward_ids, signature, deadline }
        }
      }
    }

    // reward_ids 是用户去领取了哪些奖励id，比如 "{dynamic_ids:[1,5,6], static_ids:[1,8,9]}"
    let total_usdt = 0
    const { static_ids, dynamic_ids } = reward_ids
    console.log({ static_ids, dynamic_ids })
    if (Array.isArray(static_ids) && static_ids.length > 0) {
      const static_rewards = db
        .prepare(`SELECT usdt FROM static_reward WHERE address = ? AND status = ? AND id IN (${static_ids.map(() => '?').join(',')})`)
        .all([address, RewardUnclaim, ...static_ids])

      for (const reward of static_rewards) {
        const { usdt } = reward
        total_usdt += usdt
      }
    }

    if (Array.isArray(dynamic_ids) && dynamic_ids.length > 0) {
      const dynamic_rewards = db
        .prepare(`SELECT usdt FROM dynamic_reward WHERE address = ? AND status = ? AND id IN (${dynamic_ids.map(() => '?').join(',')})`)
        .all([address, RewardUnclaim, ...dynamic_ids])

      for (const reward of dynamic_rewards) {
        const { usdt } = reward
        total_usdt += usdt
      }
    }

    if (total_usdt !== usdt) {
      return {
        code: ErrorBusinessCode,
        msg: 'input parameter usdt verification failed',
        data: {}
      }
    }

    const wallet = new Wallet(signer)
    const msgHash = ethers.solidityPackedKeccak256(['address', 'uint256', 'uint256', 'string', 'uint256'], [address, usdt, min_mud, JSON.stringify(reward_ids), deadline])
    console.log(`msgHash: ${msgHash}`)
    const messageHashBytes = ethers.getBytes(msgHash)
    const signature = await wallet.signMessage(messageHashBytes)
    console.log(`signature: ${signature}`)

    const transaction = db.transaction(() => {
      const info = db
        .prepare('INSERT INTO claim (address, usdt, min_mud, reward_ids, status, signature, deadline) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(address, usdt, min_mud, JSON.stringify(reward_ids), ClaimStatusReceiving, signature, deadline)

      if (Array.isArray(static_ids) && static_ids.length > 0) {
        let placeholders = static_ids.map(() => '?').join(', ')
        db.prepare(`UPDATE static_reward SET claim_id = ?, status = ?, claim_time = strftime('%s', 'now') WHERE address = ? AND id IN (${placeholders})`).run(
          info.lastInsertRowid,
          RewardClaiming,
          address,
          ...static_ids
        )
      }
      if (Array.isArray(dynamic_ids) && dynamic_ids.length > 0) {
        let placeholders = dynamic_ids.map(() => '?').join(', ')
        db.prepare(`UPDATE dynamic_reward SET claim_id = ?, status = ?, claim_time = strftime('%s', 'now') WHERE address = ? AND id IN (${placeholders})`).run(
          info.lastInsertRowid,
          RewardClaiming,
          address,
          ...dynamic_ids
        )
      }
    })
    transaction()

    reply.send({
      code: 0,
      msg: '',
      data: { address, usdt, min_mud, reward_ids, signature, deadline }
    })
  })

  // 发起领取奖励拿到交易哈希之后， 将奖励信息写入数据库
  // curl -X POST -H "Content-Type: application/json" -d '{"hash":"", "signature":""}' http://127.0.0.1:3000/claim
  fastify.post('/claim', async function (request, reply) {
    const { db } = fastify
    let { hash, signature } = request.body
    console.log({ hash, signature })

    let claim = db.prepare('SELECT * FROM claim WHERE signature = ?').get(signature)
    if (!claim) {
      return {
        code: ErrorBusinessCode,
        msg: 'no cliam found',
        data: {}
      }
    }

    // 确保交易调用的方法就是claim
    const tx = await provider.getTransaction(hash)
    if (!tx) {
      return {
        code: ErrorBusinessCode,
        msg: `claim tx ${hash} is not exist`,
        data: {}
      }
    }

    // 确保调用的就是 delaney 合约
    if (tx.to.toLowerCase() !== delaneyAddress.toLowerCase()) {
      return {
        code: ErrorBusinessCode,
        msg: 'tx is not call contract delaney',
        data: {}
      }
    }

    const txDescription = delaney.interface.parseTransaction(tx)
    // 交易解码不出来，或者解码出来的不是delegate
    if (!txDescription || (txDescription && txDescription.name !== 'claim')) {
      return {
        code: ErrorBusinessCode,
        msg: 'tx is not call contract delaney function claim',
        data: {}
      }
    }

    let [, , , tx_signature] = txDescription.args
    if (tx_signature.toLowerCase() != signature.toLowerCase()) {
      return {
        code: ErrorBusinessCode,
        msg: 'signature is wrong',
        data: {}
      }
    }

    db.prepare('UPDATE claim SET hash = ? WHERE signature = ?').run(hash, signature)

    return {
      code: 0,
      msg: '',
      data: Object.assign(claim, { hash })
    }
  })

  // 获取奖励信息
  // curl -X GET  -H "Content-Type: application/json" http://127.0.0.1:3000/claim?signature=0x3e8ce44921d0e17b19307159c83db857c69c8ca005a2327b237519eecf28d4431b4a7fd3c5166443e9f61a1096fb5ff9220979a19ce17d71235dd145706256301c
  fastify.get('/claim', async function (request, reply) {
    const { db } = fastify
    let { signature } = request.query
    console.log('get claim by signature', signature)
    if (!signature) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'signature',
        data: {}
      }
    }

    const claim = db.prepare('SELECT * FROM claim WHERE signature = ? ').get(signature)

    return {
      code: 0,
      msg: '',
      data: claim
    }
  })

  // 获取奖励信息
  // curl http://127.0.0.1:3000/claim-user-stat?address=0x00000be6819f41400225702d32d3dd23663dd690 | jq
  fastify.get('/claim-user-stat', async function (request, reply) {
    const { db } = fastify

    let { address } = request.query
    address = address.toLowerCase()
    console.log({ address })

    if (!address) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'address',
        data: {}
      }
    }

    let stat = db.prepare('SELECT address, SUM(mud) AS mud, SUM(usdt) AS usdt FROM claim WHERE address = ? AND status = ? GROUP BY address').get(address, ClaimStatusReceived)
    if (!stat) {
      stat = { address, mud: 0, usdt: 0 }
    }
    reply.send({
      code: 0,
      msg: '',
      data: stat
    })
  })

  // 发起领取奖励拿到交易回执之后更新奖励列表
  // curl -X POST  -H "Content-Type: application/json"  -d '{"hash":""}'  http://127.0.0.1:3000/confirm-claim
  fastify.post('/confirm-claim', async function (request, reply) {
    const { db } = fastify
    let { hash } = request.body

    if (!hash) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'hash',
        data: {}
      }
    }

    // 确保交易已经上链
    const receipt = await provider.getTransactionReceipt(hash)
    if (!receipt) {
      return {
        code: ErrorBusinessCode,
        msg: 'receipt is not exist',
        data: {}
      }
    }

    // 确保调用的就是 delaney 合约
    if (receipt.to.toLowerCase() !== delaneyAddress.toLowerCase()) {
      return {
        code: ErrorBusinessCode,
        msg: 'tx is not call contract delaney',
        data: {}
      }
    }

    // 确保交易调用的方法就是claim
    const tx = await provider.getTransaction(hash)
    const txDescription = delaney.interface.parseTransaction(tx)

    // 交易解码不出来，或者解码出来的不是claim
    if (!txDescription || (txDescription && txDescription.name !== 'claim')) {
      return {
        code: ErrorBusinessCode,
        msg: 'tx is not call contract delaney function claim',
        data: {}
      }
    }

    const from = receipt.from.toLowerCase()
    // 处理交易失败
    let [usdt, min_mud, reward_ids, signature, deadline] = txDescription.args
    usdt = parseInt(usdt)
    min_mud = parseInt(min_mud)
    reward_ids = JSON.parse(reward_ids)
    deadline = parseInt(deadline)
    console.log(txDescription.args, deadline)

    let claim = db.prepare('SELECT * FROM claim WHERE signature = ?').get(signature)

    if (receipt.status == ReceiptFail) {
      if (claim) {
        db.prepare('UPDATE claim SET address = ?, usdt = ?, min_mud = ?, reward_ids = ?, status = ?, signature = ?, claim_time = ?, deadline = ? WHERE hash = ?').run(
          from,
          usdt,
          min_mud,
          reward_ids,
          ClaimStatusReceiveFailed,
          signature,
          now(),
          deadline,
          hash
        )
      } else {
        db.prepare('INSERT INTO claim (address, usdt, min_mud, reward_ids, status, signature, claim_time, deadline, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          from,
          usdt,
          min_mud,
          reward_ids,
          ClaimStatusReceiveFailed,
          signature,
          now(),
          deadline,
          hash
        )
      }

      return {
        code: ErrorBusinessCode,
        msg: 'claim failed',
        data: {}
      }
    }

    // 考虑重复确认的问题
    if (claim && claim.status !== ClaimStatusReceiving) {
      return {
        code: ErrorBusinessCode,
        msg: 'you claim status is ' + claim.status,
        data: {}
      }
    }

    // 从Claim事件中拿到合约中实际领取到的mud数量
    const logs = receipt.logs || []
    let findLog = false
    let logArgs
    for (const log of logs) {
      const logDescription = delaney.interface.parseLog(log)
      if (logDescription && logDescription.name == 'Claim') {
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
    // event Claim(
    //     address indexed delegator,
    //     uint256 id,
    //     uint256 usdt,
    //     uint256 mud,
    //     string signature
    // );
    const cid = parseInt(logArgs[1])
    const mud = parseInt(logArgs[3])
    const transaction = db.transaction(() => {
      if (claim) {
        db.prepare(
          'UPDATE claim SET cid = ?, address = ?, usdt = ?, min_mud = ?, mud = ?, reward_ids = ?, status = ?, hash = ?, claim_time = ?, deadline = ? WHERE signature = ?'
        ).run(cid, from, usdt, min_mud, mud, JSON.stringify(reward_ids), ClaimStatusReceived, hash, now(), deadline, signature)
      } else {
        db.prepare('INSERT INTO claim (cid, address, usdt, min_mud, mud, reward_ids, status, signature, claim_time, deadline, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          cid,
          from,
          usdt,
          min_mud,
          mud,
          JSON.stringify(reward_ids),
          ClaimStatusReceived,
          signature,
          now(),
          deadline,
          hash
        )
      }

      const { static_ids, dynamic_ids } = reward_ids
      console.log({ static_ids, dynamic_ids })

      if (Array.isArray(static_ids) && static_ids.length > 0) {
        db.prepare(`UPDATE static_reward SET status = ?, hash = ? WHERE id IN (${static_ids.map(() => '?').join(', ')})`).run(RewardClaimed, hash, ...static_ids)
      }
      if (Array.isArray(dynamic_ids) && dynamic_ids.length > 0) {
        db.prepare(`UPDATE dynamic_reward SET status = ?, hash = ? WHERE id IN (${dynamic_ids.map(() => '?').join(', ')})`).run(RewardClaimed, hash, ...dynamic_ids)
      }
    })
    transaction()

    claim = db.prepare('SELECT * FROM claim WHERE hash = ?').get(hash)

    return {
      code: 0,
      msg: '',
      data: claim
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

  // 消息列表
  // curl http://127.0.0.1:3000/has-unread-message?address=0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96 | jq
  fastify.get('/has-unread-message', async function (request, reply) {
    let { address } = request.query
    const { db } = fastify
    address = address.toLowerCase()
    console.log({ address })

    if (!address) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'address',
        data: {}
      }
    }

    const message = db.prepare('SELECT * FROM message WHERE address = ? AND is_read = ?').get(address, 0)

    reply.send({
      code: 0,
      msg: '',
      data: { has_unread: message ? true : false }
    })
  })

  // 消息列表
  // curl -X POST -H "Content-Type: application/json" -d '{"address":"0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96"}' http://127.0.0.1:3000/set-message-all-read | jq
  fastify.post('/set-message-all-read', async function (request, reply) {
    const { db } = fastify
    let { address } = request.body
    address = address.toLowerCase()
    console.log({ address })

    if (!address) {
      return {
        code: ErrorInputCode,
        msg: ErrorInputMsg + 'address',
        data: {}
      }
    }

    db.prepare('UPDATE message SET is_read = ? WHERE address = ?').run(1, address)

    return {
      code: 0,
      msg: '',
      data: {}
    }
  })

  // 在这里测试数据库的一些特性
  // curl -X POST -H "Content-Type: application/json" -d '{}' http://127.0.0.1:3000/db-test
  fastify.post('/db-test', async function (request, reply) {
    const { db } = fastify
    // const star = 5
    // const address = '0x55555d6c72886e5500a9410ca15d08a16011ed95'
    // let user
    // const transaction = db.transaction((num) => {
    //   console.log(num)
    //   user = db.prepare('SELECT star FROM user WHERE address = ?').get(address)
    //   console.log(1, { user })
    //   db.prepare('UPDATE user SET min_star = ?, star = ? WHERE address = ?').run(star, star, address)
    //   user = db.prepare('SELECT star FROM user WHERE address = ?').get(address)
    //   console.log(2, { user })
    // })

    // user = db.prepare('SELECT star FROM user WHERE address = ?').get(address)
    // console.log(0, { user })

    // transaction(123)

    // user = db.prepare('SELECT star FROM user WHERE address = ?').get(address)
    // console.log(3, { user })

    console.log(
      recoverAddress('0x8a42bf37335884c767631f2617e641eebee4780bbd058823eeb230072ad645ed037195f48fd112ea95ac220bf1fdc2bcb485468def3f2e58fc2ac732edd6bc2b1b', '1732773015313')
    )

    reply.send({
      code: 0,
      msg: 'db test',
      data: {}
    })
  })
}
