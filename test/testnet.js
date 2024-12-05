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
  const poolArtifact = await fs.readJSON(path.join(contractDir, 'UniswapV3Pool.sol/UniswapV3Pool.json'))
  const mudArtifact = await fs.readJSON(path.join(contractDir, 'MetaUserDAOToken.sol/MetaUserDAOToken.json'))
  const delaneyArtifact = await fs.readJSON(path.join(contractDir, 'Delaney.sol/Delaney.json'))
  const { abi: poolAbi, bytecode: poolBytecode } = poolArtifact
  const { abi: mudAbi, bytecode: mudBytecode } = mudArtifact
  const { abi: delaneyAbi, bytecode: delaneyBytecode } = delaneyArtifact
  const poolAddress = '0x60D8A47c075E7E95cd58C7C5598208F58c89242C'
  const mudAddress = '0x9922308f2d9202C0650347d06Cb2095F3dD234BE'
  const delaneyAddress = '0x7edf2bB5a1714455aCE412F0c06C623461669DBA'
  const delaneyDeploy = false

  const rpc = 'https://testnet-rpc.mud-chain.net'
  const provider = new ethers.JsonRpcProvider(rpc)
  provider.pollingInterval = 200

  const url = 'https://delaney-api.mud-chain.net'
  const client = axios.create({
    baseURL: url,
    timeout: 30000
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

  // 部署合约

  const pool = (await provider.getCode(poolAddress)).length > 2 ? new ethers.Contract(poolAddress, poolAbi, owner) : await deploy(owner, poolAbi, poolBytecode)
  console.log('contract pool address = ', pool.target)

  const mud = (await provider.getCode(mudAddress)).length > 2 ? new ethers.Contract(mudAddress, mudAbi, owner) : await deploy(owner, mudAbi, mudBytecode, [owner.address])
  console.log('contract mud address = ', mud.target)

  let delaney
  if (delaneyDeploy) {
    delaney = await deploy(owner, delaneyAbi, delaneyBytecode, [owner.address, owner.address, pool.target, mud.target])
    console.log('contract delaney address = ', delaney.target)
  } else {
    delaney = new ethers.Contract(delaneyAddress, delaneyAbi, owner)
    console.log('contract delaney address = ', delaney.target)
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

  // 修改星级，为后面的奖励分配做好准备
  if (needSetStar) {
    let star = 5
    let delegatorPrivateKeys = [privateKey].concat(...privateKeys)
    for (const privateKey of delegatorPrivateKeys) {
      const delegator = new ethers.Wallet(privateKey, provider)
      data = decodeReply(await client.post('/set-user-star', { address: delegator.address, star }))
      console.log('set user star', data)
      star -= 1
    }
  }

  // 质押之前，用户要给delaney合约授权扣除用户的mud
  {
    const deletagors = [delegator, owner]
    for (const delegator of deletagors) {
      let allowance = await mud.allowance(delegator.address, delaney.target)
      if (allowance == 0n) {
        const amount = 1000000000 * 1000000

        const tx = await mud.connect(delegator).approve(delaney.target, amount)
        await tx.wait()
      }
    }
  }

  {
    const tx = await delaney.setConfig('period_duration', 6) // 方便测试每个周期设为6秒
    await tx.wait()
  }

  // 用户跟链交互进行质押
  {
    const deletagors = [delegator, owner]
    for (const delegator of deletagors) {
      // 发送交易
      const mud = 1000 * 1000000
      const min_usdt = 1 * 1000000
      const tx = await delaney.connect(delegator).delegate(mud, min_usdt, deadline)

      // 后台记录质押信息
      data = decodeReply(await client.post('/delegate', { address: delegator.address, mud, hash: tx.hash, min_usdt }))
      console.log('delegate', data)

      // 等待交易上链
      await tx.wait()

      // 给后台确认质押金额(不去确认我们也要可以)
      data = decodeReply(await client.post('/confirm-delegate', { hash: tx.hash }))
      console.log('confirm delegate', data)
    }
  }

  // 用户获取最新的奖励信息
  {
    await sleep(30000) // 等待30秒有静态奖励产出
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

  {
    const tx = await delaney.setConfig('period_duration', 180) // 恢复周期设为180秒
    await tx.wait()
  }
}

main()
  .then(() => {})
  .catch((err) => {
    console.log('err', err)
  })
