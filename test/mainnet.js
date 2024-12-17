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

  const delaneyAddress = '0x546bc6E008689577C69C42b9C1f6b4C923f59B5d'
  const pairAddress = '0x7F202fda32D43F726C77E2B3288e6c6f3e7e341A'
  const usdtAddress = '0x592d157a0765b43b0192Ba28F4b8cd4F50E326cF'

  const delaneyDeploy = false

  const rpc = 'https://testnet-rpc.mud-chain.net'
  const provider = new ethers.JsonRpcProvider(rpc)
  provider.pollingInterval = 200

  const url = 'https://delaney-api.mud-chain.net'
  const client = axios.create({
    baseURL: url,
    timeout: 30000
  })

  let data

  const deadline = 1888888888

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
  let delaney
  if (delaneyDeploy) {
    delaney = await deploy(owner, delaneyAbi, delaneyBytecode, [owner.address, owner.address, pairAddress, usdtAddress])
  } else {
    delaney = new ethers.Contract(delaneyAddress, delaneyAbi, owner)
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

  // {
  //   let tx
  //   tx = await delaney.setConfig('person_invest_min_usdt', 1) // 个人最小投资额度
  //   await tx.wait()

  //   tx = await delaney.setConfig('period_duration', 30) // 方便测试每个周期设为6秒
  //   await tx.wait()

  //   tx = await delaney.setConfig('period_num', 3) // 方便测试一共3周期
  //   await tx.wait()

  //   tx = await delaney.setConfig('person_reward_min_usdt', 0) // 个人奖励阈值
  //   await tx.wait()

  //   tx = await delaney.setConfig('team_reward_min_usdt', 0) // 团队奖励阈值
  //   await tx.wait()

  //   tx = await delaney.setConfig('team_level1_sub_usdt', 1) // 成为1星的直推条件
  //   await tx.wait()

  //   tx = await delaney.setConfig('team_level1_team_usdt', 1) // 成为1星的团队条件
  //   await tx.wait()

  //   tx = await delaney.setConfig('claim_min_usdt', 1000000) // 奖励领取阈值
  //   await tx.wait()
  // }

  // 用户跟链交互进行质押
  {
    const deletagors = [delegator, owner]
    for (const delegator of deletagors) {
      // 发送交易
      const mud = 1n * 1000000000000000000n
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

  {
    // const tx = await delaney.setConfig('period_duration', 180) // 恢复周期设为180秒
    // await tx.wait()
  }
}

main()
  .then(() => {})
  .catch((err) => {
    console.log('err', err)
  })
