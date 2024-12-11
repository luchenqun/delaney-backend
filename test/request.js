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
  const delaneyAddress = '0x862b96e016eE458aEeBB48F1Cc7Bdccc33bbfB8C'
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

  if (false) {
    const message = String(parseInt(new Date().getTime() / 1000))
    const signature = owner.signMessageSync(message)
    data = decodeReply(
      await client.get('/teams', {
        params: {
          page: 2,
          address: '0x00000Be6819f41400225702D32d3dd23663Dd690'
        },
        headers: {
          Authorization: message + ' ' + signature
        }
      })
    )
    console.log(data)
  }

  {
    // UniswapV2Router02 地址
    const ROUTER_ADDRESS = '0x219b7874c867b02210af91BE32d9331cFCd1EDf7'

    // UniswapV2Router02 ABI (部分)
    const ROUTER_ABI = ['function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)']

    // 代币地址
    const PUSDT_ADDRESS = '0x592d157a0765b43b0192Ba28F4b8cd4F50E326cF' // PUSDT 合约地址
    const WETH_ADDRESS = '0x82f9d23cB62Ec0016109B7C4b8dB34890FdBA0F0' // WETH 地址（Uniswap 常用中间代币）

    const amountIn = ethers.parseUnits('1', 18) // 输入 1 MUD（假设 MUD 是 18 位小数）
    const path = [WETH_ADDRESS, PUSDT_ADDRESS] // 兑换路径：MUD -> PUSDT
    const routerContract = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider)
    try {
      const amountsOut = await routerContract.getAmountsOut(amountIn, path)

      // 最终输出的 PUSDT 数量
      const amountOut = ethers.formatUnits(amountsOut[amountsOut.length - 1], 6) // 假设 PUSDT 是 6 位小数
      console.log(`1 MUD can be swapped for approximately ${amountOut} PUSDT`)
    } catch (error) {
      console.error('Error fetching quote:', error)
    }
  }
}

main()
  .then(() => {})
  .catch((err) => {
    console.log('err', err)
  })
