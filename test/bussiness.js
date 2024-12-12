import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs-extra'
import { ethers } from 'ethers'
import axios from 'axios'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const contractDir = path.join(dirname, '../../delaney-contract/artifacts/contracts')

const deploy = async (wallet, abi, bytecode, params) => {
  const factory = new ethers.ContractFactory(abi, bytecode, wallet)
  const contract = await factory.deploy(...(params || []))
  await contract.waitForDeployment()
  return contract
}

const decodeReply = (reply) => {
  const { data } = reply
  if (data.code == 0) {
    return data.data
  }
  throw data.msg
}

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const main = async () => {
  const delaneyArtifact = await fs.readJSON(path.join(contractDir, 'Delaney.sol/Delaney.json'))
  const { abi: delaneyAbi, bytecode: delaneyBytecode } = delaneyArtifact
  const poolAddress = '0x546bc6E008689577C69C42b9C1f6b4C923f59B5d'
  const delaneyAddress = '0xDad56A6B5eed8567Fc4395d05b59D15077c2c888'

  const rpc = 'http://127.0.0.1:8545'
  const provider = new ethers.JsonRpcProvider(rpc)
  provider.pollingInterval = 200

  const url = 'https://delaney-api.mud-chain.net' && 'http://127.0.0.1:3000'
  const client = axios.create({
    baseURL: url,
    timeout: 1000
  })

  const deadline = 1832068255

  let data

  const privateKey = 'f78a036930ce63791ea6ea20072986d8c3f16a6811f6a2583b0787c45086f769'
  const owner = new ethers.Wallet(privateKey, provider)

  const delegatorPrivateKey = 'f3d9247d078302fd876462e2036e05a35af8ca6124ba1a8fd82fc3ae89b2959d'
  const delegator = new ethers.Wallet(delegatorPrivateKey, provider)

  // 一批delegator私钥列表
  const privateKeys = [
    '95e06fa1a8411d7f6693f486f0f450b122c58feadbcee43fbd02e13da59395d5',
    '322673135bc119c82300450aed4f29373c06926f02a03f15d31cac3db1ee7716',
    '09100ba7616fcd062a5e507ead94c0269ab32f1a46fe0ec80056188976020f71',
    '5352cfb603f3755c71250f24aa1291e85dbc73a01e9c91e7568cd081b0be04db',
    delegatorPrivateKey
  ]

  // data = decodeReply(await client.get(`/users`, { params: { page: 1, page_size: 10, sort_field: 'star', sort_order: 'DESC', filters: { star: '>=3', id: '>=1' } } }))
  // console.log(data)

  // {
  //   data = decodeReply(await client.get(`/latest-claim?address=${owner.address}`))
  //   console.log('latest-claim', data)

  //   const { usdt, mud, reward_ids } = data
  //   const min_mud = parseInt(mud / 10)
  //   data = decodeReply(await client.post('/sign-claim', { address: owner.address, usdt, min_mud, reward_ids }))
  //   console.log('sign-claim', data)
  // }

  // {
  //   // 创建消息
  //   const address = '0x00000Be6819f41400225702D32d3dd23663Dd690'
  //   const usdt = '100000000000'
  //   const min_mud = '1'
  //   const reward_ids = 'xxxxxxxxxxxx'
  //   const deadline = 1888888888
  //   // 等效于Solidity中的keccak256(abi.encodePacked(account, tokenId))
  //   const msgHash = ethers.solidityPackedKeccak256(['address', 'uint256', 'uint256', 'string', 'uint256'], [address, usdt, min_mud, reward_ids, deadline])
  //   console.log(`msgHash：${msgHash}`)
  //   // 签名
  //   const messageHashBytes = ethers.getBytes(msgHash)
  //   const signature = await owner.signMessage(messageHashBytes)
  //   console.log(signature)
  //   return
  // }

  // 部署合约
  const pool = (await provider.getCode(poolAddress)).length > 2 ? new ethers.Contract(poolAddress, poolAbi, owner) : await deploy(owner, poolAbi, poolBytecode)
  console.log('contract pool address = ', pool.target)

  const delaney =
    (await provider.getCode(delaneyAddress)).length > 2
      ? new ethers.Contract(delaneyAddress, delaneyAbi, owner)
      : await deploy(owner, delaneyAbi, delaneyBytecode, [owner.address, owner.address, pool.target])
  console.log('contract delaney address = ', delaney.target)

  {
    let tx
    tx = await delaney.setConfig('period_duration', 1) // 方便测试每个周期设为1秒
    await tx.wait()

    tx = await delaney.setConfig('period_num', 3) // 方便测试一共3周期
    await tx.wait()

    tx = await delaney.setConfig('preson_reward_min_usdt', 0) // 个人奖励阈值
    await tx.wait()

    tx = await delaney.setConfig('team_reward_min_usdt', 0) // 团队奖励阈值
    await tx.wait()

    tx = await delaney.setConfig('claim_min_usdt', 1) // 奖励领取阈值
    await tx.wait()
  }

  // 用户注册，我们要注册一个5层的用户列表，方便后面测试
  let parent_ref = '888888'
  let needSetStar = true
  for (const privateKey of privateKeys) {
    const delegator = new ethers.Wallet(privateKey, provider)
    try {
      // 查一下有没有这个用户，有就不要注册了
      data = decodeReply(await client.get(`/user?address=${delegator.address}`))
    } catch (error) {
      data = decodeReply(await client.post('/create-user', { address: delegator.address, parent_ref }))
      console.log('create user', data)
    }
    if (data.star > 0) {
      needSetStar = false
    }
    parent_ref = data.ref
  }

  // ��改星级，为后面的奖励分配做好准备
  if (needSetStar) {
    let star = 5
    let delegatorPrivateKeys = [privateKey].concat(...privateKeys)
    const message = String(parseInt(new Date().getTime() / 1000))
    const signature = owner.signMessageSync(message)
    for (const privateKey of delegatorPrivateKeys) {
      const delegator = new ethers.Wallet(privateKey, provider)
      data = decodeReply(
        await client.post(
          '/set-user-star',
          { address: delegator.address, star },
          {
            headers: {
              Authorization: message + ' ' + signature
            }
          }
        )
      )
      console.log('set user star', data)
      star -= 1
    }
  }

  // 用户跟链交互进行质押
  if (true) {
    const deletagors = [delegator, owner]
    for (const delegator of deletagors) {
      // 发送交易
      const mud = 1000n * 1000000000000000000n
      const min_usdt = 1n * 1000000n
      const tx = await delaney.connect(delegator).delegate(min_usdt, deadline, { value: mud })

      // 后台记录质押信息
      data = decodeReply(await client.post('/delegate', { hash: tx.hash }))
      console.log('delegate', data)

      // 等待交易上链
      await tx.wait()

      // 给后台确认质押金额
      data = decodeReply(await client.post('/confirm-delegate', { hash: tx.hash }))
      console.log('confirm delegate', data)
    }
  }

  // 用户获取最新的奖励信息
  {
    await sleep(15000) // 等待3秒有静态奖励产出
    console.log('now is', parseInt(new Date().getTime() / 1000))
    data = decodeReply(await client.get(`/latest-claim?address=${owner.address}`))
    console.log('latest-claim', data)

    const { usdt, reward_ids } = data
    const min_mud = 1
    data = decodeReply(await client.post('/sign-claim', { address: owner.address, usdt, min_mud, reward_ids }))
    console.log('sign-claim', data)

    const { signature, deadline } = data
    const tx = await delaney.connect(owner).claim(usdt, min_mud, JSON.stringify(reward_ids), signature, deadline)
    console.log('call contract claim', tx.hash)

    data = decodeReply(await client.post('/claim', { hash: tx.hash, signature }))
    console.log('claim', data)

    // 确认领取
    data = decodeReply(await client.post(`/confirm-claim`, { hash: tx.hash }))
    console.log('confirm-claim', data)
  }

  // 用户跟链交互复投（重新质押）
  if (true) {
    const deletagors = [delegator, owner]
    let cid = 0
    for (const delegator of deletagors) {
      // 发送交易
      const tx = await delaney.connect(delegator).redelegate(cid++, deadline, { value: 0 }) // 复投不需要额外转token
      await tx.wait()

      data = decodeReply(await client.post('/confirm-redelegate', { hash: tx.hash }))
      console.log('confirm redelegate', data)
    }
  }

  // 用户跟链交互取消质押
  if (true) {
    // 因为价格没变，但是领走了奖励，所以项目方需要存mud进去才够用户取消质押
    let tx = await delaney.connect(owner).deposit(10000n * 1000000000000000000n)
    await tx.wait()

    await sleep(15000) // 上面复投了，不能马上取消质押
    const deletagors = [delegator, owner]
    let cid = 0
    for (const delegator of deletagors) {
      // 发送交易
      tx = await delaney.connect(delegator).undelegate(cid++, 0, deadline)
      data = decodeReply(await client.post('/undelegate', { hash: tx.hash }))
      console.log('undelegate', data)

      // 等待交易上链
      await tx.wait()

      // 给后台确认质押金额(不去确认我们也要可以)
      data = decodeReply(await client.post('/confirm-undelegate', { hash: tx.hash }))
      console.log('confirm undelegate', data)
    }
  }
}

main()
  .then(() => {})
  .catch((err) => {
    console.log('err', JSON.stringify(err))
  })
