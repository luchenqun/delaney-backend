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
  const poolAddress = '0x546bc6E008689577C69C42b9C1f6b4C923f59B5d' // '0x5338968f9646e4a865d76e07c2a6e340dd3ac462'
  const mudAddress = '0xDad56A6B5eed8567Fc4395d05b59D15077c2c888' // '0xf6EaC236757e82D6772E8bD02D36a0c791d78C51'
  const delaneyAddress = '0x33Add53fb1CDeF4A10BeE7249b66a685200DDd2f'

  const rpc = 'http://127.0.0.1:8545'
  const provider = new ethers.JsonRpcProvider(rpc)
  provider.pollingInterval = 200

  const url = 'http://127.0.0.1:3000'
  const client = axios.create({
    baseURL: url,
    timeout: 1000
  })

  const deadline = 1832068255

  let data

  const privateKey = 'f78a036930ce63791ea6ea20072986d8c3f16a6811f6a2583b0787c45086f769'
  const owner = new ethers.Wallet(privateKey, provider)

  // 一批delegator私钥列表
  const privateKeys = [
    '0x210806fe750e7db8277ec77c1057ce2d89ce7ea73800eb3e6d059856cba7353b', // user1 : 0x214806C3DdFe6552113727B7690F63d786Ca515c
    '0xf6c199176ea02534cf2d21b09daabfe4ba711b4e69f7cce7f1d3f997153fd981', // user2 : 0xAeCc6d97841DA9B3cBe4c3baEe5FeD4B0DAA87Eb
    '0xd34e37188552ca44c49dfed48f4c952287bdee7b2613388e8d6ca2e9924d87bc', // user3 : 0x7bb19037543f912B03Ea37eb113931752994efbf
    '0x26262517507589f62af44d76c0c97e52a97cdecafaa3b939a900ae5141c3459c', // user4 : 0x29F66f4d11e5131fFbCBB9b4386a72AD6Ee6C34A
    '0x8c599d5a08018f3e7d11e5947444a2ff0e2adb645a5c4d702099e0719e7a2e62', // user5 : 0x7Cf0c3334Fd5F3711998f89dc1cd7740b6f99Ef6
    '0x9e380fe08d9036fe0bfa78e26f92f1c2239113d0f14077571f48142e1fbcd311', // user6 : 0xCc9c891679715c4DD73cc077eaCE419aA5c56b23
    '0x828b48b5647125b7aed439b211b1fcb94e7a5312de9a5aae0ae2ce92c043e744', // user7 : 0x1fAAda07FBF48a068060133520688B9A8Da93A4c
    '0x0153c41a52f326d1b92f6700c1c02dffce8ee88ba2aa5a8d79fa37da75dc400f', // user8 : 0xf39dBF4419E5cdFFf4908d6dbE3Ca63E6ed40651
    '0x353a1dc342b61caa18a1723da71b32fd0fedf1c2d61647edd851447d118e3474', // user9 : 0x5c54e1F877317614d581F13367e146e4C1912678
    '0x96187a370462c2fca833802bbea264f1402d7c4e78f4da9cc9ca8148aadee9a1', // user10 : 0x6372F1991e76bccae50403f3b238Dbce3c841029
    '0x4bde4c6f6b771f820acd1a9b6f3639328a238b28d36b4eb8066b5505f074bd45', // user11 : 0x0B216B67a91F3DF92104a4873cfD456604ac6Ca5
    '0x29a1ff46474b28cecd13929b9cd57957f63995ab675ec9a347114a440f2d54ae', // user12 : 0x8848B5E48BdB542dcB32A1a01a7C9fb20b2Cc5c5
    '0x12e8c240b75ab2b90a7e85cdab95bcc5368d47ffeaa08246557d437f5374d608', // user13 : 0xEf360a80de4ecD2BDCCD70076f961300Dc5EE494
    '0x61821318322d2684889b09b4add848574c483837934261326a9c379cfac4a0e1', // user14 : 0xC4CE82095f6ECfad5241715b5dF63A887D6737B2
    '0xe3ab8a8692903d4df446ac6e9075b3969fe0379f1fdf3fdea055e90d4f289d30', // user15 : 0xac5e6d8d253724d87a65BBEBD50A409A0f6AA4Bd
    '0x5dc9dadeab89889d73795c7157303c5e19a395ffed8d50ed3cde5c638a81c93c', // user16 : 0x191737cC0dB58272e0880e05d1ca103f91eF258B
    '0xd67d3bcf17378955445312d9bf95eed1d32fd22346f301d76239dcc7d96c3a1e', // user17 : 0x5Bd607F8B7ea5fDde021d98469b254c70Fa246D7
    '0x836aca31dc66736722bd44597472f0c82b38f0811e0d6aa99b6cbf4cb6d9ff1b', // user18 : 0x80651a388b12946D0Aad095B19bdB58D8e591896
    '0xa7e77d454f23ce91e0135b0388b0e69eca1bffa208993d07be307fd78376ea2f', // user19 : 0xD588c6b0D786c66492C05B0b1Dd582a68203011E
    '0x2f0a9b88e084ccf71009dc5a1bbe9fc29b2767758ce79448714a83b465f9d9a1', // user20 : 0x2C5296967988f98F808bD17DE404339131e357a3
    '0x00217d6a1b0a6fa2f9a9a45d176a6cf45c1d107650fcbcf0fa1c324d6f20ec81', // user21 : 0xD9ce2A84Bf96bd03dEDa9E18010F3C4E1F07e6fC
    '0xcc10616c9364d2626c4e1ba35f4e6184170193a632bdeb05330e075f11dd6185', // user22 : 0xbAb191a441FD82752EBDD971244A196fdf6F532e
    '0x0b8b6a2cffb389eac4515263c43a4b663c690a6a2d978da61b1d25418154b254', // user23 : 0x118782A2f22476806d35fF1d37810F4547e869c4
    '0x1b9ce05e197be6428ac9406adfc5907170903c3a80b0282f1b689cf9d5de630c', // user24 : 0x89a099C36AceBc6DF72B765DE00B9C0096E5476C
    '0x52f7afbd7d1780dec171d9c7263734cd36aafbc4e594591c23f6857e1f90004d', // user25 : 0xFe6910E2bE13b45d40dad747d1F887fDA09eE649
    '0x6700a1e166e6312d7258c6cf70a1760a2d686e567489ad177ea336892ed21289', // user26 : 0x696e8261B6b3bd0a9E91E4f8051d6A6cb94D6466
    '0x8990f20d337dacef96555a3efe4e219178ebff9debfb420051ef9cf42188cc20', // user27 : 0x6994a9aecF148fBc4DB805bB17cA4c5959E88A03
    '0xfa0b4bbca2a715f16d12a2bd857d1d941fbf0fd5267deec0ea4c1b9fecbffe95', // user28 : 0x252C3A4EC99e75dC75891163c9dD223fEeBEC6D3
    '0x9dbac5485a0515bf7382e5f30753257f53632e90814c39ad79c2b15460f7ced5', // user29 : 0xaE8d8b0c6d38f666D44bAaEA5478e16E8eCc2b63
    '0x5352820e8722c00bd690231c998b36bbcd33ae82231aa15f55a7c6163d918afe', // user30 : 0x2A932F2c499D5aD275DEd38EBFcC35859dfb7A0c
    '0xf493aad7500b776dd264972698c7b202b44bac20faf9ec1bb66110763008a359', // user31 : 0xa67C2C03c1d8deC1C2B09aa8f4D09C1cb9D77aa2
    '0x52502a0d69ca96a517039ae24ae7a13c6ed6409d05c139578efabb6f301aeb68', // user32 : 0x9f4013991b497d81972B9b3D3EC293D1C561dd83
    '0xa1b2a90c3daa5a605c35727a96cdec4b3a1968ab50e6ad5b0ed05409a07aaf9d', // user33 : 0x368b0B9E3c0B3F5b63dC1f85e2Ef9265ef46FaDD
    '0xe22a23accad174fd9adbcc7fbaa2ffce13270adc465c443b889147cd11ed9156', // user34 : 0xC2e00A0A9CeEA23a4fd66439386757966F465536
    '0xef6ced825b1119bf0601a4e37ce7c10ec379c75719c32c553b0a6861cb094f51', // user35 : 0x9b7a023Ef777396f31b0Cb71054b5B24Bd500770
    '0xfc5b5c5135a4bad30a6f0057f10b01a1c3934c30c95caad85ad44e476ab603b4', // user36 : 0xD7FF53825c324Fc874acCF441b3f76DB8DA1Fb0E
    '0x08d75aebea9664cb70aa15bae748db43e223cdedf19afbfbf21179912c793125', // user37 : 0x40080f1E13F78f7A1ce6016c990c6Bf3b9DfCe24
    '0x763f9d1e839c50f49d544d1557b4f44ebdcdfe79ffbdd2c310cb34e5f786d503', // user38 : 0x6Fe9E07d6A756DdBB6Cc937A886a675F677E7e38
    '0x6df463b7fe56437a236889f913369b22a837afb4b3663ad393f2b1dfec0b2661', // user39 : 0x620F6170C424DC82FDd566A59ddB1b45fcfc60EF
    '0x39f6fdd9a89fcbc18181109f2a0076e319118e0add82030def23fd17b4410e30', // user40 : 0xD909FC5a7D8e0F392A0EDeA8274Ea738d652E3f1
    '0x6639a9ba355a317a32632041f85bdb95a7ab02506322da49f6d681990b9c03b4', // user41 : 0x74E527A9d9C05361DA51a4c4ef0Cb753b483dCF6
    '0xf2c322d367deb092cb3cf57673044732ffe6eca30f8c241f52c82379a22b03ad', // user42 : 0xB9522BEdec52ccb36e799E82b676d38926597179
    '0xa8a9c744b5120ff369fc006eb219ad56c34bd9f399d1f3f00e58a3c177023788', // user43 : 0x08C6b9Db48dEBF9505C77899Ca732a50a1904BA6
    '0xc78b3c49eee1828d0b6fbc1e827e3e13e945e0f8652bef33394918eebb2686b5', // user44 : 0x59002Ff9cC8320180F7e3e4756a26C5242d52f68
    '0x485963d34e78b376b2b898062236a57dc0c9e93796848351e7539c84e2f84f3b', // user45 : 0xE01cEC4d46ab62d7d3020a0AA548FB6f3f9c23C8
    '0xa91d5134309840ac61e22d0597186f95138adfd38ebd65e5cc06c0feaa1e5bc7' // user46 : 0xC92237f6d5ad9A12935b758F546C34cE84C6A236
  ]

  const delegators = []
  for (const privateKey of privateKeys) {
    const user = new ethers.Wallet(privateKey, provider)
    delegators.push(user)
  }

  // 部署合约
  const pool = (await provider.getCode(poolAddress)).length > 2 ? new ethers.Contract(poolAddress, poolAbi, owner) : await deploy(owner, poolAbi, poolBytecode)
  console.log('contract pool address = ', pool.target)

  const mud = (await provider.getCode(mudAddress)).length > 2 ? new ethers.Contract(mudAddress, mudAbi, owner) : await deploy(owner, mudAbi, mudBytecode, [owner.address])
  console.log('contract mud address = ', mud.target)

  const delaney =
    (await provider.getCode(delaneyAddress)).length > 2
      ? new ethers.Contract(delaneyAddress, delaneyAbi, owner)
      : await deploy(owner, delaneyAbi, delaneyBytecode, [owner.address, owner.address, pool.target, mud.target])
  console.log('contract delaney address = ', delaney.target)

  // owner 给delaney合约授权扣除用户的mud
  console.log('--------> allowance & approve')
  const amount = ethers.parseUnits('100000', 18)
  let allowance = await mud.allowance(owner.address, delaney.target)
  if (allowance == 0n) {
    const tx = await mud.connect(owner).approve(delaney.target, amount)
    await tx.wait()
    console.log('owner:', owner.address, ' approve: ', amount)
  }

  for (const delegator of delegators) {
    const req = { to: delegator.address, value: ethers.parseEther('100') }
    const tx = await owner.sendTransaction(req)
    await tx.wait()

    const mintTx = await mud.mint(delegator.address, amount)
    await mintTx.wait()

    let allowance = await mud.allowance(delegator.address, delaney.target)
    if (allowance == 0n) {
      const tx = await mud.connect(delegator).approve(delaney.target, amount)
      await tx.wait()
      console.log('user:', delegator.address, ' approve: ', amount)
    }
  }
  console.log('--------> set contract config')
  {
    let tx
    tx = await delaney.setConfig('period_duration', 30) // 方便测试每个周期设为6秒
    await tx.wait()

    tx = await delaney.setConfig('period_num', 3) // 方便测试一共3周期
    await tx.wait()

    tx = await delaney.setConfig('person_reward_min_usdt', 0) // 个人奖励阈值
    await tx.wait()

    tx = await delaney.setConfig('team_reward_min_usdt', 0) // 团队奖励阈值
    await tx.wait()

    tx = await delaney.setConfig('team_level1_sub_usdt', 1) // 成为1星的直推条件
    await tx.wait()

    tx = await delaney.setConfig('team_level1_team_usdt', 1) // 成为1星的团队条件
    await tx.wait()

    tx = await delaney.setConfig('claim_min_usdt', 1000000) // 奖励领取阈值
    await tx.wait()

    
        // 获取配置
    const data = decodeReply(await client.get(`/configs`))
    console.log('config: ', data)
  }

  // 用户注册，我们要注册一个5层的用户列表，方便后面测试
  console.log('--------> create user')
  let parentRefs = ['888888']
  let needSetStar = true
  for (let i = 0; i < delegators.length; i++) {
    try {
      // 检查用户是否已存在
      data = decodeReply(await client.get(`/user?address=${delegators[i].address}`))
    } catch (error) {
      // 用户不存在，进行注册
      const newUserData = {
        address: delegators[i].address,
        parent_ref: i < 30 ? parentRefs[Math.floor(i / 2)] : parentRefs[i - 15]
      }

      data = decodeReply(await client.post('/create-user', newUserData))
      console.log('创建用户:', data)

      parentRefs.push(data.ref)
    }
    // if (data.star > 0) {
    //   needSetStar = false
    // }
  }

  // 修改星级，为后面的奖励分配做好准备
  //   if (needSetStar) {
  //     for (let i = 0; i < delegators.length; i++) {
  //       let star = 0
  //       if (i === 0 || i === 2) {
  //         star = 3
  //       } else if (i === 1 || i === 4) {
  //         star = 2
  //       } else if (i === 3 || i === 6) {
  //         star = 1
  //       } else if (i === 7) {
  //         star = 0
  //       }

  //       data = decodeReply(await client.post('/set-user-star', { address: delegators[i].address, star }))
  //       console.log('set user star', data)
  //     }
  //   }

  const delegateFunc = async (delegator) => {
    const mud = 1000 * 1000000
    const min_usdt = 1 * 1000000

    try {
      const tx = await delaney.connect(delegator).delegate(mud, min_usdt, deadline)

      // 后台记录质押信息
      data = decodeReply(await client.post('/delegate', { hash: tx.hash }))
      console.log('delegate', data)

      // 等待交易上链
      await tx.wait()

      // 给后台确认质押金额(不去确认我们也要可以)
      data = decodeReply(await client.post('/confirm-delegate', { hash: tx.hash }))
      console.log('confirm delegate', data)
    } catch (error) {
        console.log('delegate error: ', error)
        return err
    }
<<<<<<< Updated upstream

=======
>>>>>>> Stashed changes
    return data
  }

  const undelegators = []
  // owner进行质押
<<<<<<< Updated upstream
  console.log('--------> owner delegate')
  const ownerData = await delegateFunc(owner)
  console.log('owner delegate', ownerData)
  // 用户跟链交互进行质押
  for (const delegator of delegators) {
    // 发送交易
    await delegateFunc(delegator)
    await sleep(3*1000)
=======
  {
    console.log('--------> owner delegate')
    try {
      await delegateFunc(owner)
      // 用户跟链交互进行质押
      for (let i = 0; i < delegators.length; i++) {
        // 发送交易

        data = await delegateFunc(delegators[i])
        if (i === 4 || i === 8 || i === 14) {
          undelegators.push({ delegate: data, delegator: delegators[i] })
        }
        await sleep(3 * 1000)
      }
    } catch (error) {
      console.log('delegate error: ', error)
    }
>>>>>>> Stashed changes
  }

  //   // 用户获取最新的奖励信息
  //   {
  //     await sleep(15000) // 等待3秒有静态奖励产出
  //     console.log('now is', parseInt(new Date().getTime() / 1000))
  //     data = decodeReply(await client.get(`/latest-claim?address=${owner.address}`))
  //     console.log('latest-claim', data)

  //     const { usdt, reward_ids } = data
  //     const min_mud = 1
  //     data = decodeReply(await client.post('/sign-claim', { address: owner.address, usdt, min_mud, reward_ids }))
  //     console.log('sign-claim', data)

  //     const { signature, deadline } = data
  //     const tx = await delaney.connect(owner).claim(usdt, min_mud, JSON.stringify(reward_ids), signature, deadline)
  //     console.log('call contract claim', tx.hash)

  //     data = decodeReply(await client.post('/claim', { hash: tx.hash, signature }))
  //     console.log('claim', data)

  //     // 确认领取
  //     data = decodeReply(await client.post(`/confirm-claim`, { hash: tx.hash }))
  //     console.log('confirm-claim', data)
  //   }

  {
<<<<<<< Updated upstream
    data = decodeReply(await client.get(`/users`))
    console.log(data)
=======
    data = decodeReply(await client.get(`/dynamic-rewards?page=1&page_size=10`))
    console.log('dynamic-rewards', data)

    data = decodeReply(await client.get(`/static-rewards?page=1&page_size=10`))
    console.log('static-rewards', data)

    for (const delegator of delegators) {
      data = decodeReply(await client.get(`/dynamic-reward-user-stat?address=${delegator.address}`))
      console.log('dynamic-reward-user-stat', data)

      data = decodeReply(await client.get(`/static-reward-user-stat?address=${delegator.address}`))
      console.log('static-reward-user-stat', data)
    }
  }

  // 用户获取最新的奖励信息
  {
    await sleep(3000) // 等待3秒有静态奖励产出
    for (const delegator of delegators) {
      try {
        console.log('now is', parseInt(new Date().getTime() / 1000))
        data = decodeReply(await client.get(`/latest-claim?address=${delegator.address}`))
        console.log('latest-claim', data)
        if (data.usdt === 0 || (data.reward_ids.length === 0 && data.static_ids.length === 0)) {
          continue
        }

        const { usdt, reward_ids } = data
        const min_mud = 1
        data = decodeReply(await client.post('/sign-claim', { address: delegator.address, usdt, min_mud, reward_ids }))
        console.log('sign-claim', data)

        const { signature, deadline } = data
        const tx = await delaney.connect(delegator).claim(usdt, min_mud, JSON.stringify(reward_ids), signature, deadline)
        console.log('call contract claim', tx.hash)

        // 领取奖励
        data = decodeReply(await client.post('/claim', { hash: tx.hash, signature }))
        console.log('claim', data)

        // 确认领取奖励
        data = decodeReply(await client.post(`/confirm-claim`, { hash: tx.hash }))
        console.log('confirm-claim', data)

        data = decodeReply(await client.get(`/claim-user-stat?address=${delegator.address}`))
        console.log('claim-user-stat', data)

        data = decodeReply(await client.get(`/claim?signature=${signature}`))
        console.log('get claim', data)
      } catch (error) {
        console.log('claim error: ', error)
      }
    }
  }

  // 取消质押
  {
    for (const undelegator of undelegators) {
      const { delegate, delegator } = undelegator
      try {
        const min_mud = 1
        const tx = await delaney.connect(delegator).undelegate(delegate.cid, min_mud, deadline)

        // 后台记录质押信息
        data = decodeReply(await client.post('/undelegate', { hash: tx.hash }))
        console.log('undelegate', data)

        // 等待交易上链
        await tx.wait()

        // 给后台确认质押金额(不去确认我们也要可以)
        data = decodeReply(await client.post('/confirm-undelegate', { hash: tx.hash }))
        console.log('confirm undelegate', data)
      } catch (error) {
        console.log('undelegate error: ', error)
      }
    }
>>>>>>> Stashed changes
  }

  // // 用户列表
  // {
  //   const message = String(parseInt(new Date().getTime() / 1000))
  //   const signature = owner.signMessageSync(message)

  //   const data = decodeReply(
  //     await client.get(`/users?page=1&page_size=10`, {
  //       headers: {
  //         Authorization: message + ' ' + signature
  //       }
  //     })
  //   )
  //   console.log('--------> users', data)
  // }

  // // 获取团队的列表
  // {
  //   const message = String(parseInt(new Date().getTime() / 1000))
  //   const signature = owner.signMessageSync(message)
  //   for (const delegator of delegators) {
  //     const data = decodeReply(
  //       await client.get(`/teams?address=${delegator.address}&page=1&page_size=10`, {
  //         headers: {
  //           Authorization: message + ' ' + signature
  //         }
  //       })
  //     )
  //     console.log('--------> teams', data)
  //   }
  // }

  // // 消息记录
  // {
  //   const data = decodeReply(await client.get(`/messages?page=1&page_size=10`))
  //   console.log('--------> messages', data)
  // }
}

main()
  .then(() => {})
  .catch((err) => {
    console.log('err', JSON.stringify(err))
  })
